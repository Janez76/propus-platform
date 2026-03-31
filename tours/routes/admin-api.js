/**
 * JSON-API für das React-Admin-Panel (tour manager).
 * Gemountet unter /admin/api (in server.js nach requireAdminOrRedirect).
 *
 * Delegiert alle fachliche Logik in bestehende tours/lib/* Module –
 * kein Duplikat von Businesslogik, nur Transport + Validierung.
 */

'use strict';

const express = require('express');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../lib/db');
const { normalizeTourRow } = require('../lib/normalize');
const { logAction } = require('../lib/actions');
const matterport = require('../lib/matterport');
const exxas = require('../lib/exxas');
const portalTeam = require('../lib/portal-team');
const userProfiles = require('../lib/user-profiles');
const bankImport = require('../lib/bank-import');
const customerLookup = require('../lib/customer-lookup');
const {
  getDashboardWidgets,
  saveDashboardWidgets,
  getAiPromptSettings,
  saveAiPromptSettings,
  getMatterportApiCredentials,
  saveMatterportApiCredentials,
  getAutomationSettings,
  saveAutomationSettings,
  getEmailTemplates,
  saveEmailTemplates,
  DEFAULT_EMAIL_TEMPLATES,
} = require('../lib/settings');
const {
  listActionDefinitions,
  listRiskDefinitions,
} = require('../lib/admin-actions-schema');
const { chatWithAi, getAiConfig, getAllowedChatModels } = require('../lib/ai');
const {
  changeOwnAdminEmail,
  changeOwnAdminPassword,
  createAdminInvite,
  deleteAdminUserById,
  ensureAdminTeamSchema,
  listAdminAccessUsers,
  listPendingAdminInvites,
  revokeInviteById,
  setAdminUserActive,
  updateAdminUserById,
} = require('../lib/admin-team');
const {
  EXTENSION_PRICE_CHF,
  REACTIVATION_PRICE_CHF,
  getInitialTermEndDate,
  toIsoDate,
  getSubscriptionWindowFromStart,
} = require('../lib/subscriptions');
const {
  buildSuggestionGroups,
} = require('../lib/suggestion-groups');
const {
  approveSuggestion,
  ensureSchema: ensureSuggestionSchema,
  getCustomerLinkSuggestionsForTour,
  getInvoiceLinkSuggestionsForTour,
  getSuggestionById,
  getSuggestionStats,
  listSuggestions,
  rejectSuggestion,
  syncInvoiceSuggestions,
  syncMailboxSuggestions,
} = require('../lib/suggestions');
const {
  createDraftMessage,
  createReplyDraft,
  getGraphConfig,
  fetchMailboxMessages,
  graphRequest,
  moveMessageToFolder,
  sendMailDirect,
  sendDraftMessage,
  stripHtml,
} = require('../lib/microsoft-graph');
const {
  buildBulletSection,
  classifyReadIntent,
  compactText,
} = require('../lib/admin-agent');

const ALLOWED_VISIBILITIES = ['PRIVATE', 'LINK_ONLY', 'PUBLIC', 'PASSWORD'];

const profileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 512 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(jpeg|pjpeg|png|gif|webp)$/i.test(file.mimetype || '');
    cb(null, ok);
  },
});

const bankDataUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const mt = String(file.mimetype || '').toLowerCase();
    const ok =
      name.endsWith('.xml') ||
      name.endsWith('.csv') ||
      mt.includes('xml') ||
      mt.includes('csv') ||
      mt === 'text/plain';
    cb(null, ok);
  },
});

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function adminEmail(req) {
  return String(req.session?.admin?.email || req.session?.admin?.username || '').trim().toLowerCase();
}

function adminUsername(req) {
  return req.session?.admin?.username || req.session?.admin?.email || 'admin';
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

router.get('/dashboard', async (req, res) => {
  try {
    const [linkedResult, matterportResult, recentToursRaw, expiringSoonRowsRaw] =
      await Promise.all([
        pool.query(`
          SELECT COALESCE(matterport_space_id, '') AS space_id
          FROM tour_manager.tours
          WHERE matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != ''
        `),
        matterport.listModels().catch(() => ({ results: [] })),
        pool.query(`
          SELECT * FROM tour_manager.tours
          ORDER BY created_at DESC LIMIT 5
        `),
        pool.query(`
          SELECT * FROM tour_manager.tours
          WHERE status IN ('ACTIVE','EXPIRING_SOON')
            AND COALESCE(term_end_date, ablaufdatum) IS NOT NULL
          ORDER BY COALESCE(term_end_date, ablaufdatum) ASC
          LIMIT 5
        `),
      ]);

    const linkedSpaceIds = new Set(
      linkedResult.rows
        .map((row) => String(row.space_id || '').trim())
        .filter(Boolean),
    );
    const openMatterportSpaces = (matterportResult.results || [])
      .filter((m) => String(m.state || '').toLowerCase() === 'active')
      .filter((m) => !linkedSpaceIds.has(String(m.id || '').trim()))
      .sort((a, b) => {
        const ta = a?.created ? new Date(a.created).getTime() : 0;
        const tb = b?.created ? new Date(b.created).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 5);

    return res.json({
      ok: true,
      openMatterportSpaces,
      recentTours: recentToursRaw.rows.map(normalizeTourRow),
      expiringSoonTours: expiringSoonRowsRaw.rows.map(normalizeTourRow),
    });
  } catch (err) {
    console.error('[admin-api] /dashboard error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── Touren-Liste ─────────────────────────────────────────────────────────────

router.get('/tours', async (req, res) => {
  try {
    const status = req.query.status || null;
    const expiringSoon = req.query.expiringSoon || null;
    const invoiceOpenOnly = req.query.invoiceOpenOnly || null;
    const invoiceOverdueOnly = req.query.invoiceOverdueOnly || null;
    const noCustomerOnly = req.query.noCustomerOnly || null;
    const searchQuery = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 25;

    const validSortCols = ['customer', 'matterport_created', 'ablaufdatum', 'days', 'status'];
    const sortCol = validSortCols.includes(req.query.sort) ? req.query.sort : 'customer';
    const order = req.query.order === 'desc' ? 'desc' : 'asc';

    const conditions = [];
    const params = [];
    let pi = 1;

    if (status) { conditions.push(`t.status = $${pi++}`); params.push(status); }
    if (expiringSoon === '1') {
      conditions.push(`t.status IN ('ACTIVE','EXPIRING_SOON')`);
      conditions.push(`COALESCE(t.term_end_date, t.ablaufdatum) IS NOT NULL`);
      conditions.push(`COALESCE(t.term_end_date, t.ablaufdatum) <= NOW() + INTERVAL '30 days'`);
    }
    if (invoiceOpenOnly === '1') {
      conditions.push(`EXISTS (
        SELECT 1 FROM tour_manager.exxas_invoices ei
        WHERE ei.tour_id = t.id AND ei.exxas_status != 'bz'
      )`);
    }
    if (invoiceOverdueOnly === '1') {
      conditions.push(`EXISTS (
        SELECT 1 FROM tour_manager.exxas_invoices ei
        WHERE ei.tour_id = t.id AND ei.exxas_status != 'bz' AND ei.zahlungstermin < NOW()
      )`);
    }
    if (noCustomerOnly === '1') {
      conditions.push(`t.kunde_ref IS NULL AND t.customer_name IS NULL AND t.customer_email IS NULL AND t.customer_contact IS NULL`);
    }
    if (searchQuery.length >= 2) {
      const like = `%${searchQuery.toLowerCase()}%`;
      conditions.push(`(
        LOWER(COALESCE(t.customer_name,'')) LIKE $${pi}
        OR LOWER(COALESCE(t.kunde_ref,'')) LIKE $${pi}
        OR LOWER(COALESCE(t.object_label,'')) LIKE $${pi}
        OR LOWER(COALESCE(t.bezeichnung,'')) LIKE $${pi}
        OR LOWER(COALESCE(t.customer_email,'')) LIKE $${pi}
        OR LOWER(COALESCE(t.customer_contact,'')) LIKE $${pi}
        OR LOWER(COALESCE(t.matterport_space_id,'')) LIKE $${pi}
      )`);
      params.push(like);
      pi++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sortMap = {
      customer: `LOWER(COALESCE(t.customer_name, t.kunde_ref, ''))`,
      matterport_created: `t.matterport_created_at`,
      ablaufdatum: `COALESCE(t.term_end_date, t.ablaufdatum)`,
      days: `COALESCE(t.term_end_date, t.ablaufdatum)`,
      status: `t.status`,
    };
    const orderSql = `${sortMap[sortCol] || sortMap.customer} ${order} NULLS LAST`;

    const [countResult, toursResult, noCustomer, invOffen, invBezahlt, invUeberfaellig, statsResult] =
      await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS cnt FROM tour_manager.tours t ${where}`, params),
        pool.query(
          `SELECT t.* FROM tour_manager.tours t ${where} ORDER BY ${orderSql} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
          params,
        ),
        pool.query(`SELECT COUNT(*)::int AS cnt FROM tour_manager.tours WHERE kunde_ref IS NULL AND customer_name IS NULL AND customer_email IS NULL`),
        pool.query(`SELECT COUNT(*)::int AS cnt FROM tour_manager.exxas_invoices WHERE exxas_status != 'bz'`).catch(() => ({ rows: [{ cnt: 0 }] })),
        pool.query(`SELECT COUNT(*)::int AS cnt FROM tour_manager.exxas_invoices WHERE exxas_status = 'bz'`).catch(() => ({ rows: [{ cnt: 0 }] })),
        pool.query(`SELECT COUNT(*)::int AS cnt FROM tour_manager.exxas_invoices WHERE exxas_status != 'bz' AND zahlungstermin < NOW()`).catch(() => ({ rows: [{ cnt: 0 }] })),
        pool.query(`
          SELECT status, COUNT(*)::int AS cnt
          FROM tour_manager.tours
          GROUP BY status
        `),
      ]);

    const totalItems = countResult.rows[0]?.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const stats = { total: totalItems };
    for (const row of statsResult.rows) stats[row.status] = row.cnt;
    stats.noCustomer = noCustomer.rows[0]?.cnt || 0;
    stats.invoicesOffen = invOffen.rows[0]?.cnt || 0;
    stats.invoicesBezahlt = invBezahlt.rows[0]?.cnt || 0;
    stats.invoicesUeberfaellig = invUeberfaellig.rows[0]?.cnt || 0;
    stats.invoicesOpenTotal = stats.invoicesOffen + stats.invoicesUeberfaellig;

    const tours = toursResult.rows.map(normalizeTourRow);
    const dashboardWidgets = await getDashboardWidgets();

    return res.json({
      ok: true,
      tours,
      filters: { status, expiringSoon, invoiceOpenOnly, invoiceOverdueOnly, noCustomerOnly, q: searchQuery },
      sort: sortCol,
      order,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasPrev: page > 1,
        hasNext: page < totalPages,
      },
      stats,
      dashboardWidgets,
    });
  } catch (err) {
    console.error('[admin-api] /tours error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── Suche ────────────────────────────────────────────────────────────────────

router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const like = `%${q.toLowerCase()}%`;
    const results = [];

    const [tours, invoices] = await Promise.all([
      pool.query(
        `SELECT id,
           COALESCE(customer_name, kunde_ref) AS name,
           COALESCE(object_label, bezeichnung) AS label,
           customer_email,
           status,
           COALESCE(term_end_date, ablaufdatum) AS ablaufdatum
         FROM tour_manager.tours
         WHERE LOWER(COALESCE(customer_name,'')) LIKE $1
            OR LOWER(COALESCE(kunde_ref,'')) LIKE $1
            OR LOWER(COALESCE(object_label,'')) LIKE $1
            OR LOWER(COALESCE(bezeichnung,'')) LIKE $1
            OR LOWER(COALESCE(customer_email,'')) LIKE $1
            OR LOWER(COALESCE(customer_contact,'')) LIKE $1
            OR LOWER(COALESCE(matterport_space_id,'')) LIKE $1
         ORDER BY COALESCE(customer_name, kunde_ref) ASC
         LIMIT 8`,
        [like],
      ),
      pool.query(
        `SELECT id, nummer, kunde_name, bezeichnung, betrag, status
         FROM tour_manager.exxas_invoices
         WHERE LOWER(COALESCE(kunde_name,'')) LIKE $1
            OR LOWER(COALESCE(bezeichnung,'')) LIKE $1
            OR LOWER(COALESCE(nummer,'')) LIKE $1
         ORDER BY kunde_name ASC LIMIT 4`,
        [like],
      ).catch(() => ({ rows: [] })),
    ]);

    for (const t of tours.rows) {
      results.push({
        type: 'tour',
        id: t.id,
        title: [t.name, t.label].filter(Boolean).join(' – '),
        sub: t.customer_email || '',
        status: t.status,
        url: `/admin/tours/${t.id}`,
      });
    }
    for (const inv of invoices.rows) {
      results.push({
        type: 'invoice',
        id: inv.id,
        title: [inv.nummer, inv.kunde_name].filter(Boolean).join(' – '),
        sub: inv.bezeichnung || '',
        status: inv.status,
        url: `/admin/invoices`,
      });
    }

    return res.json(results);
  } catch (err) {
    console.error('[admin-api] /search error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── Tour-Detail ──────────────────────────────────────────────────────────────

router.get('/tours/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [tourResult, logs, renewalRows, exxasRows, outgoingEmails, incomingEmails] =
      await Promise.all([
        pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]),
        pool.query(
          'SELECT * FROM tour_manager.actions_log WHERE tour_id = $1 ORDER BY created_at DESC LIMIT 50',
          [id],
        ),
        pool.query(
          `SELECT * FROM tour_manager.renewal_invoices WHERE tour_id = $1 ORDER BY COALESCE(paid_at, sent_at, created_at) DESC NULLS LAST`,
          [id],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT * FROM tour_manager.exxas_invoices WHERE tour_id = $1 ORDER BY COALESCE(zahlungstermin, created_at) DESC NULLS LAST`,
          [id],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT subject, recipient_email, sent_at, template_key FROM tour_manager.outgoing_emails WHERE tour_id = $1 ORDER BY sent_at DESC LIMIT 10`,
          [id],
        ).catch(() => ({ rows: [] })),
        pool.query(
          `SELECT subject, from_email, from_name, received_at, body_preview FROM tour_manager.incoming_emails WHERE matched_tour_id = $1 ORDER BY received_at DESC NULLS LAST LIMIT 10`,
          [id],
        ).catch(() => ({ rows: [] })),
      ]);

    if (!tourResult.rows[0]) {
      return res.status(404).json({ error: 'Tour nicht gefunden' });
    }

    const tourRow = normalizeTourRow(tourResult.rows[0]);
    const spaceId = tourRow.canonical_matterport_space_id || tourRow.matterport_space_id || null;
    let mpVisibility = null;
    if (spaceId) {
      const { model } = await matterport.getModel(spaceId).catch(() => ({ model: null }));
      mpVisibility = model?.accessVisibility || model?.visibility || null;
    }

    let customer = null;
    let customerContacts = [];
    if (tourRow.customer_id) {
      const [custResult, contactsResult] = await Promise.all([
        pool.query('SELECT * FROM core.customers WHERE id = $1 LIMIT 1', [tourRow.customer_id]),
        pool.query('SELECT * FROM core.customer_contacts WHERE customer_id = $1 ORDER BY name ASC', [tourRow.customer_id]),
      ]);
      customer = custResult.rows[0] || null;
      customerContacts = contactsResult.rows;
    }

    return res.json({
      ok: true,
      tour: { ...tourRow, mpVisibility },
      actions_log: logs.rows,
      renewalInvoices: renewalRows.rows,
      exxasInvoices: exxasRows.rows,
      outgoingEmails: outgoingEmails.rows,
      incomingEmails: incomingEmails.rows,
      customer,
      customerContacts,
      pricing: {
        extensionPriceCHF: EXTENSION_PRICE_CHF,
        reactivationPriceCHF: REACTIVATION_PRICE_CHF,
      },
    });
  } catch (err) {
    console.error('[admin-api] /tours/:id error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

// ─── Tour-Mutationen ──────────────────────────────────────────────────────────

router.post('/tours/:id/set-tour-url', async (req, res) => {
  try {
    const { id } = req.params;
    let tour_url = (req.body.tour_url || '').trim() || null;
    if (tour_url && !tour_url.toLowerCase().includes('my.matterport.com')) {
      tour_url = null;
    }
    await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');
    await pool.query(
      `UPDATE tour_manager.tours SET tour_url = $1, matterport_is_own = NULL, updated_at = NOW() WHERE id = $2`,
      [tour_url, id],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] set-tour-url error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/set-name', async (req, res) => {
  try {
    const { id } = req.params;
    const name = String(req.body?.name || '').trim();
    const syncMatterport = req.body?.syncMatterport === '1';
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    if (!tourResult.rows[0]) return res.status(404).json({ error: 'Tour nicht gefunden' });

    const bezeichnungVal = name || null;
    await pool.query(
      `UPDATE tour_manager.tours SET bezeichnung = $1, object_label = $1, updated_at = NOW() WHERE id = $2`,
      [bezeichnungVal, id],
    );

    let nameSyncFailed = false;
    if (syncMatterport && name) {
      const tourNorm = normalizeTourRow(tourResult.rows[0]);
      const spaceId = tourNorm.canonical_matterport_space_id || tourNorm.matterport_space_id || null;
      if (spaceId) {
        const result = await matterport.patchModelName(spaceId, name);
        if (!result.success) nameSyncFailed = true;
      } else {
        nameSyncFailed = true;
      }
    }
    return res.json({ ok: true, nameSyncFailed });
  } catch (err) {
    console.error('[admin-api] set-name error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/set-start-sweep', async (req, res) => {
  try {
    const { id } = req.params;
    const sweep = String(req.body?.start_sweep || '').trim() || null;
    const exists = await pool.query('SELECT id FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Tour nicht gefunden' });
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_start_sweep = $1, updated_at = NOW() WHERE id = $2`,
      [sweep, id],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] set-start-sweep error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/set-verified', async (req, res) => {
  try {
    const { id } = req.params;
    const verified = req.body.verified === '1' || req.body.verified === true;
    await pool.query(
      `UPDATE tour_manager.tours SET customer_verified = $1, updated_at = NOW() WHERE id = $2`,
      [verified, id],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] set-verified error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/visibility', async (req, res) => {
  try {
    const { id } = req.params;
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    const tourRow = normalizeTourRow(tourResult.rows[0] || null);
    if (!tourRow) return res.status(404).json({ error: 'Tour nicht gefunden' });

    const spaceId = tourRow.canonical_matterport_space_id || tourRow.matterport_space_id || null;
    if (!spaceId) return res.status(400).json({ error: 'no_matterport' });

    const visibility = String(req.body?.visibility || '').toUpperCase();
    if (!ALLOWED_VISIBILITIES.includes(visibility)) {
      return res.status(400).json({ error: 'invalid_visibility' });
    }

    const password = visibility === 'PASSWORD'
      ? (String(req.body?.password || '').trim() || null)
      : undefined;

    const result = await matterport.setVisibility(spaceId, visibility, password);
    if (!result.success) return res.status(502).json({ error: 'visibility_failed' });

    await logAction(id, 'admin', adminUsername(req), 'ADMIN_VISIBILITY', {
      visibility,
      hasPassword: !!password,
      spaceId,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] visibility error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/archive-matterport', async (req, res) => {
  try {
    const { id } = req.params;
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    const tourRow = normalizeTourRow(tourResult.rows[0] || null);
    if (!tourRow) return res.status(404).json({ error: 'Tour nicht gefunden' });
    const spaceId = tourRow.canonical_matterport_space_id || null;
    if (!spaceId) return res.status(400).json({ error: 'no_matterport' });

    const result = await matterport.archiveSpace(spaceId);
    if (!result.success) return res.status(502).json({ error: result.error || 'archive_failed' });

    await pool.query(
      `UPDATE tour_manager.tours SET status = 'ARCHIVED', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    await logAction(id, 'admin', adminUsername(req), 'ADMIN_ARCHIVE_MATTERPORT', { spaceId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] archive-matterport error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Exxas-Aktionen ──────────────────────────────────────────────────────────

router.post('/tours/:id/exxas-cancel-subscription', async (req, res) => {
  try {
    const { id } = req.params;
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    const tourRow = normalizeTourRow(tourResult.rows[0] || null);
    if (!tourRow) return res.status(404).json({ error: 'Tour nicht gefunden' });
    const contractId = tourRow.canonical_exxas_contract_id || tourRow.exxas_abo_id || tourRow.exxas_subscription_id;
    if (!contractId) return res.status(400).json({ error: 'Kein Exxas-Abo verknüpft' });
    await exxas.cancelSubscription(contractId);
    await logAction(id, 'admin', adminUsername(req), 'ADMIN_EXXAS_CANCEL_SUBSCRIPTION', { contractId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] exxas-cancel-subscription error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/exxas-deactivate-customer', async (req, res) => {
  try {
    const { id } = req.params;
    const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [id]);
    const tourRow = normalizeTourRow(tourResult.rows[0] || null);
    if (!tourRow) return res.status(404).json({ error: 'Tour nicht gefunden' });
    const exxasCustId = tourRow.exxas_customer_id;
    if (!exxasCustId) return res.status(400).json({ error: 'Kein Exxas-Kunde verknüpft' });
    await exxas.deactivateCustomer(exxasCustId);
    await logAction(id, 'admin', adminUsername(req), 'ADMIN_EXXAS_DEACTIVATE_CUSTOMER', { exxasCustId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] exxas-deactivate-customer error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/exxas-cancel-invoice', async (req, res) => {
  try {
    const { id } = req.params;
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId fehlt' });
    await exxas.cancelInvoice(invoiceId);
    await logAction(id, 'admin', adminUsername(req), 'ADMIN_EXXAS_CANCEL_INVOICE', { invoiceId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] exxas-cancel-invoice error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Rechnungen ───────────────────────────────────────────────────────────────

router.get('/invoices', async (req, res) => {
  try {
    const { status } = req.query;
    let where = '';
    const params = [];
    if (status === 'offen') {
      where = `WHERE i.invoice_status IN ('sent','overdue')`;
    } else if (status === 'bezahlt') {
      where = `WHERE i.invoice_status = 'paid'`;
    }

    const result = await pool.query(`
      SELECT i.*,
        COALESCE(t.object_label, t.bezeichnung) AS tour_object_label,
        COALESCE(t.customer_name, t.kunde_ref) AS tour_customer_name,
        COALESCE(t.exxas_subscription_id, t.exxas_abo_id) AS tour_contract_id,
        t.last_email_sent_at
      FROM tour_manager.renewal_invoices i
      LEFT JOIN tour_manager.tours t ON t.id = i.tour_id
      ${where}
      ORDER BY COALESCE(i.paid_at, i.sent_at, i.created_at) DESC NULLS LAST
      LIMIT 200
    `, params);

    return res.json({ ok: true, invoices: result.rows, status: status || 'all' });
  } catch (err) {
    console.error('[admin-api] /invoices error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/tours/:id/invoices/create-manual', async (req, res) => {
  try {
    const { id } = req.params;
    const amount_chf = parseFloat(req.body?.amount_chf);
    if (!amount_chf || isNaN(amount_chf) || amount_chf <= 0) {
      return res.status(400).json({ error: 'Ungültiger Betrag' });
    }
    const invoice_kind = req.body?.invoice_kind || 'manual';
    const note = req.body?.note || null;
    const due_at = req.body?.due_at || null;
    const markPaid = req.body?.mark_paid === true || req.body?.mark_paid === '1';
    const payment_method = req.body?.payment_method || 'bank_transfer';

    const invStatus = markPaid ? 'paid' : 'sent';
    const dbInv = await pool.query(
      `INSERT INTO tour_manager.renewal_invoices
         (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source,
          payment_note, paid_at, payment_method, recorded_by, recorded_at)
       VALUES ($1, $2, NOW(), $3, $4, $5, 'manual', $6, $7, $8, $9, NOW())
       RETURNING id`,
      [
        id,
        invStatus,
        amount_chf,
        due_at || null,
        invoice_kind,
        note,
        markPaid ? new Date() : null,
        markPaid ? payment_method : null,
        adminEmail(req),
      ],
    );
    const invoiceId = dbInv.rows[0]?.id;
    if (markPaid) {
      await logAction(id, 'admin', adminUsername(req), 'ADMIN_MARK_PAID_MANUAL', {
        invoiceId,
        amount_chf,
        payment_method,
        note,
      });
    } else {
      await logAction(id, 'admin', adminUsername(req), 'ADMIN_CREATE_MANUAL_INVOICE', {
        invoiceId,
        amount_chf,
        note,
      });
    }
    return res.json({ ok: true, invoiceId });
  } catch (err) {
    console.error('[admin-api] create-manual error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/invoices/:invoiceId/mark-paid-manual', async (req, res) => {
  try {
    const { id, invoiceId } = req.params;
    const payment_method = req.body?.payment_method || 'bank_transfer';
    const payment_note = req.body?.payment_note || null;
    await pool.query(
      `UPDATE tour_manager.renewal_invoices
       SET invoice_status = 'paid', paid_at = NOW(), payment_method = $1, payment_note = $2,
           recorded_by = $3, recorded_at = NOW()
       WHERE id = $4 AND tour_id = $5`,
      [payment_method, payment_note, adminEmail(req), invoiceId, id],
    );
    await logAction(id, 'admin', adminUsername(req), 'ADMIN_MARK_PAID_MANUAL', {
      invoiceId,
      payment_method,
      payment_note,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] mark-paid-manual error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/invoices/:invoiceId/delete', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    await pool.query('DELETE FROM tour_manager.renewal_invoices WHERE id = $1', [invoiceId]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] delete invoice error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/tours/:id/link-invoice', async (req, res) => {
  try {
    const { id } = req.params;
    const { invoiceId } = req.body;
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId fehlt' });
    await pool.query(
      `UPDATE tour_manager.exxas_invoices SET tour_id = $1 WHERE id = $2`,
      [id, invoiceId],
    );
    await logAction(id, 'admin', adminUsername(req), 'ADMIN_LINK_INVOICE', { invoiceId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] link-invoice error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Bankimport ───────────────────────────────────────────────────────────────

router.get('/bank-import', async (req, res) => {
  try {
    const [runsResult, txResult] = await Promise.all([
      pool.query(
        `SELECT * FROM tour_manager.bank_import_runs ORDER BY imported_at DESC LIMIT 20`,
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT * FROM tour_manager.bank_import_transactions WHERE status = 'pending' ORDER BY transaction_date DESC NULLS LAST LIMIT 100`,
      ).catch(() => ({ rows: [] })),
    ]);
    return res.json({ ok: true, runs: runsResult.rows, pendingTransactions: txResult.rows });
  } catch (err) {
    console.error('[admin-api] bank-import error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/bank-import/upload', bankDataUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Keine Datei' });
    const result = await bankImport.importFile(req.file.buffer, req.file.originalname);
    return res.json({ ok: true, runId: result.runId, imported: result.imported });
  } catch (err) {
    console.error('[admin-api] bank-import upload error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/bank-import/transactions/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await bankImport.confirmTransaction(id, adminEmail(req));
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin-api] bank-import confirm error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/bank-import/transactions/:id/ignore', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE tour_manager.bank_import_transactions SET status = 'ignored', updated_at = NOW() WHERE id = $1`,
      [id],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] bank-import ignore error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Matterport-Linking ───────────────────────────────────────────────────────

router.get('/link-matterport', async (req, res) => {
  try {
    const [linkedResult, matterportResult] = await Promise.all([
      pool.query(`
        SELECT t.id, COALESCE(t.matterport_space_id, '') AS space_id,
          COALESCE(t.customer_name, t.kunde_ref) AS customer_name,
          COALESCE(t.object_label, t.bezeichnung) AS object_label,
          t.status
        FROM tour_manager.tours t
        WHERE t.matterport_space_id IS NOT NULL AND TRIM(t.matterport_space_id) != ''
      `),
      matterport.listModels().catch(() => ({ results: [] })),
    ]);

    const linkedSpaceIds = new Set(
      linkedResult.rows.map((r) => String(r.space_id || '').trim()).filter(Boolean),
    );
    const openSpaces = (matterportResult.results || [])
      .filter((m) => !linkedSpaceIds.has(String(m.id || '').trim()))
      .map((m) => ({
        id: m.id,
        name: m.name || null,
        created: m.created || null,
        state: m.state || null,
      }));

    return res.json({ ok: true, openSpaces, linkedTours: linkedResult.rows });
  } catch (err) {
    console.error('[admin-api] link-matterport GET error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/link-matterport', async (req, res) => {
  try {
    const { spaceId, tourId, createNew, customerName, objectLabel } = req.body;
    if (!spaceId) return res.status(400).json({ error: 'spaceId fehlt' });

    let finalTourId = tourId;
    if (createNew) {
      const newTour = await pool.query(
        `INSERT INTO tour_manager.tours (matterport_space_id, customer_name, object_label, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'ACTIVE', NOW(), NOW()) RETURNING id`,
        [spaceId, customerName || null, objectLabel || null],
      );
      finalTourId = newTour.rows[0]?.id;
    } else if (tourId) {
      await pool.query(
        `UPDATE tour_manager.tours SET matterport_space_id = $1, updated_at = NOW() WHERE id = $2`,
        [spaceId, tourId],
      );
    } else {
      return res.status(400).json({ error: 'tourId oder createNew erforderlich' });
    }
    await logAction(finalTourId, 'admin', adminUsername(req), 'ADMIN_LINK_MATTERPORT', { spaceId });
    return res.json({ ok: true, tourId: finalTourId });
  } catch (err) {
    console.error('[admin-api] link-matterport POST error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/link-matterport/auto', async (req, res) => {
  try {
    const result = await matterport.autoLinkSpaces();
    return res.json({ ok: true, linked: result?.linked || 0 });
  } catch (err) {
    console.error('[admin-api] auto-link error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/link-matterport/sync-status', async (req, res) => {
  try {
    await matterport.syncModelsStatus();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] sync-status error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/link-matterport/check-ownership', async (req, res) => {
  try {
    await matterport.checkOwnership();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] check-ownership error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/link-matterport/refresh-created', async (req, res) => {
  try {
    await matterport.refreshCreatedDates();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] refresh-created error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.get('/link-matterport/customer-search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ customers: [] });
    const customers = await customerLookup.searchCustomers(q);
    return res.json({ customers });
  } catch (err) {
    console.error('[admin-api] customer-search error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/tours/:id/link-exxas-customer', async (req, res) => {
  try {
    const { id } = req.params;
    const { exxasCustomerId } = req.body;
    if (!exxasCustomerId) return res.status(400).json({ error: 'exxasCustomerId fehlt' });
    await pool.query(
      `UPDATE tour_manager.tours SET exxas_customer_id = $1, updated_at = NOW() WHERE id = $2`,
      [exxasCustomerId, id],
    );
    await logAction(id, 'admin', adminUsername(req), 'ADMIN_LINK_EXXAS_CUSTOMER', { exxasCustomerId });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] link-exxas-customer error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Kundenverwaltung ─────────────────────────────────────────────────────────

router.get('/customers', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = 25;
    const conditions = [];
    const params = [];
    let pi = 1;
    if (q.length >= 2) {
      const like = `%${q.toLowerCase()}%`;
      conditions.push(`(LOWER(COALESCE(c.name,'')) LIKE $${pi} OR LOWER(COALESCE(c.email,'')) LIKE $${pi} OR LOWER(COALESCE(c.company,'')) LIKE $${pi})`);
      params.push(like);
      pi++;
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countResult, customersResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS cnt FROM core.customers c ${where}`, params),
      pool.query(
        `SELECT c.* FROM core.customers c ${where} ORDER BY c.name ASC, c.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params,
      ),
    ]);
    const totalItems = countResult.rows[0]?.cnt || 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    return res.json({
      ok: true,
      customers: customersResult.rows,
      pagination: { page, pageSize, totalItems, totalPages, hasPrev: page > 1, hasNext: page < totalPages },
    });
  } catch (err) {
    console.error('[admin-api] /customers error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.get('/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [customerResult, contactsResult, toursResult] = await Promise.all([
      pool.query('SELECT * FROM core.customers WHERE id = $1 LIMIT 1', [id]),
      pool.query('SELECT * FROM core.customer_contacts WHERE customer_id = $1 ORDER BY name ASC', [id]),
      pool.query(
        `SELECT * FROM tour_manager.tours WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [id],
      ).catch(() => ({ rows: [] })),
    ]);
    if (!customerResult.rows[0]) return res.status(404).json({ error: 'Kunde nicht gefunden' });
    return res.json({
      ok: true,
      customer: customerResult.rows[0],
      contacts: contactsResult.rows,
      tours: toursResult.rows.map(normalizeTourRow),
    });
  } catch (err) {
    console.error('[admin-api] /customers/:id error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/customers/new', async (req, res) => {
  try {
    const { name, company, email, phone, address, notes } = req.body || {};
    if (!name && !company) return res.status(400).json({ error: 'Name oder Firma erforderlich' });
    const result = await pool.query(
      `INSERT INTO core.customers (name, company, email, phone, address, notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING id`,
      [name || null, company || null, email || null, phone || null, address || null, notes || null],
    );
    return res.json({ ok: true, customerId: result.rows[0].id });
  } catch (err) {
    console.error('[admin-api] customers/new error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/customers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company, email, phone, address, notes } = req.body || {};
    await pool.query(
      `UPDATE core.customers SET name=$1, company=$2, email=$3, phone=$4, address=$5, notes=$6, updated_at=NOW() WHERE id=$7`,
      [name || null, company || null, email || null, phone || null, address || null, notes || null, id],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] customers/:id POST error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/customers/:id/delete', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM core.customers WHERE id = $1', [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] customers/:id/delete error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/customers/:id/contacts', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role } = req.body || {};
    const result = await pool.query(
      `INSERT INTO core.customer_contacts (customer_id, name, email, phone, role, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [id, name || null, email || null, phone || null, role || null],
    );
    return res.json({ ok: true, contactId: result.rows[0].id });
  } catch (err) {
    console.error('[admin-api] contacts POST error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/customers/:id/contacts/:cid/delete', async (req, res) => {
  try {
    const { id, cid } = req.params;
    await pool.query('DELETE FROM core.customer_contacts WHERE id = $1 AND customer_id = $2', [cid, id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] contacts delete error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/customers/:id/contacts/:cid/portal-role', async (req, res) => {
  try {
    const { id, cid } = req.params;
    const { portalRole } = req.body || {};
    await pool.query(
      'UPDATE core.customer_contacts SET portal_role = $1 WHERE id = $2 AND customer_id = $3',
      [portalRole || null, cid, id],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] portal-role error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Portal-Rollen ────────────────────────────────────────────────────────────

router.get('/portal-roles', async (req, res) => {
  try {
    await portalTeam.ensurePortalTeamSchema();
    const tab = req.query.tab === 'extern' ? 'extern' : 'intern';
    const staffRows = await portalTeam.listPortalStaffRoles();
    return res.json({ ok: true, staffRows, externRows: [], tab });
  } catch (err) {
    console.error('[admin-api] portal-roles error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/portal-roles/add', async (req, res) => {
  try {
    const { email, role } = req.body || {};
    if (!email) return res.status(400).json({ error: 'E-Mail fehlt' });
    await portalTeam.addPortalStaffRole(email, role || 'staff');
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] portal-roles/add error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/portal-roles/remove', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'E-Mail fehlt' });
    await portalTeam.removePortalStaffRole(email);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] portal-roles/remove error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/portal-roles/extern-set', async (req, res) => {
  try {
    const { ownerEmail, memberEmail, role } = req.body || {};
    if (!ownerEmail || !memberEmail) return res.status(400).json({ error: 'ownerEmail und memberEmail erforderlich' });
    const normOwner = portalTeam.normalizeEmail(ownerEmail);
    const normMember = portalTeam.normalizeEmail(memberEmail);
    const normRole = portalTeam.normalizeMemberRole(role || 'mitarbeiter');
    await portalTeam.ensurePortalTeamSchema();
    const existing = await pool.query(
      `SELECT id FROM tour_manager.portal_team WHERE owner_email = $1 AND member_email = $2 AND status = 'active'`,
      [normOwner, normMember],
    );
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE tour_manager.portal_team SET role = $1 WHERE id = $2`,
        [normRole, existing.rows[0].id],
      );
    } else {
      await pool.query(
        `INSERT INTO tour_manager.portal_team (owner_email, member_email, role, status, created_at)
         VALUES ($1, $2, $3, 'active', NOW())
         ON CONFLICT (owner_email, member_email) DO UPDATE SET role = $3, status = 'active'`,
        [normOwner, normMember, normRole],
      );
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] portal-roles/extern-set error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/portal-roles/extern-remove', async (req, res) => {
  try {
    const { ownerEmail, memberEmail } = req.body || {};
    if (!ownerEmail || !memberEmail) return res.status(400).json({ error: 'ownerEmail und memberEmail erforderlich' });
    const normOwner = portalTeam.normalizeEmail(ownerEmail);
    const normMember = portalTeam.normalizeEmail(memberEmail);
    await portalTeam.ensurePortalTeamSchema();
    await pool.query(
      `UPDATE tour_manager.portal_team SET status = 'revoked' WHERE owner_email = $1 AND member_email = $2`,
      [normOwner, normMember],
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] portal-roles/extern-remove error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Admin-Team ───────────────────────────────────────────────────────────────

router.get('/team', async (req, res) => {
  try {
    await ensureAdminTeamSchema();
    const [users, pendingInvites] = await Promise.all([
      listAdminAccessUsers(),
      listPendingAdminInvites(),
    ]);
    return res.json({ ok: true, users, pendingInvites });
  } catch (err) {
    console.error('[admin-api] /team error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/team/invite', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'E-Mail fehlt' });
    const { token } = await createAdminInvite(email);
    return res.json({ ok: true, token });
  } catch (err) {
    console.error('[admin-api] team/invite error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/team/:email/toggle', async (req, res) => {
  try {
    await setAdminUserActive(req.params.email);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] team toggle error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/team/invites/:id/revoke', async (req, res) => {
  try {
    await revokeInviteById(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] team/invites revoke error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/team/users/:id/update', async (req, res) => {
  try {
    await updateAdminUserById(req.params.id, req.body || {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] team/users update error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/team/users/:id/delete', async (req, res) => {
  try {
    await deleteAdminUserById(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] team/users delete error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Einstellungen ────────────────────────────────────────────────────────────

router.get('/settings', async (req, res) => {
  try {
    const [widgets, aiPromptSettings, matterportStored] = await Promise.all([
      getDashboardWidgets(),
      getAiPromptSettings(),
      getMatterportApiCredentials(),
    ]);
    const exxasBase = (process.env.EXXAS_BASE_URL || 'https://api.exxas.net').replace(/\/$/, '');
    return res.json({
      ok: true,
      widgets,
      aiPromptSettings,
      matterportStored: { tokenId: matterportStored.tokenId || '', hasSecret: !!matterportStored.tokenSecret },
      exxasBase,
      actionDefinitions: listActionDefinitions(),
      riskDefinitions: listRiskDefinitions(),
    });
  } catch (err) {
    console.error('[admin-api] /settings error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/settings', async (req, res) => {
  try {
    const { widgets, aiPromptSettings, matterport: mpData } = req.body || {};
    const widgetKeys = [
      'total', 'expiringSoon', 'awaitingPayment', 'active', 'declined',
      'archived', 'unlinked', 'fremdeTouren', 'invoicesOffen', 'invoicesUeberfaellig', 'invoicesBezahlt',
    ];
    const widgetsClean = {};
    for (const k of widgetKeys) {
      widgetsClean[k] = !!(widgets || {})[k];
    }
    if (mpData) {
      await saveMatterportApiCredentials({
        clearStored: !!mpData.clearStored,
        tokenId: mpData.tokenId,
        tokenSecret: mpData.tokenSecret,
      });
      matterport.invalidateMatterportCredentialsCache();
    }
    await Promise.all([
      saveDashboardWidgets(widgetsClean),
      saveAiPromptSettings({ mailSystemPrompt: aiPromptSettings?.mailSystemPrompt || '' }),
    ]);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] settings POST error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── E-Mail-Templates ─────────────────────────────────────────────────────────

router.get('/email-templates', async (req, res) => {
  try {
    const templates = await getEmailTemplates();
    const sharedPlaceholders = [
      'objectLabel', 'customerGreeting', 'tourLinkHtml', 'tourLinkText',
      'termEndFormatted', 'portalUrl', 'portalLinkHtml', 'portalLinkText',
    ];
    return res.json({
      ok: true,
      templates,
      defaultTemplates: DEFAULT_EMAIL_TEMPLATES,
      placeholderHints: {
        renewal_request: [...sharedPlaceholders, 'createdAt', 'amount', 'yesUrl', 'noUrl'],
        payment_confirmed: sharedPlaceholders,
        expiry_reminder: sharedPlaceholders,
        extension_confirmed: sharedPlaceholders,
        reactivation_confirmed: sharedPlaceholders,
        archive_notice: sharedPlaceholders,
        payment_failed: sharedPlaceholders,
        team_invite: ['inviteLink', 'invitedByEmail', 'appName'],
      },
    });
  } catch (err) {
    console.error('[admin-api] /email-templates error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/email-templates', async (req, res) => {
  try {
    const { templates } = req.body || {};
    if (!templates) return res.status(400).json({ error: 'templates fehlt' });
    const cleaned = {};
    for (const key of Object.keys(DEFAULT_EMAIL_TEMPLATES)) {
      const tpl = templates[key];
      const def = DEFAULT_EMAIL_TEMPLATES[key];
      if (tpl) {
        cleaned[key] = {
          subject: typeof tpl.subject === 'string' ? (tpl.subject.trim() || def?.subject) : def?.subject,
          html: typeof tpl.html === 'string' ? (tpl.html.trim() || def?.html) : def?.html,
          text: typeof tpl.text === 'string' ? (tpl.text.trim() || def?.text) : def?.text,
        };
      }
    }
    await saveEmailTemplates(cleaned);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] email-templates POST error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Automatisierungen ────────────────────────────────────────────────────────

router.get('/automations', async (req, res) => {
  try {
    const automations = await getAutomationSettings();
    return res.json({ ok: true, automations });
  } catch (err) {
    console.error('[admin-api] /automations error:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
});

router.post('/automations', async (req, res) => {
  try {
    await saveAutomationSettings(req.body || {});
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] automations POST error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── KI-Assistenz ────────────────────────────────────────────────────────────

router.post('/chat-assistant', async (req, res) => {
  try {
    const { message, history, model } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message fehlt' });
    const adminName = adminEmail(req).split('@')[0] || 'Admin';
    const result = await chatWithAi({
      message,
      history: history || [],
      model: model || getAiConfig().model,
      adminName,
    });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin-api] chat-assistant error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/chat-assistant/confirm', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId fehlt' });
    return res.json({ ok: true, result: 'Bestätigt (Funktion noch nicht implementiert)' });
  } catch (err) {
    console.error('[admin-api] chat-assistant/confirm error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/chat-assistant/cancel', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ error: 'sessionId fehlt' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] chat-assistant/cancel error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Profil ───────────────────────────────────────────────────────────────────

router.post('/profile/me', profileUpload.single('photo'), async (req, res) => {
  try {
    const email = adminEmail(req);
    const displayName = String(req.body?.displayName || '').trim() || null;
    await userProfiles.upsertAdminProfileSimple(email, {
      displayName,
      photoBuffer: req.file ? req.file.buffer : undefined,
      photoMime: req.file ? req.file.mimetype : undefined,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] profile/me error:', err);
    return res.status(500).json({ error: err.message });
  }
});

router.post('/profile/password', async (req, res) => {
  try {
    const email = adminEmail(req);
    await changeOwnAdminPassword(email, req.body?.currentPassword, req.body?.newPassword);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] profile/password error:', err);
    return res.status(400).json({ error: err.message });
  }
});

router.post('/profile/email', async (req, res) => {
  try {
    const email = adminEmail(req);
    await changeOwnAdminEmail(email, req.body?.newEmail, req.body?.password);
    return res.json({ ok: true });
  } catch (err) {
    console.error('[admin-api] profile/email error:', err);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
