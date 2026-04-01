/**
 * REST API für Admin-Aktionen und n8n/Cron.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../lib/db');
const statusMachine = require('../lib/status-machine');
const tourActions = require('../lib/tour-actions');
const matterport = require('../lib/matterport');
const { getMatterportId, normalizeTourRow } = require('../lib/normalize');
const { sendMailDirect, getGraphConfig } = require('../lib/microsoft-graph');
const { getAutomationSettings } = require('../lib/settings');

function requireApiKey(req, res, next) {
  const key = req.get('X-API-Key') || req.query.apiKey;
  if (key === process.env.CRON_API_KEY || key === process.env.N8N_API_KEY) {
    return next();
  }
  if (req.session && req.session.admin) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized' });
}

router.use(requireApiKey);

router.get('/tours', async (req, res) => {
  const { status, expiringSoon, awaitingPayment } = req.query;
  let q = 'SELECT * FROM tour_manager.tours WHERE 1=1';
  const params = [];
  let i = 1;
  if (status) {
    q += ` AND status = $${i++}`;
    params.push(status);
  }
  if (expiringSoon === 'true') {
    q += ` AND COALESCE(term_end_date, ablaufdatum) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`;
  }
  if (awaitingPayment === 'true') {
    q += ` AND status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'`;
  }
  q += ' ORDER BY COALESCE(term_end_date, ablaufdatum) ASC NULLS LAST';
  const r = await pool.query(q, params);
  res.json(r.rows.map(normalizeTourRow));
});

router.get('/tours/:id', async (req, res) => {
  const { id } = req.params;
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [id]);
  if (!tour.rows[0]) return res.status(404).json({ error: 'Tour nicht gefunden' });
  const logs = await pool.query(
    'SELECT * FROM tour_manager.actions_log WHERE tour_id = $1 ORDER BY created_at DESC',
    [id]
  );
  const invoices = await pool.query(
    'SELECT * FROM tour_manager.renewal_invoices WHERE tour_id = $1 ORDER BY created_at DESC',
    [id]
  );
  res.json({
    ...normalizeTourRow(tour.rows[0]),
    actions_log: logs.rows,
    renewal_invoices: invoices.rows,
  });
});

router.post('/tours/:id/send-renewal-email', async (req, res) => {
  try {
    const actor = req.session?.admin ? 'admin' : 'system';
    const ref = req.session?.admin?.email || null;
    const templateKey = String(req.body?.templateKey || 'renewal_request').trim().toLowerCase();
    const copyToMe = req.body?.copyToMe === true || req.body?.copyToMe === '1' || req.body?.copyToMe === 'on';
    const r = templateKey === 'archive_notice'
      ? await tourActions.sendArchiveNoticeEmail(req.params.id, actor, ref)
      : await tourActions.sendRenewalEmail(req.params.id, actor, ref, {
        templateKey,
        createActionLinks: templateKey === 'renewal_request',
        setAwaitingDecision: templateKey === 'renewal_request',
      });

    let copySent = false;
    let copyError = null;
    if (copyToMe && ref && (r?.success !== false)) {
      const copySubject = `[Kopie] ${r.subject || (templateKey === 'archive_notice' ? 'Archiv-Hinweis' : 'Verlängerungsanfrage')}`;
      const copyHtml = `
        <p><strong>Dies ist eine Kopie der soeben versendeten Kunden-E-Mail.</strong></p>
        <p><small>Empfänger Kunde: ${r.recipientEmail || '-'}</small></p>
        <hr>
        ${r.html || `<pre style="white-space:pre-wrap;">${String(r.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`}
      `;
      const copyText = `Dies ist eine Kopie der soeben versendeten Kunden-E-Mail.\nEmpfänger Kunde: ${r.recipientEmail || '-'}\n\n${r.text || ''}`;
      const copyRes = await sendMailDirect({
        mailboxUpn: r.mailboxUpn || getGraphConfig().mailboxUpn,
        to: ref,
        subject: copySubject,
        htmlBody: copyHtml,
        textBody: copyText,
      });
      copySent = !!copyRes.success;
      copyError = copyRes.success ? null : (copyRes.error || 'Kopie konnte nicht versendet werden');
    }

    res.json({
      ...r,
      copySent,
      copyError,
      templateKey,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/tours/:id/send-archive-notice-email', async (req, res) => {
  try {
    const actor = req.session?.admin ? 'admin' : 'system';
    const ref = req.session?.admin?.email || null;
    const r = await tourActions.sendArchiveNoticeEmail(req.params.id, actor, ref);
    res.json(r.success ? { success: true } : { error: r.error });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/tours/:id/check-payment', async (req, res) => {
  try {
    const r = await tourActions.checkPayment(req.params.id);
    const invoices = await pool.query(
      `SELECT id,
              invoice_number,
              invoice_status,
              due_at,
              amount_chf
       FROM tour_manager.renewal_invoices
       WHERE tour_id = $1
         AND invoice_status IN ('sent','overdue','paid')
       ORDER BY CASE
                  WHEN invoice_status = 'overdue' THEN 0
                  WHEN invoice_status = 'sent' THEN 1
                  ELSE 2
                END,
                COALESCE(due_at, paid_at, sent_at, created_at) ASC NULLS LAST
       LIMIT 1`,
      [req.params.id]
    ).catch(() => ({ rows: [] }));
    const nextInvoice = invoices.rows[0] || null;
    const dueDateRaw = nextInvoice?.due_at ? new Date(nextInvoice.due_at) : null;
    const dueDate = dueDateRaw ? dueDateRaw.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
    const invoiceNo = nextInvoice?.invoice_number || `Rechnung #${nextInvoice?.id || '?'}`;
    const isPaid = nextInvoice?.invoice_status === 'paid';
    const isOverdue = !isPaid && dueDateRaw && dueDateRaw < new Date();
    const isOpen = !isPaid && !isOverdue && !!nextInvoice;
    let paymentState = 'none';
    let summary = 'Zahlung wurde geprüft. Aktuell gibt es keine offenen Zahlungen.';
    if (nextInvoice) {
      if (isPaid) {
        paymentState = 'paid';
        summary = `Zahlung wurde geprüft. ${invoiceNo} ist als bezahlt markiert.`;
      } else if (dueDate) {
        paymentState = isOverdue ? 'overdue' : 'open';
        summary = isOverdue
          ? `Zahlung wurde geprüft. ${invoiceNo} ist überfällig seit ${dueDate}.`
          : `Zahlung wurde geprüft. ${invoiceNo} ist offen (fällig am ${dueDate}).`;
      } else {
        paymentState = isOpen ? 'open' : 'none';
        summary = `Zahlung wurde geprüft. ${invoiceNo} ist offen.`;
      }
    }
    res.json({ ...r, summary, nextInvoice, paymentState });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/tours/:id/decline', async (req, res) => {
  try {
    await tourActions.declineTour(req.params.id, req.session?.admin?.email);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/tours/:id/archive-now', async (req, res) => {
  try {
    await tourActions.archiveTourNow(req.params.id, req.session?.admin?.email);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/tours/:id/unarchive-matterport', async (req, res) => {
  try {
    const tour = await pool.query('SELECT matterport_space_id FROM tour_manager.tours WHERE id = $1', [req.params.id]);
    if (!tour.rows[0]?.matterport_space_id) {
      return res.status(400).json({ error: 'Tour hat keine Matterport-Verknüpfung' });
    }
    const r = await matterport.unarchiveSpace(tour.rows[0].matterport_space_id);
    if (!r.success) return res.status(400).json({ error: r.error || 'Reaktivierung fehlgeschlagen' });
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_state = 'active', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/cron/send-expiring-soon', async (req, res) => {
  const automation = await getAutomationSettings();
  if (!automation.expiringMailEnabled) {
    return res.json({ processed: 0, errors: 0, skipped: true, reason: 'expiringMailEnabled=false' });
  }
  const leadDays = Math.max(0, parseInt(automation.expiringMailLeadDays || 30, 10));
  const cooldownDays = Math.max(0, parseInt(automation.expiringMailCooldownDays || 14, 10));
  const batchLimit = Math.max(1, parseInt(automation.expiringMailBatchLimit || 50, 10));
  const r = await pool.query(
    `SELECT id FROM tour_manager.tours
     WHERE status IN ('ACTIVE','EXPIRING_SOON')
     AND (term_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1::int * INTERVAL '1 day')
          OR ablaufdatum BETWEEN CURRENT_DATE AND CURRENT_DATE + ($1::int * INTERVAL '1 day'))
     AND (last_email_sent_at IS NULL OR last_email_sent_at < NOW() - ($2::int * INTERVAL '1 day'))
     LIMIT $3`,
    [leadDays, cooldownDays, batchLimit]
  );
  let ok = 0, err = 0;
  for (const row of r.rows) {
    try {
      await tourActions.sendRenewalEmail(String(row.id), 'system', null, {
        templateKey: automation.expiringMailTemplateKey || 'renewal_request',
        minHoursBetweenSends: cooldownDays * 24,
        createActionLinks: !!automation.expiringMailCreateActionLinks,
        setAwaitingDecision: !!automation.expiringMailCreateActionLinks,
      });
      ok++;
    } catch (e) {
      err++;
      console.error('send-renewal-email', row.id, e.message);
    }
  }
  res.json({ processed: ok, errors: err, matched: r.rows.length, leadDays, cooldownDays, batchLimit });
});

router.post('/cron/check-payments', async (req, res) => {
  const automation = await getAutomationSettings();
  if (!automation.paymentCheckEnabled) {
    return res.json({ processed: 0, changed: 0, skipped: true, reason: 'paymentCheckEnabled=false' });
  }
  const batchLimit = Math.max(1, parseInt(automation.paymentCheckBatchLimit || 250, 10));
  const r = await pool.query(
    `SELECT DISTINCT tour_id FROM tour_manager.renewal_invoices
     WHERE invoice_status IN ('sent','overdue')
     LIMIT $1`,
    [batchLimit]
  );
  let ok = 0;
  for (const row of r.rows) {
    try {
      const x = await tourActions.checkPayment(String(row.tour_id));
      if (x.changed) ok++;
    } catch (e) {
      console.error('check-payment', row.tour_id, e.message);
    }
  }
  res.json({ processed: r.rows.length, changed: ok, batchLimit });
});

router.post('/cron/archive-expired', async (req, res) => {
  const automation = await getAutomationSettings();
  if (!automation.expiryPolicyEnabled) {
    return res.json({ processed: 0, errors: 0, skipped: true, reason: 'expiryPolicyEnabled=false' });
  }
  const setPendingAfterDays = Math.max(0, parseInt(automation.expirySetPendingAfterDays || 0, 10));
  const archiveAfterDays = Math.max(0, parseInt(automation.expiryArchiveAfterDays || 0, 10));
  const lockOnPending = !!automation.expiryLockMatterportOnPending;

  const pendingCandidates = await pool.query(
    `SELECT id, status, matterport_space_id, tour_url
     FROM tour_manager.tours
     WHERE status IN ('ACTIVE','EXPIRING_SOON','AWAITING_CUSTOMER_DECISION','CUSTOMER_ACCEPTED_AWAITING_PAYMENT')
     AND COALESCE(term_end_date, ablaufdatum) < CURRENT_DATE - ($1::int * INTERVAL '1 day')
     LIMIT 300`,
    [setPendingAfterDays]
  );
  let markedPending = 0;
  let lockedMatterport = 0;
  let err = 0;
  for (const row of pendingCandidates.rows) {
    try {
      await pool.query(
        `UPDATE tour_manager.tours
         SET status = 'EXPIRED_PENDING_ARCHIVE', updated_at = NOW()
         WHERE id = $1`,
        [row.id]
      );
      markedPending++;
      if (lockOnPending) {
        const spaceId = row.matterport_space_id || getMatterportId(row);
        if (spaceId) {
          const lockResult = await matterport.archiveSpace(spaceId);
          if (lockResult?.success) {
            await pool.query(
              `UPDATE tour_manager.tours
               SET matterport_state = 'inactive', updated_at = NOW()
               WHERE id = $1`,
              [row.id]
            );
            lockedMatterport++;
          }
        }
      }
    } catch (e) {
      err++;
      console.error('mark-expired-pending', row.id, e.message);
    }
  }

  const archiveCandidates = await pool.query(
    `SELECT id FROM tour_manager.tours
     WHERE status IN ('EXPIRED_PENDING_ARCHIVE','CUSTOMER_DECLINED')
     AND COALESCE(term_end_date, ablaufdatum) < CURRENT_DATE - ($1::int * INTERVAL '1 day')
     LIMIT 300`,
    [archiveAfterDays]
  );
  let archived = 0;
  for (const row of archiveCandidates.rows) {
    try {
      await tourActions.archiveTourNow(String(row.id), 'system');
      archived++;
    } catch (e) {
      err++;
      console.error('archive-expired', row.id, e.message);
    }
  }
  res.json({
    processed: archived,
    archived,
    markedPending,
    lockedMatterport,
    errors: err,
    setPendingAfterDays,
    archiveAfterDays,
    lockOnPending,
  });
});

/** Matterport auto-link: tour_url ?m=XXX → matterport_space_id + matterport_created_at + matterport_state */
router.post('/cron/auto-link-matterport', async (req, res) => {
  const automation = await getAutomationSettings();
  if (!automation.matterportAutoLinkEnabled) {
    return res.json({ linked: 0, skipped: 0, errors: 0, duplicate: 0, total: 0, disabled: true, reason: 'matterportAutoLinkEnabled=false' });
  }
  const batchLimit = Math.max(1, parseInt(automation.matterportAutoLinkBatchLimit || 500, 10));
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_created_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_state VARCHAR(50)');
  const linkWithoutVerify = matterport.allowsLinkWithoutVerify();
  const unlinked = await pool.query(`
    SELECT id, tour_url FROM tour_manager.tours
    WHERE (matterport_space_id IS NULL OR TRIM(matterport_space_id) = '')
    AND tour_url IS NOT NULL AND tour_url != ''
    LIMIT $1
  `, [batchLimit]);
  let linked = 0, skipped = 0, errors = 0, duplicate = 0;
  for (const t of unlinked.rows) {
    const mpId = getMatterportId(t);
    if (!mpId) { skipped++; continue; }
    const existing = await pool.query(
      `SELECT id FROM tour_manager.tours
       WHERE id != $1
         AND matterport_space_id = $2
       LIMIT 1`,
      [t.id, mpId]
    );
    if (existing.rows[0]?.id) { duplicate++; continue; }
    const { model, error } = await matterport.getModel(mpId);
    if (error || !model) {
      if (linkWithoutVerify) {
        await pool.query(
          `UPDATE tour_manager.tours SET matterport_space_id = $1, updated_at = NOW() WHERE id = $2`,
          [mpId, t.id]
        );
        linked++;
        continue;
      }
      errors++;
      continue;
    }
    const matterportCreated = model?.created || null;
    const matterportState = model?.state || null;
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_space_id = $1, matterport_created_at = $2::timestamptz, matterport_state = $3, updated_at = NOW() WHERE id = $4`,
      [mpId, matterportCreated, matterportState, t.id]
    );
    linked++;
  }
  res.json({ linked, skipped, errors, duplicate, total: unlinked.rows.length, batchLimit });
});

/** Matterport-Erstellungsdaten nachtragen (für Touren mit matterport_space_id, ohne matterport_created_at) */
router.post('/cron/refresh-matterport-created', async (req, res) => {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_created_at TIMESTAMPTZ');
  const rows = await pool.query(`
    SELECT id, matterport_space_id FROM tour_manager.tours
    WHERE matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != ''
    AND matterport_created_at IS NULL
  `);
  let updated = 0;
  let errors = 0;
  let lastError = null;
  for (const t of rows.rows) {
    const { model, error } = await matterport.getModel(t.matterport_space_id);
    if (error || !model?.created) {
      errors++;
      if (error) lastError = error;
      continue;
    }
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_created_at = $1::timestamptz, updated_at = NOW() WHERE id = $2`,
      [model.created, t.id]
    );
    updated++;
  }
  res.json({ updated, total: rows.rows.length, errors, errorHint: lastError || undefined });
});

/** Matterport Space-Status synchronisieren (active, inactive, processing, etc.) */
router.post('/cron/sync-matterport-status', async (req, res) => {
  const automation = await getAutomationSettings();
  if (!automation.matterportStatusSyncEnabled) {
    return res.json({ updated: 0, total: 0, errors: 0, disabled: true, reason: 'matterportStatusSyncEnabled=false' });
  }
  const batchLimit = Math.max(1, parseInt(automation.matterportStatusSyncBatchLimit || 500, 10));
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_state VARCHAR(50)');
  const rows = await pool.query(`
    SELECT id, matterport_space_id FROM tour_manager.tours
    WHERE matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != ''
    LIMIT $1
  `, [batchLimit]);
  const matterportResult = await matterport.listModels();
  if (matterportResult.error) {
    return res.json({ updated: 0, total: rows.rows.length, errors: rows.rows.length, errorHint: matterportResult.error });
  }
  const mpStateById = new Map((matterportResult.results || []).map((m) => [m.id, m.state || null]));
  let updated = 0;
  for (const t of rows.rows) {
    const mpId = String(t.matterport_space_id).trim();
    const mpState = mpStateById.has(mpId) ? mpStateById.get(mpId) : 'unknown';
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_state = $1, updated_at = NOW() WHERE id = $2`,
      [mpState, t.id]
    );
    updated++;
  }
  res.json({ updated, total: rows.rows.length, errors: 0, batchLimit });
});

/** Matterport-Zugehörigkeit prüfen: Space gehört zu unserem Account (own) oder fremdem (fremde) */
router.post('/cron/check-matterport-ownership', async (req, res) => {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');
  const { ids: ownIds, error: listError } = await matterport.getOwnModelIds();
  if (listError) {
    return res.json({ error: listError, own: 0, fremde: 0, skipped: 0, total: 0 });
  }
  const rows = await pool.query(`
    SELECT id, matterport_space_id, tour_url
    FROM tour_manager.tours
    WHERE (matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != '')
       OR (tour_url IS NOT NULL AND tour_url ~ '[?&]m=[a-zA-Z0-9_-]+')
  `);
  let own = 0, fremde = 0, skipped = 0;
  for (const t of rows.rows) {
    const mpId = getMatterportId(t);
    if (!mpId) { skipped++; continue; }
    const isOwn = ownIds.has(mpId);
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_is_own = $1, updated_at = NOW() WHERE id = $2`,
      [isOwn, t.id]
    );
    isOwn ? own++ : fremde++;
  }
  res.json({ own, fremde, skipped, total: rows.rows.length });
});

module.exports = router;
