/**
 * JSON-/Hilfslogik für admin-api Phase 3 (Rechnungen, Bank-Import, Matterport-Link, Rechnung linken).
 */

const { pool } = require('./db');
const exxas = require('./exxas');
const matterport = require('./matterport');
const bankImport = require('./bank-import');
const { normalizeTourRow, getMatterportId } = require('./normalize');
const { logAction } = require('./actions');
const customerLookup = require('./customer-lookup');
const {
  ensureBankImportSchema,
  applyImportedPayment,
  importExxasInvoiceToRenewal,
  syncRenewalInvoiceFromExxas,
} = require('./bank-import-admin');
const {
  ensureSchema: ensureSuggestionSchema,
  getInvoiceLinkSuggestionsForTour,
} = require('./suggestions');
const {
  getInitialTermEndDate,
  toIsoDate,
  getSubscriptionWindowFromStart,
} = require('./subscriptions');
const {
  computeManualInvoiceDueDateIso,
  paymentMethodLabel,
  ALLOWED_PAYMENT_METHODS,
} = require('./tour-detail-payload');
const { streamRenewalInvoicePdf } = require('./renewal-invoice-pdf');
const tourActions = require('./tour-actions');

async function getRenewalInvoicesJson(status) {
  let q = `
    SELECT i.*,
      COALESCE(t.object_label, t.bezeichnung) AS tour_object_label,
      COALESCE(t.customer_name, t.kunde_ref) AS tour_customer_name,
      COALESCE(t.exxas_subscription_id, t.exxas_abo_id) AS tour_contract_id,
      t.last_email_sent_at
    FROM tour_manager.renewal_invoices i
    JOIN tour_manager.tours t ON t.id = i.tour_id
    WHERE 1=1
  `;
  const params = [];
  if (status === 'offen') {
    q += ` AND i.invoice_status IN ('sent','overdue')`;
  } else if (status === 'bezahlt') {
    q += ` AND i.invoice_status = 'paid'`;
  } else if (status === 'ueberfaellig') {
    q += ` AND (i.invoice_status = 'overdue' OR (i.invoice_status = 'sent' AND i.due_at IS NOT NULL AND i.due_at < NOW()))`;
  } else if (status === 'entwurf') {
    q += ` AND i.invoice_status = 'draft'`;
  }
  q += ` ORDER BY COALESCE(i.paid_at, i.sent_at, i.created_at) DESC NULLS LAST, i.created_at DESC`;
  const invoices = await pool.query(q, params);
  const stats = await pool.query(`
    SELECT invoice_status, COUNT(*)::int as cnt FROM tour_manager.renewal_invoices GROUP BY invoice_status
  `);
  const overdueExactLegacy = await pool.query(`
    SELECT COUNT(*)::int AS cnt FROM tour_manager.renewal_invoices
    WHERE invoice_status = 'overdue' OR (invoice_status = 'sent' AND due_at IS NOT NULL AND due_at < NOW())
  `);
  const statusCounts = Object.fromEntries(stats.rows.map((r) => [r.invoice_status, r.cnt]));
  return {
    ok: true,
    invoices: invoices.rows,
    filters: { status: status || null, source: 'renewal' },
    stats: {
      offen: (statusCounts.sent || 0) + (statusCounts.overdue || 0),
      ueberfaellig: overdueExactLegacy.rows[0]?.cnt || 0,
      bezahlt: statusCounts.paid || 0,
      entwurf: statusCounts.draft || 0,
      archiviert: statusCounts.archived || 0,
    },
    source: 'renewal',
  };
}

async function getBankImportJson() {
  await ensureBankImportSchema();
  const runsRes = await pool.query(
    `SELECT *
     FROM tour_manager.bank_import_runs
     ORDER BY created_at DESC
     LIMIT 30`
  );
  const pendingRes = await pool.query(
    `SELECT t.*,
            ri.invoice_number AS renewal_invoice_number,
            ri.amount_chf AS renewal_amount_chf,
            ri.invoice_status AS renewal_invoice_status,
            ei.nummer AS exxas_invoice_number,
            ei.preis_brutto AS exxas_amount_chf,
            ei.exxas_status AS exxas_invoice_status,
            tr.customer_email,
            COALESCE(tr.object_label, tr.bezeichnung) AS tour_label
     FROM tour_manager.bank_import_transactions t
     LEFT JOIN tour_manager.renewal_invoices ri
       ON COALESCE(t.matched_invoice_source, 'renewal') = 'renewal'
      AND ri.id = t.matched_invoice_id
     LEFT JOIN tour_manager.exxas_invoices ei
       ON t.matched_invoice_source = 'exxas'
      AND ei.id = t.matched_invoice_id
     LEFT JOIN tour_manager.tours tr ON tr.id = COALESCE(t.matched_tour_id, ri.tour_id, ei.tour_id)
     WHERE t.match_status IN ('review', 'none')
     ORDER BY t.created_at DESC
     LIMIT 120`
  );
  const pendingRows = pendingRes.rows.map((row) => {
    const source = String(row.matched_invoice_source || '').trim() || (row.matched_invoice_id ? 'renewal' : null);
    return {
      ...row,
      matched_invoice_number: source === 'exxas' ? row.exxas_invoice_number || null : row.renewal_invoice_number || null,
      matched_invoice_amount_chf: source === 'exxas' ? row.exxas_amount_chf ?? null : row.renewal_amount_chf ?? null,
      matched_invoice_status: source === 'exxas' ? row.exxas_invoice_status || null : row.renewal_invoice_status || null,
      requires_import: source === 'exxas',
    };
  });
  return {
    ok: true,
    runs: runsRes.rows,
    pendingRows,
    reviewRows: pendingRows.filter((row) => row.match_status === 'review'),
    unmatchedRows: pendingRows.filter((row) => row.match_status === 'none'),
  };
}

async function runBankImportUpload({ buffer, originalname, actorEmail }) {
  await ensureBankImportSchema();
  await ensureExxasArchivedColumn();
  if (!buffer?.length) {
    return { ok: false, error: 'Keine Datei hochgeladen.' };
  }
  const sourceFormat = String(originalname || '').toLowerCase().endsWith('.csv') ? 'csv' : 'camt054';
  let transactions = [];
  try {
    const text = buffer.toString('utf8');
    transactions = sourceFormat === 'csv' ? bankImport.parseCsv(text) : bankImport.parseCamt054(text);
  } catch (err) {
    return { ok: false, error: `Datei konnte nicht gelesen werden: ${err.message}` };
  }
  if (!transactions.length) {
    return { ok: false, error: 'Keine Buchungen in der Datei gefunden.' };
  }

  const runInsert = await pool.query(
    `INSERT INTO tour_manager.bank_import_runs (created_by, source_format, file_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [actorEmail, sourceFormat, originalname || null]
  );
  const runId = runInsert.rows[0].id;

  const [renewalInvoiceRows, exxasInvoiceRows] = await Promise.all([
    pool.query(
      `SELECT 'renewal' AS source,
              id,
              tour_id,
              invoice_number,
              amount_chf,
              invoice_status,
              subscription_end_at
       FROM tour_manager.renewal_invoices
       WHERE invoice_status IN ('sent', 'overdue', 'draft')
       ORDER BY created_at DESC`
    ),
    pool.query(
      `SELECT 'exxas' AS source,
              ei.id,
              ei.tour_id,
              ei.nummer,
              ei.preis_brutto,
              ei.exxas_status,
              ei.ref_vertrag,
              ei.exxas_document_id
       FROM tour_manager.exxas_invoices ei
       LEFT JOIN tour_manager.renewal_invoices ri
         ON ri.tour_id = ei.tour_id
        AND ri.exxas_invoice_id = COALESCE(NULLIF(ei.exxas_document_id, ''), NULLIF(ei.nummer, ''))
       WHERE ei.archived_at IS NULL
         AND ei.exxas_status != 'bz'
         AND ri.id IS NULL
       ORDER BY ei.created_at DESC`
    ),
  ]);
  const invoiceIndex = bankImport.buildOpenInvoiceIndex([
    ...renewalInvoiceRows.rows,
    ...exxasInvoiceRows.rows,
  ]);

  let exactRows = 0;
  let reviewRows = 0;
  let noneRows = 0;
  for (const tx of transactions) {
    const match = bankImport.matchTransaction(tx, invoiceIndex);
    const note = `Bankimport #${runId}: ${tx.referenceRaw || '-'} / ${tx.amount ?? '-'}`;
    let finalStatus = match.matchStatus;
    if (match.matchStatus === 'exact' && match.invoice?.id && match.invoice?.source === 'renewal') {
      const ok = await applyImportedPayment(match.invoice.id, actorEmail, {
        bookingDate: tx.bookingDate,
        note,
      });
      if (!ok) finalStatus = 'review';
    }
    if (finalStatus === 'exact') exactRows += 1;
    else if (finalStatus === 'review') reviewRows += 1;
    else noneRows += 1;

    await pool.query(
      `INSERT INTO tour_manager.bank_import_transactions (
        run_id, booking_date, value_date, amount_chf, currency,
        reference_raw, reference_digits, debtor_name, purpose,
        match_status, confidence, match_reason, matched_invoice_id, matched_invoice_source, matched_tour_id, raw_json
      ) VALUES (
        $1, $2::date, $3::date, $4::numeric, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16::jsonb
      )`,
      [
        runId,
        bankImport.toIsoDate(tx.bookingDate),
        bankImport.toIsoDate(tx.valueDate),
        tx.amount ?? null,
        tx.currency || 'CHF',
        tx.referenceRaw || null,
        bankImport.digitsOnly(tx.referenceRaw),
        tx.debtorName || null,
        tx.purpose || null,
        finalStatus,
        match.confidence,
        match.reason,
        match.invoice?.id || null,
        match.invoice?.source || null,
        match.invoice?.tourId || null,
        JSON.stringify(tx.raw || {}),
      ]
    );
  }

  await pool.query(
    `UPDATE tour_manager.bank_import_runs
     SET total_rows = $2,
         exact_rows = $3,
         review_rows = $4,
         none_rows = $5
     WHERE id = $1`,
    [runId, transactions.length, exactRows, reviewRows, noneRows]
  );

  return { ok: true, runId, totalRows: transactions.length, exactRows, reviewRows, noneRows };
}

async function searchBankImportInvoices(query, amountRaw) {
  await ensureBankImportSchema();
  await ensureExxasArchivedColumn();
  const search = String(query || '').trim();
  const searchLike = search ? `%${search.toLowerCase()}%` : null;
  const searchExact = search || null;
  const amount = (() => {
    if (amountRaw == null || String(amountRaw).trim() === '') return null;
    const parsed = Number.parseFloat(String(amountRaw).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  })();
  const [renewalRows, exxasRows] = await Promise.all([
    pool.query(
      `SELECT 'renewal' AS invoice_source,
              i.id,
              i.invoice_number,
              i.amount_chf,
              i.invoice_status,
              i.tour_id,
              COALESCE(t.object_label, t.bezeichnung) AS tour_object_label,
              COALESCE(t.customer_name, t.kunde_ref) AS tour_customer_name
       FROM tour_manager.renewal_invoices i
       JOIN tour_manager.tours t ON t.id = i.tour_id
       WHERE i.invoice_status IN ('sent', 'overdue', 'draft')
         AND (
           $1::text IS NULL
           OR LOWER(COALESCE(t.object_label, t.bezeichnung)) LIKE $1
           OR LOWER(COALESCE(t.customer_name, t.kunde_ref)) LIKE $1
           OR LOWER(COALESCE(i.invoice_number, '')) LIKE $1
           OR CAST(i.id AS text) = $2
           OR CAST(i.tour_id AS text) = $2
         )
       ORDER BY COALESCE(i.due_at, i.created_at) DESC NULLS LAST, i.created_at DESC
       LIMIT 25`,
      [searchLike, searchExact]
    ),
    pool.query(
      `SELECT 'exxas' AS invoice_source,
              ei.id,
              ei.nummer AS invoice_number,
              ei.preis_brutto AS amount_chf,
              ei.exxas_status AS invoice_status,
              ei.tour_id,
              COALESCE(t.object_label, t.bezeichnung) AS tour_object_label,
              COALESCE(t.customer_name, t.kunde_ref) AS tour_customer_name
       FROM tour_manager.exxas_invoices ei
       LEFT JOIN tour_manager.tours t ON t.id = ei.tour_id
       LEFT JOIN tour_manager.renewal_invoices ri
         ON ri.tour_id = ei.tour_id
        AND ri.exxas_invoice_id = COALESCE(NULLIF(ei.exxas_document_id, ''), NULLIF(ei.nummer, ''))
       WHERE ei.archived_at IS NULL
         AND ei.exxas_status != 'bz'
         AND ri.id IS NULL
         AND (
           $1::text IS NULL
           OR LOWER(COALESCE(ei.kunde_name, '')) LIKE $1
           OR LOWER(COALESCE(ei.nummer, '')) LIKE $1
           OR LOWER(COALESCE(ei.bezeichnung, '')) LIKE $1
           OR LOWER(COALESCE(ei.ref_vertrag, '')) LIKE $1
           OR LOWER(COALESCE(ei.exxas_document_id, '')) LIKE $1
           OR CAST(ei.id AS text) = $2
           OR CAST(ei.tour_id AS text) = $2
         )
       ORDER BY COALESCE(ei.zahlungstermin, ei.created_at) DESC NULLS LAST, ei.created_at DESC
       LIMIT 25`,
      [searchLike, searchExact]
    ),
  ]);
  const invoices = [...renewalRows.rows, ...exxasRows.rows]
    .map((row) => {
      const numericAmount = Number.parseFloat(String(row.amount_chf ?? ''));
      const amountDiff = amount != null && Number.isFinite(numericAmount)
        ? Math.abs(numericAmount - amount)
        : Number.POSITIVE_INFINITY;
      return {
        ...row,
        canConfirmDirectly: row.invoice_source === 'renewal',
        requiresImport: row.invoice_source === 'exxas',
        amountDiff,
      };
    })
    .sort((a, b) => {
      if (a.invoice_source !== b.invoice_source) return a.invoice_source === 'renewal' ? -1 : 1;
      if (a.amountDiff !== b.amountDiff) return a.amountDiff - b.amountDiff;
      return String(a.invoice_number || '').localeCompare(String(b.invoice_number || ''));
    })
    .slice(0, 20)
    .map(({ amountDiff, ...row }) => row);
  return { ok: true, invoices };
}

async function importExxasInvoiceToInternalInvoice(invoiceId, actorEmail) {
  await ensureBankImportSchema();
  return importExxasInvoiceToRenewal(invoiceId, actorEmail);
}

async function confirmBankTransaction(txId, invoiceId, invoiceSource, actorEmail) {
  await ensureBankImportSchema();
  if (!Number.isFinite(txId)) return { ok: false, error: 'Ungültige Transaktion.' };
  const normalizedInvoiceId = String(invoiceId || '').trim();
  if (!normalizedInvoiceId) return { ok: false, error: 'Rechnung fehlt.' };
  const normalizedSource = String(invoiceSource || 'renewal').trim() || 'renewal';
  if (!['renewal', 'exxas'].includes(normalizedSource)) {
    return { ok: false, error: 'Rechnungsquelle ist ungültig.' };
  }
  const txRes = await pool.query(
    `SELECT * FROM tour_manager.bank_import_transactions WHERE id = $1 LIMIT 1`,
    [txId]
  );
  const tx = txRes.rows[0];
  if (!tx) return { ok: false, error: 'Transaktion nicht gefunden.' };
  let finalInvoiceId = normalizedInvoiceId;
  let finalTourId = Number.isFinite(Number(tx.matched_tour_id)) ? Number(tx.matched_tour_id) : null;
  let reasonSuffix = 'manuell bestätigt';

  if (normalizedSource === 'exxas') {
    const imported = await importExxasInvoiceToInternalInvoice(normalizedInvoiceId, actorEmail);
    if (!imported.ok) return imported;
    if (!imported.invoiceId) {
      return { ok: false, error: 'Exxas-Rechnung konnte nicht importiert werden.' };
    }
    finalInvoiceId = String(imported.invoiceId);
    finalTourId = imported.tourId || finalTourId;
    reasonSuffix += ' | Exxas importiert';
  }

  const applied = await applyImportedPayment(finalInvoiceId, actorEmail, {
    bookingDate: tx.booking_date,
    note: `Bankimport #${tx.run_id}: ${tx.reference_raw || '-'}`,
  });
  if (!applied) {
    return { ok: false, error: 'Rechnung konnte nicht verbucht werden.' };
  }
  if (!finalTourId) {
    const invoiceRes = await pool.query(
      `SELECT tour_id
       FROM tour_manager.renewal_invoices
       WHERE id = $1
       LIMIT 1`,
      [finalInvoiceId]
    );
    finalTourId = invoiceRes.rows[0]?.tour_id || null;
  }
  const nextReason = [String(tx.match_reason || '').trim(), reasonSuffix].filter(Boolean).join(' | ');
  await pool.query(
    `UPDATE tour_manager.bank_import_transactions
     SET match_status = 'exact',
         matched_invoice_id = $2::bigint,
         matched_invoice_source = $3,
         matched_tour_id = COALESCE($4, matched_tour_id),
         match_reason = $5,
         confidence = GREATEST(confidence, 95)
     WHERE id = $1`,
    [txId, finalInvoiceId, 'renewal', finalTourId, nextReason]
  );
  return { ok: true, invoiceId: finalInvoiceId, invoiceSource: 'renewal' };
}

async function ignoreBankTransaction(txId) {
  await ensureBankImportSchema();
  if (!Number.isFinite(txId)) return { ok: false, error: 'Ungültige Transaktion.' };
  await pool.query(
    `UPDATE tour_manager.bank_import_transactions
     SET match_status = 'ignored',
         match_reason = COALESCE(match_reason, '') || ' | ignoriert'
     WHERE id = $1`,
    [txId]
  );
  return { ok: true };
}

async function createManualInvoice(tourId, body, actorEmail) {
  await ensureSuggestionSchema();
  if (!Number.isFinite(tourId)) return { ok: false, error: 'Ungültige Tour-ID' };

  const invoiceNumber = String(body?.invoiceNumber || '').trim() || null;
  const amountRaw = String(body?.amountChf || '').trim();
  const amountChf = Number.parseFloat(amountRaw.replace(',', '.'));
  const dueAtRaw = String(body?.dueAt || '').trim();
  const note = String(body?.paymentNote || '').trim() || null;
  const skontoRaw = String(body?.skontoChf || '').trim();
  const skontoChf = skontoRaw ? Number.parseFloat(skontoRaw.replace(',', '.')) : null;
  if (skontoRaw && (!Number.isFinite(skontoChf) || skontoChf < 0)) {
    return { ok: false, error: 'Skonto-Betrag ist ungültig.' };
  }
  const markPaidNow =
    body?.markPaidNow === true || body?.markPaidNow === '1' || body?.markPaidNow === 'on' || body?.markPaidNow === 'true';

  if (!Number.isFinite(amountChf) || amountChf <= 0) {
    return { ok: false, error: 'Betrag ist ungültig.' };
  }
  const dueAtInputIso = dueAtRaw ? toIsoDate(dueAtRaw) : null;
  if (dueAtRaw && !dueAtInputIso) {
    return { ok: false, error: 'Fälligkeitsdatum ist ungültig.' };
  }
  const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId]);
  const tourRaw = tourResult.rows[0];
  if (!tourRaw) return { ok: false, error: 'Tour nicht gefunden.' };
  const tour = normalizeTourRow(tourRaw);
  const existingInvoicesResult = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM tour_manager.renewal_invoices
     WHERE tour_id = $1`,
    [tourId]
  );
  const hasExistingInvoices = (existingInvoicesResult.rows[0]?.cnt || 0) > 0;
  const dueAtIso = dueAtInputIso || computeManualInvoiceDueDateIso(tour, hasExistingInvoices);

  let status = 'sent';
  let paidAtIso = null;
  let paymentMethod = null;
  let subscriptionStartIso = null;
  let subscriptionEndIso = null;
  if (markPaidNow) {
    status = 'paid';
    const paidAtRaw = String(body?.paidAt || '').trim();
    const subscriptionStartRaw = String(body?.subscriptionStartAt || '').trim();
    const paymentMethodRaw = String(body?.paymentMethod || '').trim().toLowerCase();
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethodRaw)) {
      return { ok: false, error: 'Zahlungsart ist ungültig.' };
    }
    const subWindow = getSubscriptionWindowFromStart(subscriptionStartRaw);
    if (!subWindow.startIso || !subWindow.endIso) {
      return { ok: false, error: 'Abo gültig ab ist ungültig.' };
    }
    paidAtIso = toIsoDate(paidAtRaw || subscriptionStartRaw);
    if (!paidAtIso) {
      return { ok: false, error: 'Bezahlt am ist ungültig.' };
    }
    paymentMethod = paymentMethodRaw;
    subscriptionStartIso = subWindow.startIso;
    subscriptionEndIso = subWindow.endIso;
  }

  const inserted = await pool.query(
    `INSERT INTO tour_manager.renewal_invoices (
       tour_id, invoice_number, invoice_status, amount_chf, due_at,
       sent_at, paid_at, paid_at_date, payment_method, payment_source, payment_note,
       skonto_chf, recorded_by, recorded_at, subscription_start_at, subscription_end_at, invoice_kind
     ) VALUES (
       $1, $2, $3, $4::numeric, $5::date,
       CASE WHEN $3 IN ('sent','paid') THEN NOW() ELSE NULL END,
       $6::date, $6::date, $7, 'manual', $8,
       $9::numeric, $10, NOW(), $11::date, $12::date, 'manual_extension'
     )
     RETURNING id`,
    [
      tourId,
      invoiceNumber,
      status,
      amountChf,
      dueAtIso,
      paidAtIso,
      paymentMethod,
      note,
      skontoChf,
      actorEmail,
      subscriptionStartIso,
      subscriptionEndIso,
    ]
  );

  if (markPaidNow && subscriptionEndIso) {
    await pool.query(
      `UPDATE tour_manager.tours
       SET status = 'ACTIVE',
           term_end_date = $2::date,
           ablaufdatum = $2::date,
           subscription_start_date = $3::date,
           updated_at = NOW()
       WHERE id = $1`,
      [tourId, subscriptionEndIso, subscriptionStartIso]
    );
  }

  await logAction(tourId, 'admin', actorEmail, 'INVOICE_CREATE_MANUAL', {
    invoice_id: inserted.rows[0]?.id || null,
    invoice_number: invoiceNumber,
    amount_chf: amountChf,
    due_at: dueAtIso,
    mark_paid_now: markPaidNow,
    paid_at: paidAtIso,
    payment_method: paymentMethod,
    payment_method_label: paymentMethod ? paymentMethodLabel(paymentMethod) : null,
    subscription_start_at: subscriptionStartIso,
    subscription_end_at: subscriptionEndIso,
    note,
  });

  return { ok: true, invoiceId: inserted.rows[0]?.id, paymentSaved: markPaidNow };
}

async function markPaidManualInvoice(tourId, invoiceId, body, actorEmail) {
  await ensureSuggestionSchema();
  if (!Number.isFinite(tourId) || !Number.isFinite(invoiceId)) {
    return { ok: false, error: 'Ungültige Parameter' };
  }

  const subscriptionStartRaw = String(body?.subscriptionStartAt || '').trim();
  const paidAtRaw = String(body?.paidAt || '').trim();
  const note = String(body?.paymentNote || '').trim() || null;
  const paymentMethodRaw = String(body?.paymentMethod || '').trim().toLowerCase();
  if (!ALLOWED_PAYMENT_METHODS.has(paymentMethodRaw)) {
    return { ok: false, error: 'Zahlungsart ist ungültig.' };
  }
  const paymentMethod = paymentMethodRaw;
  const amountRaw = String(body?.amountChf || '').trim();
  const amountChf = amountRaw ? Number.parseFloat(amountRaw.replace(',', '.')) : null;

  const subWindow = getSubscriptionWindowFromStart(subscriptionStartRaw);
  if (!subWindow.startIso || !subWindow.endIso) {
    return { ok: false, error: 'Abo gültig ab ist ungültig.' };
  }
  const paidAtIso = toIsoDate(paidAtRaw || subscriptionStartRaw);
  if (!paidAtIso) {
    return { ok: false, error: 'Bezahlt am ist ungültig.' };
  }
  if (amountChf !== null && !Number.isFinite(amountChf)) {
    return { ok: false, error: 'Betrag ist ungültig.' };
  }

  const invoiceResult = await pool.query(
    `SELECT id, tour_id, invoice_number, invoice_kind
     FROM tour_manager.renewal_invoices
     WHERE id = $1 AND tour_id = $2
     LIMIT 1`,
    [invoiceId, tourId]
  );
  const invoice = invoiceResult.rows[0];
  if (!invoice) {
    return { ok: false, error: 'Rechnung nicht gefunden.' };
  }

  await pool.query(
    `UPDATE tour_manager.renewal_invoices
     SET invoice_status = 'paid',
         paid_at = $3::date,
         payment_method = $4,
         payment_source = 'manual',
         payment_note = $5,
         recorded_by = $6,
         recorded_at = NOW(),
         subscription_start_at = $7::date,
         subscription_end_at = $8::date,
         amount_chf = COALESCE($9::numeric, amount_chf)
     WHERE id = $1
       AND tour_id = $2`,
    [
      invoiceId,
      tourId,
      paidAtIso,
      paymentMethod,
      note,
      actorEmail,
      subWindow.startIso,
      subWindow.endIso,
      amountChf,
    ]
  );

  // Reaktivierung: Matterport-Space bei Zahlungseingang aktivieren
  if (invoice.invoice_kind === 'portal_reactivation') {
    const tourMpRes = await pool.query(
      `SELECT canonical_matterport_space_id, matterport_space_id
       FROM tour_manager.tours WHERE id = $1 LIMIT 1`,
      [tourId]
    );
    const spaceId = tourMpRes.rows[0]?.canonical_matterport_space_id
      || tourMpRes.rows[0]?.matterport_space_id;
    if (spaceId) {
      matterport.unarchiveSpace(spaceId).then((mpResult) => {
        if (mpResult?.success) {
          pool.query(
            `UPDATE tour_manager.tours SET matterport_state = 'active', updated_at = NOW() WHERE id = $1`,
            [tourId]
          ).catch(() => null);
        }
      }).catch((err) => {
        console.warn('markPaidManualInvoice: unarchiveSpace failed', tourId, err.message);
      });
    }
  }

  await pool.query(
    `UPDATE tour_manager.tours
     SET status = 'ACTIVE',
         term_end_date = $2::date,
         ablaufdatum = $2::date,
         subscription_start_date = $3::date,
         updated_at = NOW()
     WHERE id = $1`,
    [tourId, subWindow.endIso, subWindow.startIso]
  );

  await logAction(tourId, 'admin', actorEmail, 'INVOICE_MARK_PAID_MANUAL', {
    invoice_id: invoiceId,
    invoice_number: invoice.invoice_number || null,
    payment_method: paymentMethod,
    payment_method_label: paymentMethodLabel(paymentMethod),
    paid_at: paidAtIso,
    subscription_start_at: subWindow.startIso,
    subscription_end_at: subWindow.endIso,
    amount_chf: amountChf,
    note,
  });

  return { ok: true };
}

async function getLinkMatterportJson(query) {
  const q = String(query.q || '').trim();
  const qLower = q.toLowerCase();
  const openSpaceId = String(query.openSpaceId || '').trim();
  const allowedSort = new Set(['space', 'created']);
  const sort = allowedSort.has(String(query.sort || '')) ? String(query.sort) : 'space';
  const order = String(query.order || '').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const page = Math.max(parseInt(String(query.page || ''), 10) || 1, 1);
  const pageSize = 10;
  const [matterportResult, linkedResult] = await Promise.all([
    matterport.listModels(),
    pool.query(`
      SELECT DISTINCT TRIM(matterport_space_id) AS space_id
      FROM tour_manager.tours
      WHERE matterport_space_id IS NOT NULL
        AND TRIM(matterport_space_id) != ''
    `),
  ]);

  const mpError = matterportResult.error || null;
  const activeModels = (matterportResult.results || [])
    .filter((model) => String(model.state || '').toLowerCase() === 'active');
  const linkedSpaceIds = new Set(
    linkedResult.rows
      .map((row) => String(row.space_id || '').trim())
      .filter(Boolean)
  );
  const allOpenSpaces = activeModels.filter((model) => !linkedSpaceIds.has(String(model.id || '').trim()));

  // internalId wie "#12345" → Bestellvorschlag nachschlagen
  const orderNosToLookup = [];
  for (const model of allOpenSpaces) {
    const internalId = String(model.internalId || '').trim();
    const match = internalId.match(/^#?(\d+)$/);
    if (match) orderNosToLookup.push(parseInt(match[1], 10));
  }
  const orderByNo = new Map();
  if (orderNosToLookup.length > 0) {
    try {
      const orderRows = await pool.query(
        `SELECT o.order_no, o.status, o.address, o.billing, o.schedule,
                c.id AS core_customer_id,
                c.company AS core_company,
                c.name AS core_name,
                c.email AS core_email,
                c.customer_number
         FROM booking.orders o
         LEFT JOIN core.customers c
           ON core.customer_email_matches(COALESCE(o.billing->>'email',''), c.email, c.email_aliases)
           AND c.email IS NOT NULL AND c.email != ''
         WHERE o.order_no = ANY($1::int[])`,
        [orderNosToLookup]
      );
      // Für gefundene Kunden auch deren Kontakte laden
      const customerIdsForContacts = [...new Set(
        orderRows.rows.filter(r => r.core_customer_id).map(r => r.core_customer_id)
      )];
      const contactsByCustomerId = new Map();
      if (customerIdsForContacts.length > 0) {
        try {
          const contactRows = await pool.query(
            `SELECT customer_id, id, name, email, phone
             FROM core.customer_contacts
             WHERE customer_id = ANY($1::int[])
             ORDER BY sort_order, id`,
            [customerIdsForContacts]
          );
          for (const ct of contactRows.rows) {
            if (!contactsByCustomerId.has(ct.customer_id)) contactsByCustomerId.set(ct.customer_id, []);
            contactsByCustomerId.get(ct.customer_id).push({ name: ct.name, email: ct.email, tel: ct.phone });
          }
        } catch (e) {
          console.warn('[admin-phase3] contacts lookup:', e.message);
        }
      }
      for (const r of orderRows.rows) {
        orderByNo.set(r.order_no, {
          order_no: r.order_no,
          status: r.status,
          address: r.address,
          company: r.billing?.company || r.billing?.name || '',
          email: r.billing?.email || '',
          date: r.schedule?.date || null,
          coreCustomerId: r.core_customer_id ? String(r.core_customer_id) : null,
          coreCompany: r.core_company || r.core_name || r.billing?.company || r.billing?.name || '',
          coreEmail: r.core_email || r.billing?.email || '',
          coreCustomerNumber: r.customer_number || '',
          contacts: r.core_customer_id ? (contactsByCustomerId.get(r.core_customer_id) || []) : [],
        });
      }
    } catch (e) {
      console.warn('[admin-phase3] booking order lookup:', e.message);
    }
  }

  // Spaces mit suggestedOrder anreichern
  const enrichedOpenSpaces = allOpenSpaces.map((model) => {
    const internalId = String(model.internalId || '').trim();
    const match = internalId.match(/^#?(\d+)$/);
    const orderNo = match ? parseInt(match[1], 10) : null;
    return {
      ...model,
      suggestedOrder: orderNo != null ? (orderByNo.get(orderNo) || null) : null,
    };
  });

  const autoOpenSpace = openSpaceId
    ? (enrichedOpenSpaces.find((model) => String(model.id || '').trim() === openSpaceId) || null)
    : null;

  let openSpaces = enrichedOpenSpaces;
  if (qLower) {
    openSpaces = enrichedOpenSpaces.filter((model) => {
      const createdLabel = model.created
        ? new Date(model.created).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      const haystack = [
        model.name || '',
        model.id || '',
        model.internalId || '',
        createdLabel,
      ].join(' ').toLowerCase();
      return haystack.includes(qLower);
    });
  }

  const compareString = (a, b) => String(a || '').localeCompare(String(b || ''), 'de', { sensitivity: 'base' });
  const compareDate = (a, b) => {
    const ta = a ? new Date(a).getTime() : 0;
    const tb = b ? new Date(b).getTime() : 0;
    return ta - tb;
  };
  openSpaces.sort((a, b) => {
    let cmp = 0;
    if (sort === 'created') cmp = compareDate(a.created, b.created);
    else cmp = compareString(a.name || a.id, b.name || b.id);
    return order === 'desc' ? -cmp : cmp;
  });

  const totalItems = openSpaces.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const pagedOpenSpaces = openSpaces.slice(offset, offset + pageSize);

  return {
    ok: true,
    openSpaces: pagedOpenSpaces,
    mpError,
    matterportOpenCount: allOpenSpaces.length,
    filteredOpenCount: totalItems,
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
    },
    filters: { q },
    sort,
    order,
    autoOpenSpace,
  };
}

async function postLinkMatterport(body) {
  const mpId = String(body?.matterportSpaceId || '').trim();
  const tourUrl = String(body?.tourUrl || '').trim();
  const cannotAssign = body?.cannotAssign === true || body?.cannotAssign === '1';
  const archiveIt = body?.archiveIt === true || body?.archiveIt === '1';
  const selectedCustomerKey = String(body?.coreCustomerId || body?.exxasCustomerId || '').trim();
  const customerName = String(body?.customerName || '').trim();
  const customerEmail = String(body?.customerEmail || '').trim();
  const customerContact = String(body?.customerContact || '').trim();
  const bezeichnung = String(body?.bezeichnung || '').trim();
  const bookingOrderNo = body?.bookingOrderNo != null && body.bookingOrderNo !== '' ? parseInt(String(body.bookingOrderNo), 10) : null;

  if (!mpId || (!tourUrl && !cannotAssign)) {
    return { ok: false, error: 'missing' };
  }

  const effectiveTourUrl = tourUrl || `https://my.matterport.com/show/?m=${mpId}`;
  const initialStatus = cannotAssign && archiveIt ? 'ARCHIVED' : 'ACTIVE';

  const duplicate = await pool.query(
    `SELECT id
     FROM tour_manager.tours
     WHERE TRIM(matterport_space_id) = $1
     ORDER BY updated_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [mpId]
  );
  if (duplicate.rows[0]?.id) {
    return { ok: false, error: 'duplicate', duplicateTourId: duplicate.rows[0].id };
  }

  const { model, error: modelError } = await matterport.getModel(mpId);
  const matterportCreatedAt = model?.created || null;
  const matterportState = model?.state || 'active';
  const matterportIsOwn = !!(model && !modelError);
  const derivedName = matterport.deriveTourDisplayLabelFromModel(model, bezeichnung);
  const termStartDate = matterportCreatedAt ? new Date(matterportCreatedAt) : new Date();
  const initialTermEndDate = toIsoDate(getInitialTermEndDate(termStartDate));

  const baseContractId = `MP-${mpId}`.slice(0, 32);
  let exxasAboId = baseContractId;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const exists = await pool.query('SELECT id FROM tour_manager.tours WHERE exxas_abo_id = $1 LIMIT 1', [exxasAboId]);
    if (!exists.rows[0]) break;
    const suffix = `-${attempt}`.slice(0, 4);
    exxasAboId = `${baseContractId.slice(0, 32 - suffix.length)}${suffix}`;
  }

  let kundeRef = null;
  let coreCustomerIdFk = null;
  if (!cannotAssign && selectedCustomerKey) {
    const pid = parseInt(selectedCustomerKey, 10);
    if (Number.isFinite(pid) && pid > 0) {
      const crow = await customerLookup.getCustomerById(pid);
      if (crow?.id) {
        coreCustomerIdFk = pid;
        const xref = crow.exxas_contact_id != null ? String(crow.exxas_contact_id).trim() : '';
        kundeRef = xref || null;
      }
    } else {
      kundeRef = selectedCustomerKey;
    }
  }

  const effectiveCustomerName = cannotAssign ? null : customerName || null;
  const effectiveCustomerEmail = cannotAssign ? null : customerEmail || null;
  const effectiveCustomerContact = cannotAssign ? null : customerContact || null;
  const effectiveCoreCustomerId = cannotAssign ? null : coreCustomerIdFk;
  const effectiveKundeRef = cannotAssign ? null : kundeRef;

  try {
    const insertResult = await pool.query(
      `INSERT INTO tour_manager.tours (
        exxas_abo_id,
        matterport_space_id,
        tour_url,
        kunde_ref,
        customer_id,
        customer_name,
        customer_email,
        customer_contact,
        bezeichnung,
        object_label,
        matterport_created_at,
        term_end_date,
        ablaufdatum,
        matterport_state,
        matterport_is_own,
        status,
        booking_order_no
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12::date, $12::date, $13, $14, $15, $16
      ) RETURNING id`,
      [
        exxasAboId,
        mpId,
        effectiveTourUrl,
        effectiveKundeRef,
        effectiveCoreCustomerId,
        effectiveCustomerName,
        effectiveCustomerEmail,
        effectiveCustomerContact,
        derivedName,
        derivedName,
        matterportCreatedAt,
        initialTermEndDate,
        matterportState,
        matterportIsOwn,
        initialStatus,
        Number.isFinite(bookingOrderNo) && bookingOrderNo > 0 ? bookingOrderNo : null,
      ]
    );
    const newTourId = insertResult.rows[0]?.id;
    if (newTourId) {
      await pool.query(
        `UPDATE tour_manager.tours
         SET subscription_start_date = (created_at AT TIME ZONE 'UTC')::date
         WHERE id = $1 AND subscription_start_date IS NULL`,
        [newTourId]
      );
      await logAction(newTourId, 'admin', null, 'ADMIN_TOUR_CREATED', {
        matterport_space_id: mpId,
        booking_order_no: Number.isFinite(bookingOrderNo) && bookingOrderNo > 0 ? bookingOrderNo : null,
        bezeichnung: derivedName,
      });
    }
  } catch (e) {
    return { ok: false, error: 'insert', message: e.message };
  }

  if (cannotAssign && archiveIt && mpId) {
    try {
      await matterport.archiveSpace(mpId);
    } catch (e) {
      console.warn('[admin-phase3] archiveSpace:', e.message);
    }
  }

  // Bestellnummer als interne ID in Matterport schreiben
  if (!cannotAssign && Number.isFinite(bookingOrderNo) && bookingOrderNo > 0 && mpId) {
    try {
      await matterport.patchModelInternalId(mpId, `#${bookingOrderNo}`);
    } catch (e) {
      console.warn('[admin-phase3] patchModelInternalId:', e.message);
    }
  }

  return { ok: true };
}

async function getLinkInvoiceJson(tourId, search) {
  await ensureExxasArchivedColumn();
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tour.rows[0]) {
    return { ok: false, error: 'Tour nicht gefunden' };
  }
  const normalizedTour = normalizeTourRow(tour.rows[0]);
  const s = String(search || '').trim();
  let q = `
    SELECT *
    FROM tour_manager.exxas_invoices
    WHERE archived_at IS NULL
      AND tour_id IS NULL
    ORDER BY zahlungstermin DESC NULLS LAST, dok_datum DESC NULLS LAST
  `;
  const params = [];
  if (s) {
    q = `SELECT * FROM tour_manager.exxas_invoices
      WHERE archived_at IS NULL
        AND tour_id IS NULL
        AND (LOWER(COALESCE(kunde_name,'')) LIKE $1 OR LOWER(COALESCE(bezeichnung,'')) LIKE $1 OR LOWER(COALESCE(nummer,'')) LIKE $1)
      ORDER BY zahlungstermin DESC NULLS LAST, dok_datum DESC NULLS LAST`;
    params.push(`%${s.toLowerCase()}%`);
  }
  const [invoices, suggestions, knownInvoiceRows, liveCandidates] = await Promise.all([
    pool.query(q, params),
    getInvoiceLinkSuggestionsForTour(normalizedTour, { limit: 5, scanLimit: 250 }),
    pool.query(`
      SELECT id, tour_id, exxas_document_id, nummer
      FROM tour_manager.exxas_invoices
      WHERE archived_at IS NULL
    `),
    getLiveLinkInvoiceCandidates(normalizedTour, s),
  ]);
  const linkedRefs = new Set();
  for (const row of knownInvoiceRows.rows) {
    const externalRef = getExternalInvoiceRef(row);
    if (!externalRef) continue;
    if (row.tour_id != null) {
      linkedRefs.add(externalRef);
      continue;
    }
  }
  const liveByExternalRef = new Map();
  for (const row of liveCandidates.invoices) {
    const externalRef = getExternalInvoiceRef(row);
    if (!externalRef || linkedRefs.has(externalRef)) continue;
    if (!liveByExternalRef.has(externalRef)) {
      liveByExternalRef.set(externalRef, row);
    }
  }
  const mergedInvoices = [];
  for (const row of invoices.rows) {
    const externalRef = getExternalInvoiceRef(row);
    const liveRow = externalRef ? liveByExternalRef.get(externalRef) : null;
    mergedInvoices.push(buildLinkInvoiceRow(row, {
      linkId: `local:${row.id}`,
      source: liveRow ? 'local_live' : 'local',
      liveRow,
    }));
    if (externalRef && liveRow) {
      liveByExternalRef.delete(externalRef);
    }
  }
  for (const row of liveByExternalRef.values()) {
    mergedInvoices.push(buildLinkInvoiceRow(row, {
      linkId: `live:${getExternalInvoiceRef(row)}`,
      source: 'live',
    }));
  }
  mergedInvoices.sort(compareLinkInvoiceRows);
  return {
    ok: true,
    tour: normalizedTour,
    invoices: mergedInvoices,
    suggestions,
    liveError: liveCandidates.error || null,
    search: s,
  };
}

function getExternalInvoiceRef(row) {
  const value = row?.exxas_document_id ?? row?.nummer ?? row?.id ?? null;
  const normalized = String(value || '').trim();
  return normalized || null;
}

function pickInvoiceValue(primary, secondary) {
  if (primary != null && String(primary).trim() !== '') return primary;
  return secondary ?? null;
}

function buildLinkInvoiceRow(row, options = {}) {
  const { linkId, source = 'local', liveRow = null } = options;
  const merged = liveRow ? { ...row, ...liveRow, id: row.id, tour_id: row.tour_id } : row;
  return {
    ...merged,
    source,
    link_id: linkId || `local:${row.id}`,
    exxas_document_id: getExternalInvoiceRef(merged),
    nummer: pickInvoiceValue(merged.nummer, row?.nummer),
    kunde_name: pickInvoiceValue(merged.kunde_name, row?.kunde_name),
    bezeichnung: pickInvoiceValue(merged.bezeichnung, row?.bezeichnung),
    zahlungstermin: pickInvoiceValue(merged.zahlungstermin, row?.zahlungstermin),
    dok_datum: pickInvoiceValue(merged.dok_datum, row?.dok_datum),
    preis_brutto: pickInvoiceValue(merged.preis_brutto, row?.preis_brutto),
    betrag: pickInvoiceValue(merged.preis_brutto, row?.preis_brutto),
  };
}

function compareLinkInvoiceRows(a, b) {
  const aDate = new Date(a.zahlungstermin || a.dok_datum || '1970-01-01').getTime();
  const bDate = new Date(b.zahlungstermin || b.dok_datum || '1970-01-01').getTime();
  if (aDate !== bDate) return bDate - aDate;
  return String(b.nummer || b.exxas_document_id || '').localeCompare(String(a.nummer || a.exxas_document_id || ''));
}

async function getLiveLinkInvoiceCandidates(tour, search) {
  const terms = search
    ? [search]
    : [
      tour.canonical_exxas_contract_id,
      tour.kunde_ref,
      tour.customer_name,
      tour.canonical_customer_name,
      tour.customer_email ? String(tour.customer_email).split('@')[0] : null,
    ];
  const uniqueTerms = [...new Set(
    terms
      .map((value) => String(value || '').trim())
      .filter((value) => value.length >= 2)
  )].slice(0, search ? 1 : 4);
  if (!uniqueTerms.length) return { invoices: [], error: null };
  const merged = new Map();
  let lastError = null;
  for (const term of uniqueTerms) {
    // eslint-disable-next-line no-await-in-loop
    const result = await exxas.searchInvoices(term, { limit: search ? 40 : 25, openOnly: false });
    if (result.error) lastError = result.error;
    for (const row of result.invoices || []) {
      const externalRef = getExternalInvoiceRef(row);
      if (!externalRef || merged.has(externalRef)) continue;
      merged.set(externalRef, row);
    }
  }
  // Bei gezielter Suche zusätzlich den Detail-Endpoint direkt abfragen,
  // da /api/v2/documents oft nur eine begrenzte Anzahl Dokumente zurückgibt
  // und ältere Rechnungen im List-Endpoint fehlen können.
  if (search && merged.size === 0) {
    const directResult = await exxas.getInvoiceDetails(search.trim()).catch(() => null);
    if (directResult?.success && directResult?.invoice) {
      const row = directResult.invoice;
      const externalRef = getExternalInvoiceRef(row);
      if (externalRef && !merged.has(externalRef)) {
        merged.set(externalRef, row);
      }
    }
  }
  return {
    invoices: [...merged.values()].sort(compareLinkInvoiceRows),
    error: merged.size > 0 ? null : lastError,
  };
}

async function fetchLiveInvoiceForLink(invoiceRef) {
  const liveInvoice = await exxas.getInvoiceDetails(invoiceRef);
  const invoice = liveInvoice?.invoice || null;
  if (!liveInvoice?.success || !invoice) return null;
  const canonicalRef = getExternalInvoiceRef(invoice);
  if (!canonicalRef) return null;
  return { liveInvoice, invoice, canonicalRef };
}

async function updateLinkedExxasInvoiceRow(rowId, tourId, invoice, fallbackInvoiceRef) {
  const canonicalRef = getExternalInvoiceRef(invoice) || String(fallbackInvoiceRef || '').trim() || null;
  const updated = await pool.query(
    `UPDATE tour_manager.exxas_invoices
     SET tour_id = $1,
         exxas_document_id = $2,
         nummer = $3,
         kunde_name = $4,
         bezeichnung = $5,
         ref_kunde = $6,
         ref_vertrag = $7,
         exxas_status = $8,
         sv_status = $9,
         zahlungstermin = $10::date,
         dok_datum = $11::date,
         preis_brutto = $12::numeric,
         archived_at = NULL,
         synced_at = NOW()
     WHERE id = $13
     RETURNING id`,
    [
      tourId,
      canonicalRef,
      invoice?.nummer || null,
      invoice?.kunde_name || null,
      invoice?.bezeichnung || null,
      invoice?.ref_kunde || null,
      invoice?.ref_vertrag || null,
      invoice?.exxas_status || null,
      invoice?.sv_status || null,
      invoice?.zahlungstermin || null,
      invoice?.dok_datum || null,
      invoice?.preis_brutto ?? null,
      rowId,
    ]
  );
  return updated.rows[0] || null;
}

async function syncLinkedRenewalInvoice(exxasInvoiceRowId, actorEmail = null) {
  if (!Number.isFinite(Number(exxasInvoiceRowId))) return null;
  return syncRenewalInvoiceFromExxas(exxasInvoiceRowId, actorEmail, { createIfMissing: true }).catch(() => null);
}

async function linkLocalExxasInvoiceToTour(tourId, localInvoiceId, actorEmail = null) {
  const inv = await pool.query(
    `SELECT id, tour_id, exxas_document_id, nummer
     FROM tour_manager.exxas_invoices
     WHERE id = $1`,
    [localInvoiceId]
  );
  const existingRow = inv.rows[0] || null;
  if (!existingRow) return { ok: false, error: 'notfound' };
  if (existingRow.tour_id != null) return { ok: false, error: 'alreadylinked' };
  const invoiceRef = getExternalInvoiceRef(existingRow);
  const liveBundle = invoiceRef ? await fetchLiveInvoiceForLink(invoiceRef).catch(() => null) : null;
  if (liveBundle?.invoice) {
    await updateLinkedExxasInvoiceRow(existingRow.id, tourId, liveBundle.invoice, invoiceRef);
  } else {
    await pool.query(
      `UPDATE tour_manager.exxas_invoices
       SET tour_id = $1,
           archived_at = NULL,
           synced_at = NOW()
       WHERE id = $2`,
      [tourId, existingRow.id]
    );
  }
  const renewalSync = await syncLinkedRenewalInvoice(existingRow.id, actorEmail);
  return {
    ok: true,
    invoiceId: existingRow.id,
    renewalInvoiceId: renewalSync?.invoiceId || null,
  };
}

async function linkLiveExxasInvoiceToTour(tourId, externalInvoiceId, actorEmail = null) {
  await ensureExxasArchivedColumn();
  const invoiceRef = String(externalInvoiceId || '').trim();
  if (!invoiceRef) return { ok: false, error: 'missing' };
  const liveBundle = await fetchLiveInvoiceForLink(invoiceRef);
  if (!liveBundle?.invoice) {
    return { ok: false, error: 'notfound' };
  }
  const { invoice, canonicalRef } = liveBundle;
  const existing = await pool.query(
    `SELECT id, tour_id
     FROM tour_manager.exxas_invoices
     WHERE exxas_document_id IN ($1, $2)
        OR nummer IN ($1, $2)
     ORDER BY CASE
       WHEN exxas_document_id = $1 THEN 0
       WHEN exxas_document_id = $2 THEN 1
       WHEN nummer = $1 THEN 2
       WHEN nummer = $2 THEN 3
       ELSE 4
     END, id DESC
     LIMIT 1`,
    [canonicalRef, invoiceRef]
  );
  const existingRow = existing.rows[0] || null;
  if (existingRow?.tour_id != null) return { ok: false, error: 'alreadylinked' };
  if (existingRow) {
    await updateLinkedExxasInvoiceRow(existingRow.id, tourId, invoice, canonicalRef);
    const renewalSync = await syncLinkedRenewalInvoice(existingRow.id, actorEmail);
    return {
      ok: true,
      invoiceId: existingRow.id,
      created: false,
      renewalInvoiceId: renewalSync?.invoiceId || null,
    };
  }

  const duplicate = await pool.query(
    `SELECT id, tour_id
     FROM tour_manager.exxas_invoices
     WHERE exxas_document_id = $1
        OR nummer = $1
     ORDER BY CASE WHEN exxas_document_id = $1 THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [canonicalRef]
  );
  const duplicateRow = duplicate.rows[0] || null;
  if (duplicateRow?.tour_id != null) return { ok: false, error: 'alreadylinked' };
  if (duplicateRow) {
    await updateLinkedExxasInvoiceRow(duplicateRow.id, tourId, invoice, canonicalRef);
    const renewalSync = await syncLinkedRenewalInvoice(duplicateRow.id, actorEmail);
    return {
      ok: true,
      invoiceId: duplicateRow.id,
      created: false,
      renewalInvoiceId: renewalSync?.invoiceId || null,
    };
  }

  const inserted = await pool.query(
    `INSERT INTO tour_manager.exxas_invoices (
      tour_id,
      exxas_document_id,
      nummer,
      kunde_name,
      bezeichnung,
      ref_kunde,
      ref_vertrag,
      exxas_status,
      sv_status,
      zahlungstermin,
      dok_datum,
      preis_brutto,
      synced_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8,
      $9,
      $10::date,
      $11::date,
      $12::numeric,
      NOW()
    )
    RETURNING id`,
    [
      tourId,
      canonicalRef,
      invoice.nummer || null,
      invoice.kunde_name || null,
      invoice.bezeichnung || null,
      invoice.ref_kunde || null,
      invoice.ref_vertrag || null,
      invoice.exxas_status || null,
      invoice.sv_status || null,
      invoice.zahlungstermin || null,
      invoice.dok_datum || null,
      invoice.preis_brutto ?? null,
    ]
  );
  const insertedId = inserted.rows[0]?.id || null;
  const renewalSync = insertedId ? await syncLinkedRenewalInvoice(insertedId, actorEmail) : null;
  return {
    ok: true,
    invoiceId: insertedId,
    created: true,
    renewalInvoiceId: renewalSync?.invoiceId || null,
  };
}

/**
 * Versucht nach dem Verknüpfen einer Exxas-Rechnung automatisch einen passenden Kunden
 * in core.customers zu finden.
 * Prio 1: ref_kunde → exxas_contact_id (exakter Match)
 * Prio 2: kunde_name → name/company (LIKE, nur bei eindeutigem Treffer)
 * Gibt { id, display_name, email, ref } oder null zurück.
 */
async function tryAutoMatchCustomer(refKunde, kundeName) {
  try {
    let matched = null;
    if (refKunde) {
      matched = await customerLookup.getCustomerByExxasRef(String(refKunde).trim());
    }
    if (!matched && kundeName && String(kundeName).trim().length >= 3) {
      const matches = await customerLookup.searchLocalCustomers(String(kundeName).trim(), 2);
      if (matches.length === 1) {
        matched = matches[0];
      }
    }
    if (!matched) return null;
    const contacts = await customerLookup.getLocalContacts(matched.id);
    return {
      id: matched.id,
      display_name: matched.company || matched.name || '',
      email: matched.email || '',
      ref: matched.customer_number || matched.exxas_contact_id || '',
      contacts: contacts.map((ct) => ({
        id: ct.id,
        name: ct.name || '',
        email: ct.email || '',
        role: ct.role || '',
      })),
    };
  } catch {
    // Auto-Match ist nicht kritisch – bei Fehler stillschweigend ignorieren
  }
  return null;
}

async function postLinkInvoice(tourId, invoiceId, actorEmail = null) {
  if (!invoiceId) return { ok: false, error: 'missing' };
  const tour = await pool.query('SELECT id FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tour.rows[0]) return { ok: false, error: 'Tour nicht gefunden' };
  const rawInvoiceId = String(invoiceId || '').trim();
  if (!rawInvoiceId) return { ok: false, error: 'missing' };

  let result;
  if (rawInvoiceId.startsWith('live:')) {
    result = await linkLiveExxasInvoiceToTour(tourId, rawInvoiceId.slice(5), actorEmail);
  } else {
    const localInvoiceId = rawInvoiceId.startsWith('local:') ? rawInvoiceId.slice(6) : rawInvoiceId;
    result = await linkLocalExxasInvoiceToTour(tourId, localInvoiceId, actorEmail);
  }

  if (result?.ok && result.invoiceId) {
    // Nur suchen wenn die Tour noch keinen Kunden hat
    const tourCheck = await pool.query(
      'SELECT customer_id FROM tour_manager.tours WHERE id = $1',
      [tourId]
    );
    if (!tourCheck.rows[0]?.customer_id) {
      const invRow = await pool.query(
        'SELECT ref_kunde, kunde_name FROM tour_manager.exxas_invoices WHERE id = $1',
        [result.invoiceId]
      );
      const { ref_kunde, kunde_name } = invRow.rows[0] || {};
      const suggestion = await tryAutoMatchCustomer(ref_kunde, kunde_name);
      result = { ...result, customerSuggestion: suggestion };
    }
  }

  return result;
}

async function postLinkMatterportAuto() {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_created_at TIMESTAMPTZ');
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_state VARCHAR(50)');
  const linkWithoutVerify = matterport.allowsLinkWithoutVerify();
  const unlinked = await pool.query(`
    SELECT id, tour_url FROM tour_manager.tours
    WHERE (matterport_space_id IS NULL OR TRIM(matterport_space_id) = '')
    AND tour_url IS NOT NULL AND tour_url != ''
  `);
  let linked = 0;
  let skipped = 0;
  let errors = 0;
  let duplicate = 0;
  for (const t of unlinked.rows) {
    const mpId = getMatterportId(t);
    if (!mpId) {
      skipped++;
      continue;
    }
    const existing = await pool.query(
      `SELECT id FROM tour_manager.tours
       WHERE id != $1
         AND matterport_space_id = $2
       LIMIT 1`,
      [t.id, mpId]
    );
    if (existing.rows[0]?.id) {
      duplicate++;
      continue;
    }
    const { model, error } = await matterport.getModel(mpId);
    if (error || !model) {
      if (linkWithoutVerify) {
        await pool.query(
          `UPDATE tour_manager.tours
           SET matterport_space_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [mpId, t.id]
        );
        linked++;
        continue;
      }
      errors++;
      continue;
    }
    const mpCreated = model?.created || null;
    const mpState = model?.state || null;
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_space_id = $1, matterport_created_at = $2::timestamptz, matterport_state = $3, updated_at = NOW() WHERE id = $4`,
      [mpId, mpCreated, mpState, t.id]
    );
    linked++;
  }
  return { ok: true, linked, skipped, errors, duplicate };
}

async function postLinkMatterportRefreshCreated() {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_created_at TIMESTAMPTZ');
  const rows = await pool.query(`
    SELECT id, matterport_space_id FROM tour_manager.tours
    WHERE matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != ''
    AND matterport_created_at IS NULL
  `);
  let updated = 0;
  for (const t of rows.rows) {
    const { model } = await matterport.getModel(t.matterport_space_id);
    if (model?.created) {
      await pool.query(
        `UPDATE tour_manager.tours SET matterport_created_at = $1::timestamptz, updated_at = NOW() WHERE id = $2`,
        [model.created, t.id]
      );
      updated++;
    }
  }
  return { ok: true, updated };
}

async function postLinkMatterportSyncStatus() {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_state VARCHAR(50)');
  const rows = await pool.query(`
    SELECT id, matterport_space_id FROM tour_manager.tours
    WHERE matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != ''
  `);
  const matterportResult = await matterport.listModels();
  if (matterportResult.error) {
    return { ok: false, error: matterportResult.error };
  }
  const mpStateById = new Map((matterportResult.results || []).map((m) => [m.id, m.state || null]));
  let updated = 0;
  for (const t of rows.rows) {
    const mpId = String(t.matterport_space_id).trim();
    const nextState = mpStateById.has(mpId) ? mpStateById.get(mpId) : 'unknown';
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_state = $1, updated_at = NOW() WHERE id = $2`,
      [nextState, t.id]
    );
    updated++;
  }
  return { ok: true, updated };
}

async function getLinkMatterportCustomerSearchJson(qRaw) {
  const q = String(qRaw || '').trim();
  if (q.length < 2) {
    return { ok: true, companies: [], contacts: [], error: null };
  }
  try {
    const [localResults, contactRows] = await Promise.all([
      customerLookup.searchLocalCustomers(q, 10),
      customerLookup.searchLocalContactMatches(q, 10),
    ]);
    const companies = (await Promise.all(localResults.map(async (c) => {
      const contacts = await customerLookup.getLocalContacts(c.id);
      return customerLookup.toLinkModalCustomer(c, contacts);
    }))).filter(Boolean);
    const contacts = contactRows.map((row) => ({
      customerId: String(row.customer_id),
      contactId: String(row.contact_id),
      firmenname: row.company || row.customer_name || '',
      customerEmail: row.customer_email || null,
      contactName: row.contact_name || '',
      contactEmail: row.contact_email || null,
      contactTel: row.contact_phone || null,
    }));
    return { ok: true, companies, contacts, error: null };
  } catch (err) {
    return { ok: true, companies: [], contacts: [], error: err.message };
  }
}

async function getLinkMatterportCustomerDetailJson(customerId) {
  const id = parseInt(String(customerId || '').trim(), 10);
  if (!Number.isFinite(id) || id < 1) {
    return { ok: false, error: 'Ungültige Kunden-ID', customer: null };
  }
  try {
    const customer = await customerLookup.getCustomerById(id);
    if (!customer) {
      return { ok: true, customer: null, error: 'Nicht gefunden' };
    }
    const contactRows = await customerLookup.getLocalContacts(id);
    return {
      ok: true,
      error: null,
      customer: customerLookup.toLinkModalCustomer(customer, contactRows),
    };
  } catch (err) {
    return { ok: false, customer: null, error: err.message };
  }
}

async function postLinkMatterportCheckOwnership() {
  await pool.query('ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_is_own BOOLEAN');
  const { ids: ownIds, error: listError } = await matterport.getOwnModelIds();
  if (listError) {
    return { ok: false, error: listError };
  }
  const rows = await pool.query(`
    SELECT id, matterport_space_id, tour_url
    FROM tour_manager.tours
    WHERE (matterport_space_id IS NOT NULL AND TRIM(matterport_space_id) != '')
       OR (tour_url IS NOT NULL AND tour_url ~ '[?&]m=[a-zA-Z0-9_-]+')
  `);
  let own = 0;
  let fremde = 0;
  let skipped = 0;
  for (const t of rows.rows) {
    const mpId = getMatterportId(t);
    if (!mpId) {
      skipped++;
      continue;
    }
    const isOwn = ownIds.has(mpId);
    await pool.query(
      `UPDATE tour_manager.tours SET matterport_is_own = $1, updated_at = NOW() WHERE id = $2`,
      [isOwn, t.id]
    );
    if (isOwn) own++;
    else fremde++;
  }
  return { ok: true, own, fremde, skipped };
}

async function getRenewalInvoicesCentral(status, search) {
  let q = `
    SELECT i.*,
      COALESCE(t.object_label, t.bezeichnung) AS tour_object_label,
      COALESCE(t.customer_name, t.kunde_ref) AS tour_customer_name,
      COALESCE(t.exxas_subscription_id, t.exxas_abo_id) AS tour_contract_id,
      t.last_email_sent_at
    FROM tour_manager.renewal_invoices i
    JOIN tour_manager.tours t ON t.id = i.tour_id
    WHERE 1=1
    AND i.invoice_status != 'archived'
  `;
  const params = [];
  if (status === 'offen') {
    q += ` AND i.invoice_status IN ('sent','overdue')`;
  } else if (status === 'bezahlt') {
    q += ` AND i.invoice_status = 'paid'`;
  } else if (status === 'ueberfaellig') {
    q += ` AND (i.invoice_status = 'overdue' OR (i.invoice_status = 'sent' AND i.due_at IS NOT NULL AND i.due_at < NOW()))`;
  } else if (status === 'entwurf') {
    q += ` AND i.invoice_status = 'draft'`;
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const idx = params.length;
    q += ` AND (LOWER(COALESCE(t.object_label, t.bezeichnung)) LIKE $${idx}
              OR LOWER(COALESCE(t.customer_name, t.kunde_ref)) LIKE $${idx}
              OR LOWER(i.invoice_number) LIKE $${idx})`;
  }
  q += ` ORDER BY COALESCE(i.paid_at, i.sent_at, i.created_at) DESC NULLS LAST, i.created_at DESC`;
  const invoices = await pool.query(q, params);
  const overdueStats = await pool.query(`
    SELECT
      invoice_status,
      COUNT(*)::int AS cnt
    FROM tour_manager.renewal_invoices
    GROUP BY invoice_status
  `);
  const overdueExact = await pool.query(`
    SELECT COUNT(*)::int AS cnt
    FROM tour_manager.renewal_invoices
    WHERE invoice_status = 'overdue'
       OR (invoice_status = 'sent' AND due_at IS NOT NULL AND due_at < NOW())
  `);
  const statusCounts = Object.fromEntries(overdueStats.rows.map((r) => [r.invoice_status, r.cnt]));
  return {
    ok: true,
    invoices: invoices.rows,
    stats: {
      offen: (statusCounts.sent || 0) + (statusCounts.overdue || 0),
      ueberfaellig: overdueExact.rows[0]?.cnt || 0,
      bezahlt: statusCounts.paid || 0,
      entwurf: statusCounts.draft || 0,
      archiviert: statusCounts.archived || 0,
    },
    source: 'renewal',
  };
}

async function getExxasInvoicesCentral(status, search) {
  await ensureExxasArchivedColumn();
  let q = `
    SELECT ei.*,
      COALESCE(t.object_label, t.bezeichnung) AS tour_object_label,
      COALESCE(t.customer_name, t.kunde_ref) AS tour_customer_name,
      ri.id AS imported_renewal_invoice_id,
      ri.invoice_number AS imported_renewal_invoice_number,
      ri.invoice_status AS imported_renewal_invoice_status
    FROM tour_manager.exxas_invoices ei
    LEFT JOIN tour_manager.tours t ON t.id = ei.tour_id
    LEFT JOIN tour_manager.renewal_invoices ri
      ON ri.tour_id = ei.tour_id
     AND ri.exxas_invoice_id = COALESCE(NULLIF(ei.exxas_document_id, ''), NULLIF(ei.nummer, ''))
    WHERE 1=1
    AND (ei.archived_at IS NULL)
  `;
  const params = [];
  if (status === 'offen') {
    q += ` AND ei.exxas_status != 'bz'`;
  } else if (status === 'bezahlt') {
    q += ` AND ei.exxas_status = 'bz'`;
  } else if (status === 'verbucht') {
    q += ` AND ri.id IS NOT NULL`;
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const idx = params.length;
    q += ` AND (LOWER(ei.kunde_name) LIKE $${idx}
              OR LOWER(ei.nummer) LIKE $${idx}
              OR LOWER(ei.bezeichnung) LIKE $${idx})`;
  }
  q += ` ORDER BY COALESCE(ei.zahlungstermin, ei.dok_datum) DESC NULLS LAST, ei.created_at DESC`;
  const invoices = await pool.query(q, params);
  const statsRes = await pool.query(`
    SELECT
      COUNT(*)::int                                              AS total,
      COUNT(*) FILTER (WHERE exxas_status = 'bz')::int          AS bezahlt,
      COUNT(*) FILTER (WHERE exxas_status != 'bz')::int         AS offen,
      COALESCE(SUM(preis_brutto) FILTER (WHERE exxas_status = 'bz'), 0)::numeric  AS bezahlt_sum,
      COALESCE(SUM(preis_brutto), 0)::numeric                                      AS total_sum
    FROM tour_manager.exxas_invoices
    WHERE archived_at IS NULL
  `);
  const verbuchtRes = await pool.query(`
    SELECT COUNT(DISTINCT ei.id)::int AS verbucht
    FROM tour_manager.exxas_invoices ei
    LEFT JOIN tour_manager.renewal_invoices ri
      ON ri.tour_id = ei.tour_id
     AND ri.exxas_invoice_id = COALESCE(NULLIF(ei.exxas_document_id, ''), NULLIF(ei.nummer, ''))
    WHERE ei.archived_at IS NULL
      AND ri.id IS NOT NULL
  `);
  const s = statsRes.rows[0] || {};
  const sv = verbuchtRes.rows[0] || {};
  return {
    ok: true,
    invoices: invoices.rows,
    stats: {
      offen: s.offen || 0,
      bezahlt: s.bezahlt || 0,
      total: s.total || 0,
      verbucht: sv.verbucht || 0,
      bezahlt_sum: parseFloat(s.bezahlt_sum) || 0,
      total_sum: parseFloat(s.total_sum) || 0,
    },
    source: 'exxas',
  };
}



const RENEWAL_INVOICE_STATUSES = new Set(['draft', 'sent', 'overdue', 'paid', 'cancelled', 'archived']);

async function deleteRenewalInvoice(invoiceId, actorEmail) {
  const id = parseInt(String(invoiceId), 10);
  if (!Number.isFinite(id)) throw new Error('Ungültige Rechnungs-ID');

  // Rechnungsdaten vor dem Löschen auslesen für Workflow-Reset und Logging
  const existing = await pool.query(
    `SELECT id, tour_id, invoice_kind, invoice_status, invoice_number, amount_chf
     FROM tour_manager.renewal_invoices WHERE id = $1`,
    [id]
  );
  if (!existing.rows[0]) throw new Error('Rechnung nicht gefunden');
  const inv = existing.rows[0];
  if (inv.invoice_status === 'paid') throw new Error('Bezahlte Rechnungen können nicht gelöscht werden');

  const r = await pool.query(
    `DELETE FROM tour_manager.renewal_invoices WHERE id = $1 AND invoice_status != 'paid' RETURNING id`,
    [id]
  );
  if (r.rowCount === 0) throw new Error('Bezahlte Rechnungen können nicht gelöscht werden');

  // Workflow-Status der Tour zurücksetzen, falls nötig
  let tourStatusReset = null;
  if (inv.tour_id) {
    const tourRow = await pool.query(
      `SELECT id, status FROM tour_manager.tours WHERE id = $1`,
      [inv.tour_id]
    );
    const tour = tourRow.rows[0];
    if (tour) {
      let newStatus = null;
      if (
        tour.status === 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT' &&
        inv.invoice_kind === 'portal_reactivation'
      ) {
        // Reaktivierungsrechnung gelöscht → Tour zurück auf ARCHIVED
        newStatus = 'ARCHIVED';
      } else if (
        tour.status === 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT' &&
        (inv.invoice_kind === 'portal_extension' || inv.invoice_kind === null)
      ) {
        // Verlängerungsrechnung gelöscht → Tour zurück auf AWAITING_CUSTOMER_DECISION
        newStatus = 'AWAITING_CUSTOMER_DECISION';
      }
      if (newStatus) {
        await pool.query(
          `UPDATE tour_manager.tours SET status = $1, updated_at = NOW() WHERE id = $2`,
          [newStatus, inv.tour_id]
        );
        tourStatusReset = newStatus;
      }
    }
  }

  if (inv.tour_id) {
    await logAction(inv.tour_id, 'admin', actorEmail || null, 'DELETE_INVOICE', {
      invoice_id: id,
      invoice_number: inv.invoice_number || null,
      invoice_kind: inv.invoice_kind || null,
      invoice_status: inv.invoice_status || null,
      amount_chf: inv.amount_chf || null,
      tour_status_reset: tourStatusReset,
    });
  }

  return { ok: true, tourStatusReset };
}

/**
 * Massen-Löschung: Offene + überfällige interne Verlängerungsrechnungen (renewal_invoices)
 * mit genau CHF 63.80 — betrifft Matterport-Verlängerungen.
 *
 * @param {object} options
 * @param {boolean} options.dryRun  true = nur Vorschau (Standard: false)
 * @param {string}  options.actorEmail
 */
async function bulkDeleteOpenRenewalInvoicesByAmount({ dryRun = false, actorEmail = null } = {}) {
  const AMOUNT = 63.80;

  const res = await pool.query(`
    SELECT ri.id, ri.invoice_number, ri.invoice_status, ri.amount_chf,
           ri.invoice_kind, ri.description, ri.customer_name, ri.customer_email,
           ri.tour_id,
           COALESCE(t.object_label, t.bezeichnung) AS tour_object_label
    FROM tour_manager.renewal_invoices ri
    LEFT JOIN tour_manager.tours t ON t.id = ri.tour_id
    WHERE ri.invoice_status IN ('sent', 'overdue')
      AND ri.amount_chf = $1::numeric
    ORDER BY ri.invoice_status DESC, ri.id
  `, [AMOUNT]);

  const candidates = res.rows;

  if (dryRun) {
    return { ok: true, dryRun: true, count: candidates.length, invoices: candidates };
  }

  const deleted = [];
  const errors = [];

  for (const inv of candidates) {
    try {
      await deleteRenewalInvoice(inv.id, actorEmail);
      deleted.push({
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_status: inv.invoice_status,
        amount_chf: inv.amount_chf,
        customer_name: inv.customer_name,
        tour_object_label: inv.tour_object_label,
      });
    } catch (err) {
      errors.push({ id: inv.id, invoice_number: inv.invoice_number, error: err.message });
    }
  }

  console.log(
    `[bulkDelete-renewal-63.80] actor=${actorEmail} deleted=${deleted.length} errors=${errors.length}`
  );

  return {
    ok: errors.length === 0,
    deleted: deleted.length,
    errors,
    deletedInvoices: deleted,
    total: candidates.length,
  };
}

async function archiveRenewalInvoice(invoiceId) {
  const id = parseInt(String(invoiceId), 10);
  if (!Number.isFinite(id)) throw new Error('Ungültige Rechnungs-ID');
  const r = await pool.query(
    `UPDATE tour_manager.renewal_invoices SET invoice_status = 'archived' WHERE id = $1 AND invoice_status NOT IN ('paid', 'archived') RETURNING id`,
    [id]
  );
  if (r.rowCount === 0) throw new Error('Rechnung nicht gefunden oder bereits archiviert/bezahlt');
  return { ok: true };
}

async function updateRenewalInvoice(invoiceId, body = {}) {
  const id = parseInt(String(invoiceId), 10);
  if (!Number.isFinite(id)) throw new Error('Ungültige Rechnungs-ID');
  const row = await pool.query(`SELECT * FROM tour_manager.renewal_invoices WHERE id = $1`, [id]);
  if (!row.rows[0]) throw new Error('Rechnung nicht gefunden');
  const patches = [];
  const vals = [];
  let n = 1;
  if (body.invoice_status != null && body.invoice_status !== '') {
    const st = String(body.invoice_status);
    if (!RENEWAL_INVOICE_STATUSES.has(st)) throw new Error('Ungültiger Status');
    patches.push(`invoice_status = $${n++}`);
    vals.push(st);
  }
  if (body.amount_chf != null && body.amount_chf !== '') {
    const amt = parseFloat(String(body.amount_chf));
    if (!Number.isFinite(amt)) throw new Error('Ungültiger Betrag');
    patches.push(`amount_chf = $${n++}`);
    vals.push(amt);
  }
  if (body.due_at !== undefined) {
    patches.push(`due_at = $${n++}`);
    const d = body.due_at;
    vals.push(d == null || d === '' ? null : new Date(d));
  }
  if (body.payment_note !== undefined) {
    patches.push(`payment_note = $${n++}`);
    vals.push(body.payment_note == null ? null : String(body.payment_note));
  }
  // Neue Felder: Bezahlt am, Zahlungskanal, Skonto, Abschreibung
  if (body.paid_at_date !== undefined) {
    const d = body.paid_at_date;
    const iso = d == null || d === '' ? null : toIsoDate(String(d));
    patches.push(`paid_at_date = $${n++}`);
    vals.push(iso);
    // paid_at synchron halten
    patches.push(`paid_at = $${n++}`);
    vals.push(iso ? new Date(iso) : null);
  }
  const ALLOWED_CHANNELS = new Set(['ubs', 'online', 'bar', 'sonstige']);
  if (body.payment_channel !== undefined) {
    const ch = body.payment_channel == null || body.payment_channel === '' ? null : String(body.payment_channel).toLowerCase();
    if (ch && !ALLOWED_CHANNELS.has(ch)) throw new Error('Ungültiger Zahlungskanal');
    patches.push(`payment_channel = $${n++}`);
    vals.push(ch);
  }
  if (body.skonto_chf !== undefined) {
    const sk = body.skonto_chf == null || body.skonto_chf === '' ? null : parseFloat(String(body.skonto_chf));
    if (sk !== null && (!Number.isFinite(sk) || sk < 0)) throw new Error('Ungültiger Skonto-Betrag');
    patches.push(`skonto_chf = $${n++}`);
    vals.push(sk);
  }
  if (body.writeoff !== undefined) {
    const wo = body.writeoff === true || body.writeoff === 'true' || body.writeoff === 1;
    patches.push(`writeoff = $${n++}`);
    vals.push(wo);
    // Hinweis: writeoff = «Betreibung eingeleitet» — Rechnungsstatus bleibt durch Dropdown / andere Felder steuerbar
  }
  if (body.writeoff_reason !== undefined) {
    const reason = body.writeoff_reason == null ? null : String(body.writeoff_reason);
    patches.push(`writeoff_reason = $${n++}`);
    vals.push(reason);
  }
  // Adressat-Overrides + Verwendungszweck (greifen in PDF/Mail vor Tour-Daten,
  // sobald nicht-leer). Leerstring => NULL => zurück zur Tour-Adresse.
  const RECIPIENT_FIELDS = ['customer_name', 'customer_email', 'customer_address', 'description'];
  for (const field of RECIPIENT_FIELDS) {
    if (body[field] !== undefined) {
      const raw = body[field];
      const norm = raw == null ? null : String(raw).trim();
      patches.push(`${field} = $${n++}`);
      vals.push(norm === '' ? null : norm);
    }
  }
  if (body.invoice_date !== undefined) {
    const d = body.invoice_date;
    const iso = d == null || d === '' ? null : toIsoDate(String(d));
    patches.push(`invoice_date = $${n++}`);
    vals.push(iso);
  }
  if (!patches.length) return { ok: true, invoice: row.rows[0] };
  vals.push(id);
  const q = `UPDATE tour_manager.renewal_invoices SET ${patches.join(', ')} WHERE id = $${n} RETURNING *`;
  const u = await pool.query(q, vals);
  return { ok: true, invoice: u.rows[0] };
}

async function resendRenewalInvoice(invoiceId) {
  const id = parseInt(String(invoiceId), 10);
  if (!Number.isFinite(id)) throw new Error('Ungültige Rechnungs-ID');
  const row = await pool.query(
    `SELECT id, tour_id, invoice_status FROM tour_manager.renewal_invoices WHERE id = $1`,
    [id]
  );
  if (!row.rows[0]) throw new Error('Rechnung nicht gefunden');
  const currentStatus = row.rows[0].invoice_status;
  if (currentStatus === 'paid') throw new Error('Bezahlte Rechnung kann nicht versendet werden');
  const tourId = row.rows[0].tour_id;
  const result = await tourActions.sendInvoiceWithQrEmail(String(tourId), String(id));
  if (!result.success) throw new Error(result.error || 'E-Mail-Versand fehlgeschlagen');
  // Bei Entwurf: Status auf 'sent' setzen; sonst nur sent_at aktualisieren
  if (currentStatus === 'draft') {
    await pool.query(
      `UPDATE tour_manager.renewal_invoices SET invoice_status = 'sent', sent_at = NOW() WHERE id = $1`,
      [id]
    );
  } else {
    await pool.query(`UPDATE tour_manager.renewal_invoices SET sent_at = NOW() WHERE id = $1`, [id]);
  }
  return { ok: true };
}

async function ensureExxasArchivedColumn() {
  await pool.query(
    `ALTER TABLE tour_manager.exxas_invoices ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`
  );
}

async function deleteExxasInvoice(invoiceId) {
  await ensureExxasArchivedColumn();
  const id = parseInt(String(invoiceId), 10);
  if (!Number.isFinite(id)) throw new Error('Ungültige Rechnungs-ID');
  const r = await pool.query(`DELETE FROM tour_manager.exxas_invoices WHERE id = $1 RETURNING id`, [id]);
  if (r.rowCount === 0) throw new Error('Rechnung nicht gefunden');
  return { ok: true };
}

/**
 * Massen-Löschung: Offene Exxas-Rechnungen "Hosting Verlängerung 6 Monate VR Tour Matterport"
 * mit Rechnungsnummer 500xxx — samt verknüpften importierten Verlängerungsrechnungen im Panel.
 *
 * @param {object} options
 * @param {boolean} options.dryRun  true = nur Vorschau, kein Löschen (Standard: false)
 * @param {string}  options.actorEmail  für Logging
 */
async function bulkDeleteHostingMatterportExxasInvoices({ dryRun = false, actorEmail = null } = {}) {
  await ensureExxasArchivedColumn();

  const res = await pool.query(`
    SELECT id, exxas_document_id, nummer, bezeichnung, exxas_status, kunde_name, preis_brutto
    FROM tour_manager.exxas_invoices
    WHERE exxas_status != 'bz'
      AND nummer LIKE '500%'
      AND (
        LOWER(bezeichnung) LIKE '%hosting%'
        OR LOWER(bezeichnung) LIKE '%verlängerung%'
        OR LOWER(bezeichnung) LIKE '%matterport%'
        OR LOWER(bezeichnung) LIKE '%vr%'
      )
      AND archived_at IS NULL
    ORDER BY nummer
  `);

  const candidates = res.rows;

  if (dryRun) {
    return { ok: true, dryRun: true, count: candidates.length, invoices: candidates };
  }

  const deleted = [];
  const errors = [];

  for (const inv of candidates) {
    try {
      const linkId = inv.exxas_document_id || inv.nummer || null;

      // Verknüpfte importierte Verlängerungsrechnungen löschen (ausser bezahlte)
      if (linkId) {
        await pool.query(
          `DELETE FROM tour_manager.renewal_invoices
           WHERE exxas_invoice_id = $1
             AND invoice_status != 'paid'`,
          [String(linkId)]
        );
      }

      // Exxas-Rechnung aus lokalem Panel löschen
      await pool.query(`DELETE FROM tour_manager.exxas_invoices WHERE id = $1`, [inv.id]);

      deleted.push({ id: inv.id, nummer: inv.nummer, bezeichnung: inv.bezeichnung, kunde_name: inv.kunde_name });
    } catch (err) {
      errors.push({ id: inv.id, nummer: inv.nummer, error: err.message });
    }
  }

  console.log(
    `[bulkDelete-hosting-matterport] actor=${actorEmail} deleted=${deleted.length} errors=${errors.length}`
  );

  return {
    ok: errors.length === 0,
    deleted: deleted.length,
    errors,
    deletedInvoices: deleted,
    total: candidates.length,
  };
}

/**
 * Direkt-Storno in Exxas: Holt die Live-Liste aus der Exxas-API,
 * filtert auf offene Hosting-VR-Matterport-Rechnungen (500xxx) und
 * storni jede via cancelInvoice().
 * Kein lokaler DB-Bezug nötig — funktioniert auch wenn lokale Einträge bereits gelöscht.
 *
 * @param {object} options
 * @param {boolean} options.dryRun  true = nur Vorschau (Standard: false)
 */
async function bulkStornoHostingMatterportInExxas({ dryRun = false } = {}) {
  const { rows, ok, error } = await exxas.fetchExxasInvoicesRawList();
  if (!ok && (!rows || rows.length === 0)) {
    return { ok: false, error: error || 'Exxas API nicht erreichbar', candidates: [] };
  }

  const candidates = (rows || [])
    .map((row) => exxas.mapInvoicePayload(row))
    .filter((inv) => {
      if (!inv) return false;
      if (String(inv.typ || '').trim().toLowerCase() !== 'r') return false;
      const nr = String(inv.nummer || '').trim();
      if (!nr.startsWith('500')) return false;
      if (String(inv.exxas_status || '').toLowerCase() === 'bz') return false;
      const bez = String(inv.bezeichnung || '').toLowerCase();
      return (
        bez.includes('hosting') ||
        bez.includes('verlängerung') ||
        bez.includes('matterport') ||
        bez.includes('vr')
      );
    })
    .map((inv) => ({
      exxas_document_id: inv.exxas_document_id || inv.id || inv.nummer,
      nummer: inv.nummer,
      bezeichnung: inv.bezeichnung,
      kunde_name: inv.kunde_name,
      exxas_status: inv.exxas_status,
      preis_brutto: inv.preis_brutto,
    }));

  if (dryRun) {
    return { ok: true, dryRun: true, count: candidates.length, invoices: candidates };
  }

  const storniert = [];
  const errors = [];

  for (const inv of candidates) {
    const invoiceRef = inv.exxas_document_id || inv.nummer;
    try {
      const result = await exxas.cancelInvoice(invoiceRef);
      if (result && result.success === false) {
        errors.push({ nummer: inv.nummer, error: result.error || 'Storno fehlgeschlagen' });
      } else {
        storniert.push({ nummer: inv.nummer, bezeichnung: inv.bezeichnung, kunde_name: inv.kunde_name });
      }
    } catch (err) {
      errors.push({ nummer: inv.nummer, error: err.message });
    }
  }

  // Cache leeren damit nächster Sync den neuen Status holt
  exxas.clearExxasInvoiceListCache();

  console.log(
    `[bulkStorno-hosting-matterport] storniert=${storniert.length} errors=${errors.length}`
  );

  return {
    ok: errors.length === 0,
    storniert: storniert.length,
    errors,
    storniertInvoices: storniert,
    total: candidates.length,
  };
}

async function archiveExxasInvoice(invoiceId) {
  await ensureExxasArchivedColumn();
  const id = parseInt(String(invoiceId), 10);
  if (!Number.isFinite(id)) throw new Error('Ungültige Rechnungs-ID');
  const r = await pool.query(
    `UPDATE tour_manager.exxas_invoices SET archived_at = NOW() WHERE id = $1 AND archived_at IS NULL RETURNING id`,
    [id]
  );
  if (r.rowCount === 0) throw new Error('Rechnung nicht gefunden oder bereits archiviert');
  return { ok: true };
}

async function updateExxasInvoice(invoiceId, body = {}) {
  const id = parseInt(String(invoiceId), 10);
  if (!Number.isFinite(id)) throw new Error('Ungültige Rechnungs-ID');
  if (body.exxas_status == null || String(body.exxas_status).trim() === '') {
    throw new Error('exxas_status erforderlich');
  }
  const r = await pool.query(
    `UPDATE tour_manager.exxas_invoices SET exxas_status = $1 WHERE id = $2 RETURNING *`,
    [String(body.exxas_status).trim(), id]
  );
  if (r.rowCount === 0) throw new Error('Rechnung nicht gefunden');
  return { ok: true, invoice: r.rows[0] };
}

async function previewBankImportUpload({ buffer, originalname }) {
  await ensureBankImportSchema();
  await ensureExxasArchivedColumn();
  if (!buffer?.length) {
    return { ok: false, error: 'Keine Datei hochgeladen.' };
  }
  const sourceFormat = String(originalname || '').toLowerCase().endsWith('.csv') ? 'csv' : 'camt054';
  let transactions = [];
  try {
    const text = buffer.toString('utf8');
    transactions = sourceFormat === 'csv' ? bankImport.parseCsv(text) : bankImport.parseCamt054(text);
  } catch (err) {
    return { ok: false, error: `Datei konnte nicht gelesen werden: ${err.message}` };
  }
  if (!transactions.length) {
    return { ok: false, error: 'Keine Buchungen in der Datei gefunden.' };
  }

  const [renewalInvoiceRows, exxasInvoiceRows] = await Promise.all([
    pool.query(
      `SELECT 'renewal' AS source,
              id, tour_id, invoice_number, amount_chf, invoice_status, subscription_end_at
       FROM tour_manager.renewal_invoices
       WHERE invoice_status IN ('sent', 'overdue', 'draft')
       ORDER BY created_at DESC`
    ),
    pool.query(
      `SELECT 'exxas' AS source,
              ei.id, ei.tour_id, ei.nummer, ei.preis_brutto, ei.exxas_status,
              ei.ref_vertrag, ei.exxas_document_id
       FROM tour_manager.exxas_invoices ei
       LEFT JOIN tour_manager.renewal_invoices ri
         ON ri.tour_id = ei.tour_id
        AND ri.exxas_invoice_id = COALESCE(NULLIF(ei.exxas_document_id, ''), NULLIF(ei.nummer, ''))
       WHERE ei.archived_at IS NULL
         AND ei.exxas_status != 'bz'
         AND ri.id IS NULL
       ORDER BY ei.created_at DESC`
    ),
  ]);
  const invoiceIndex = bankImport.buildOpenInvoiceIndex([
    ...renewalInvoiceRows.rows,
    ...exxasInvoiceRows.rows,
  ]);

  const preview = transactions.map((tx) => {
    const match = bankImport.matchTransaction(tx, invoiceIndex);
    // Zusätzliche Felder aus raw-Objekt extrahieren
    const raw = tx.raw || {};
    const creditorIban = raw?.RltdPties?.CdtrAcct?.Id?.IBAN || null;
    const debtorIban = raw?.RltdPties?.DbtrAcct?.Id?.IBAN || null;
    const creditorName = raw?.RltdPties?.Cdtr?.Nm
      ? String(raw.RltdPties.Cdtr.Nm).trim() || null
      : null;
    // Strukturierte Referenz (QR / ISO)
    const structuredRef = raw?.RmtInf?.Strd?.CdtrRefInf?.Ref || null;
    const unstructuredRef = (() => {
      const u = raw?.RmtInf?.Ustrd;
      if (!u) return null;
      return Array.isArray(u) ? u.join(' ') : String(u);
    })();
    const additionalInfo = raw?.AddtlTxInf || null;
    return {
      amount_chf: tx.amount ?? null,
      currency: tx.currency || 'CHF',
      booking_date: bankImport.toIsoDate(tx.bookingDate) || null,
      value_date: bankImport.toIsoDate(tx.valueDate) || null,
      reference_raw: tx.referenceRaw || null,
      reference_structured: structuredRef || null,
      reference_unstructured: unstructuredRef || null,
      debtor_name: tx.debtorName || null,
      debtor_iban: debtorIban || null,
      creditor_name: creditorName || null,
      creditor_iban: creditorIban || null,
      purpose: tx.purpose || null,
      additional_info: additionalInfo ? String(additionalInfo) : null,
      match_status: match.matchStatus,
      confidence: match.confidence,
      match_reason: match.reason || null,
      matched_invoice_id: match.invoice?.id || null,
      matched_invoice_source: match.invoice?.source || null,
      matched_invoice_number: match.invoice?.invoiceNumber || null,
      matched_invoice_amount: match.invoice?.amountChf || null,
      matched_tour_id: match.invoice?.tourId || null,
      matched_tour_label: match.invoice?.tourLabel || null,
      matched_customer_name: match.invoice?.customerName || null,
      requires_import: match.invoice?.source === 'exxas',
    };
  });

  const exactCount = preview.filter(t => t.match_status === 'exact').length;
  const reviewCount = preview.filter(t => t.match_status === 'review').length;
  const noneCount = preview.filter(t => t.match_status === 'none').length;

  return {
    ok: true,
    sourceFormat,
    fileName: originalname || null,
    totalRows: transactions.length,
    exactCount,
    reviewCount,
    noneCount,
    transactions: preview,
  };
}

async function searchByOrderNo(q) {
  const query = String(q || '').trim();
  if (!query || query.length < 1) return { ok: true, orders: [] };
  const pattern = `%${query}%`;
  const res = await pool.query(
    `SELECT o.order_no,
            COALESCE(NULLIF(o.billing->>'company',''), o.billing->>'name', '') AS customer_name,
            o.billing->>'email' AS customer_email,
            ri.id                AS invoice_id,
            ri.invoice_number,
            ri.invoice_status,
            ri.amount_chf,
            ri.due_at,
            ri.paid_at_date,
            ri.invoice_kind,
            t.id                 AS tour_id,
            COALESCE(t.object_label, t.bezeichnung) AS tour_label
     FROM booking.orders o
     JOIN tour_manager.tours t ON t.booking_order_no = o.order_no
     JOIN tour_manager.renewal_invoices ri ON ri.tour_id = t.id
     WHERE o.order_no::text ILIKE $1
        OR o.billing->>'company' ILIKE $1
        OR o.billing->>'name'    ILIKE $1
        OR o.billing->>'email'   ILIKE $1
     ORDER BY o.order_no DESC, ri.id DESC
     LIMIT 40`,
    [pattern]
  );
  // Gruppiere Rechnungen nach Bestellung
  const orderMap = new Map();
  for (const row of res.rows) {
    const key = row.order_no;
    if (!orderMap.has(key)) {
      orderMap.set(key, {
        order_no: row.order_no,
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        invoices: [],
      });
    }
    orderMap.get(key).invoices.push({
      invoice_source: 'renewal',
      id: row.invoice_id,
      invoice_number: row.invoice_number,
      invoice_status: row.invoice_status,
      amount_chf: row.amount_chf,
      due_at: row.due_at,
      paid_at_date: row.paid_at_date,
      invoice_kind: row.invoice_kind,
      tour_id: row.tour_id,
      tour_object_label: row.tour_label,
      canConfirmDirectly: true,
      requiresImport: false,
    });
  }
  return { ok: true, orders: Array.from(orderMap.values()) };
}

async function getInvoicesByOrderNo(orderNo) {
  const no = parseInt(String(orderNo), 10);
  if (!Number.isFinite(no)) return { ok: false, error: 'Ungültige Bestellnummer' };
  const res = await pool.query(
    `SELECT ri.id,
            ri.invoice_number,
            ri.invoice_status,
            ri.invoice_kind,
            ri.amount_chf,
            ri.due_at,
            ri.paid_at_date,
            ri.payment_channel,
            ri.skonto_chf,
            ri.writeoff,
            ri.created_at,
            t.id   AS tour_id,
            COALESCE(t.object_label, t.bezeichnung) AS tour_label
     FROM tour_manager.tours t
     JOIN tour_manager.renewal_invoices ri ON ri.tour_id = t.id
     WHERE t.booking_order_no = $1
     ORDER BY ri.created_at DESC`,
    [no]
  );
  return { ok: true, invoices: res.rows };
}

async function createFreeformInvoice(body, actorEmail) {
  const customerName = String(body?.customerName || '').trim();
  const customerEmail = String(body?.customerEmail || '').trim() || null;
  const customerAddress = String(body?.customerAddress || '').trim() || null;
  const description = String(body?.description || '').trim();
  const amountRaw = String(body?.amountChf || '').trim();
  const amountChf = Number.parseFloat(amountRaw.replace(',', '.'));
  const invoiceNumber = String(body?.invoiceNumber || '').trim() || null;
  const dueAtRaw = String(body?.dueAt || '').trim();
  const invoiceDateRaw = String(body?.invoiceDate || '').trim();
  const note = String(body?.paymentNote || '').trim() || null;
  const skontoRaw = String(body?.skontoChf || '').trim();
  const skontoChf = skontoRaw ? Number.parseFloat(skontoRaw.replace(',', '.')) : null;
  const tourIdRaw = body?.tourId ? parseInt(body.tourId, 10) : null;
  const markPaidNow =
    body?.markPaidNow === true || body?.markPaidNow === '1' || body?.markPaidNow === 'on' || body?.markPaidNow === 'true';

  if (!customerName) return { ok: false, error: 'Kundenname ist erforderlich.' };
  if (!description) return { ok: false, error: 'Beschreibung ist erforderlich.' };
  if (!Number.isFinite(amountChf) || amountChf <= 0) return { ok: false, error: 'Betrag ist ungültig.' };
  if (skontoRaw && (!Number.isFinite(skontoChf) || skontoChf < 0)) {
    return { ok: false, error: 'Skonto-Betrag ist ungültig.' };
  }

  const dueAtIso = dueAtRaw ? toIsoDate(dueAtRaw) : null;
  if (dueAtRaw && !dueAtIso) return { ok: false, error: 'Fälligkeitsdatum ist ungültig.' };

  const invoiceDateIso = invoiceDateRaw ? toIsoDate(invoiceDateRaw) : null;

  let status = 'sent';
  let paidAtIso = null;
  let paymentMethod = null;
  if (markPaidNow) {
    status = 'paid';
    const paidAtRaw2 = String(body?.paidAt || '').trim();
    paidAtIso = paidAtRaw2 ? toIsoDate(paidAtRaw2) : new Date().toISOString().slice(0, 10);
    const methodRaw = String(body?.paymentMethod || '').trim().toLowerCase();
    if (methodRaw && !ALLOWED_PAYMENT_METHODS.has(methodRaw)) {
      return { ok: false, error: 'Zahlungsart ist ungültig.' };
    }
    paymentMethod = methodRaw || 'manual';
  }

  const inserted = await pool.query(
    `INSERT INTO tour_manager.renewal_invoices (
       tour_id, invoice_number, invoice_status, amount_chf, due_at,
       sent_at, paid_at, paid_at_date, payment_method, payment_source, payment_note,
       skonto_chf, recorded_by, recorded_at, invoice_kind,
       customer_name, customer_email, customer_address, description, invoice_date
     ) VALUES (
       $1, $2, $3, $4::numeric, $5::date,
       CASE WHEN $3 IN ('sent','paid') THEN NOW() ELSE NULL END,
       $6::date, $6::date, $7, 'manual', $8,
       $9::numeric, $10, NOW(), 'freeform',
       $11, $12, $13, $14, $15::date
     )
     RETURNING id`,
    [
      tourIdRaw,
      invoiceNumber,
      status,
      amountChf,
      dueAtIso,
      paidAtIso,
      paymentMethod,
      note,
      skontoChf,
      actorEmail,
      customerName,
      customerEmail,
      customerAddress,
      description,
      invoiceDateIso,
    ]
  );

  await logAction(tourIdRaw, 'admin', actorEmail, 'INVOICE_CREATE_FREEFORM', {
    invoice_id: inserted.rows[0]?.id || null,
    invoice_number: invoiceNumber,
    amount_chf: amountChf,
    customer_name: customerName,
    description,
    mark_paid_now: markPaidNow,
  });

  return { ok: true, invoiceId: inserted.rows[0]?.id, paymentSaved: markPaidNow };
}

async function syncAllExxasInvoicesFromApi() {
  await ensureExxasArchivedColumn();
  const { rows, ok, error } = await exxas.fetchExxasInvoicesRawList();
  if (!ok && (!rows || rows.length === 0)) {
    return { ok: false, error: error || 'Exxas API nicht erreichbar', imported: 0, updated: 0, total: 0 };
  }
  const invoices = (rows || [])
    .map((row) => exxas.mapInvoicePayload(row))
    .filter((inv) => inv && (inv.id || inv.nummer) && String(inv.typ || '').trim().toLowerCase() === 'r');

  let imported = 0;
  let updated = 0;
  for (const inv of invoices) {
    const docId = inv.exxas_document_id || inv.id || null;
    if (!docId) continue;
    const existing = await pool.query(
      `SELECT id FROM tour_manager.exxas_invoices WHERE exxas_document_id = $1 LIMIT 1`,
      [String(docId)]
    );
    if (existing.rows[0]) {
      await pool.query(
        `UPDATE tour_manager.exxas_invoices
         SET exxas_status   = $2,
             preis_brutto   = $3,
             zahlungstermin = $4::date,
             dok_datum      = COALESCE($5::date, dok_datum),
             nummer         = COALESCE($6, nummer),
             kunde_name     = COALESCE($7, kunde_name),
             bezeichnung    = COALESCE($8, bezeichnung),
             ref_kunde      = COALESCE($9, ref_kunde),
             ref_vertrag    = COALESCE($10, ref_vertrag),
             sv_status      = COALESCE($11, sv_status),
             synced_at      = NOW()
         WHERE id = $1`,
        [
          existing.rows[0].id,
          inv.exxas_status || null,
          inv.preis_brutto ?? null,
          inv.zahlungstermin || null,
          inv.dok_datum || null,
          inv.nummer || null,
          inv.kunde_name || null,
          inv.bezeichnung || null,
          inv.ref_kunde || null,
          inv.ref_vertrag || null,
          inv.sv_status || null,
        ]
      );
      updated++;
    } else {
      try {
        await pool.query(
          `INSERT INTO tour_manager.exxas_invoices (
             exxas_document_id, nummer, kunde_name, bezeichnung,
             ref_kunde, ref_vertrag, exxas_status, sv_status,
             zahlungstermin, dok_datum, preis_brutto, synced_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11::numeric, NOW())`,
          [
            String(docId),
            inv.nummer || null,
            inv.kunde_name || null,
            inv.bezeichnung || null,
            inv.ref_kunde || null,
            inv.ref_vertrag || null,
            inv.exxas_status || null,
            inv.sv_status || null,
            inv.zahlungstermin || null,
            inv.dok_datum || null,
            inv.preis_brutto ?? null,
          ]
        );
        imported++;
      } catch (_e) {
        // Duplikat durch Race-Condition – überspringen
      }
    }
  }
  return { ok: true, imported, updated, total: invoices.length };
}

async function getRenewalRunPreview() {
  const result = await pool.query(`
    SELECT
      t.id,
      COALESCE(t.object_label, t.bezeichnung)   AS object_label,
      COALESCE(t.customer_name, t.kunde_ref)     AS customer_name,
      t.customer_email,
      t.status,
      COALESCE(t.matterport_created_at, t.created_at) AS tour_age_date,
      t.canonical_term_end_date,
      t.term_end_date,
      CASE
        WHEN COALESCE(t.canonical_term_end_date, t.term_end_date) < NOW() - INTERVAL '30 days'
        THEN true ELSE false
      END AS is_reactivation,
      CASE
        WHEN COALESCE(t.canonical_term_end_date, t.term_end_date) < NOW() - INTERVAL '30 days'
        THEN 74 ELSE 59
      END AS amount_chf
    FROM tour_manager.tours t
    WHERE
      t.status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'
      AND COALESCE(t.matterport_created_at, t.created_at) < NOW() - INTERVAL '6 months'
      AND NOT EXISTS (
        SELECT 1 FROM tour_manager.renewal_invoices ri
        WHERE ri.tour_id = t.id AND ri.invoice_status = 'paid'
      )
      AND NOT EXISTS (
        SELECT 1 FROM tour_manager.renewal_invoices ri
        WHERE ri.tour_id = t.id AND ri.invoice_status IN ('sent', 'overdue')
      )
    ORDER BY COALESCE(t.matterport_created_at, t.created_at) ASC
  `);
  return { ok: true, tours: result.rows, count: result.rows.length };
}

async function executeRenewalRun(tourIds, actorEmail) {
  if (!Array.isArray(tourIds) || tourIds.length === 0) {
    return { ok: false, error: 'Keine Tour-IDs angegeben.' };
  }
  const validIds = tourIds.map(Number).filter(Number.isFinite);
  if (validIds.length === 0) {
    return { ok: false, error: 'Keine gültigen Tour-IDs.' };
  }

  const created = [];
  const skipped = [];
  const errors = [];

  for (const tourId of validIds) {
    try {
      const tourRes = await pool.query(
        `SELECT t.*,
           CASE
             WHEN COALESCE(t.canonical_term_end_date, t.term_end_date) < NOW() - INTERVAL '30 days'
             THEN true ELSE false
           END AS is_reactivation
         FROM tour_manager.tours t
         WHERE t.id = $1 AND t.status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'`,
        [tourId],
      );
      const tour = tourRes.rows[0];
      if (!tour) {
        skipped.push({ tourId, reason: 'Tour nicht gefunden oder Status geändert' });
        continue;
      }

      const paidCheck = await pool.query(
        `SELECT id FROM tour_manager.renewal_invoices WHERE tour_id = $1 AND invoice_status = 'paid' LIMIT 1`,
        [tourId],
      );
      if (paidCheck.rows.length > 0) {
        skipped.push({ tourId, reason: 'Bereits bezahlt' });
        continue;
      }

      const openCheck = await pool.query(
        `SELECT id FROM tour_manager.renewal_invoices WHERE tour_id = $1 AND invoice_status IN ('sent', 'overdue') LIMIT 1`,
        [tourId],
      );
      if (openCheck.rows.length > 0) {
        skipped.push({ tourId, reason: 'Offene Rechnung bereits vorhanden' });
        continue;
      }

      const isReactivation = tour.is_reactivation === true;
      const amountChf = isReactivation ? 74 : 59;
      const invoiceKind = isReactivation ? 'portal_reactivation' : 'portal_extension';
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 30);
      const dueAtIso = dueAt.toISOString().split('T')[0];

      const inserted = await pool.query(
        `INSERT INTO tour_manager.renewal_invoices
           (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source)
         VALUES ($1, 'sent', NOW(), $2, $3::date, $4, 'qr_pending')
         RETURNING id`,
        [tourId, amountChf, dueAtIso, invoiceKind],
      );
      const invoiceId = inserted.rows[0]?.id;

      await logAction(tourId, 'admin', actorEmail, 'RENEWAL_RUN_INVOICE_CREATED', {
        invoice_id: invoiceId,
        amount_chf: amountChf,
        invoice_kind: invoiceKind,
        batch_run: true,
      });

      let emailSent = false;
      try {
        await tourActions.sendInvoiceWithQrEmail(String(tourId), String(invoiceId));
        emailSent = true;
      } catch (emailErr) {
        console.error(`[renewal-run] E-Mail fehlgeschlagen tour=${tourId} invoice=${invoiceId}:`, emailErr.message);
        errors.push({ tourId, invoiceId, reason: 'Rechnung erstellt, E-Mail fehlgeschlagen: ' + emailErr.message });
      }
      created.push({ tourId, invoiceId, emailSent });
    } catch (err) {
      console.error(`[renewal-run] Fehler tour=${tourId}:`, err.message);
      errors.push({ tourId, reason: err.message });
    }
  }

  return {
    ok: true,
    created: created.length,
    skipped: skipped.length,
    errors: errors.length,
    details: { created, skipped, errors },
  };
}

async function markOverdueInvoices() {
  const r = await pool.query(`
    UPDATE tour_manager.renewal_invoices
    SET invoice_status = 'overdue', updated_at = NOW()
    WHERE invoice_status = 'sent'
      AND due_at IS NOT NULL
      AND due_at < NOW()
    RETURNING id
  `);
  return { ok: true, updated: r.rowCount };
}

module.exports = {
  getRenewalInvoicesJson,
  getRenewalInvoicesCentral,
  getExxasInvoicesCentral,
  syncAllExxasInvoicesFromApi,
  deleteRenewalInvoice,
  bulkDeleteOpenRenewalInvoicesByAmount,
  archiveRenewalInvoice,
  updateRenewalInvoice,
  resendRenewalInvoice,
  deleteExxasInvoice,
  bulkDeleteHostingMatterportExxasInvoices,
  bulkStornoHostingMatterportInExxas,
  archiveExxasInvoice,
  updateExxasInvoice,
  getBankImportJson,
  previewBankImportUpload,
  runBankImportUpload,
  searchBankImportInvoices,
  importExxasInvoiceToInternalInvoice,
  confirmBankTransaction,
  ignoreBankTransaction,
  createManualInvoice,
  createFreeformInvoice,
  markPaidManualInvoice,
  getRenewalRunPreview,
  executeRenewalRun,
  streamRenewalInvoicePdf,
  getLinkMatterportJson,
  postLinkMatterport,
  getLinkInvoiceJson,
  postLinkInvoice,
  postLinkMatterportAuto,
  postLinkMatterportRefreshCreated,
  postLinkMatterportSyncStatus,
  postLinkMatterportCheckOwnership,
  getLinkMatterportCustomerSearchJson,
  getLinkMatterportCustomerDetailJson,
  searchByOrderNo,
  getInvoicesByOrderNo,
  markOverdueInvoices,
};
