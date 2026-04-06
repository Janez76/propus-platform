/**
 * JSON-/Hilfslogik für admin-api Phase 3 (Rechnungen, Bank-Import, Matterport-Link, Rechnung linken).
 */

const { pool } = require('./db');
const matterport = require('./matterport');
const bankImport = require('./bank-import');
const { normalizeTourRow, getMatterportId } = require('./normalize');
const { logAction } = require('./actions');
const customerLookup = require('./customer-lookup');
const {
  ensureBankImportSchema,
  applyImportedPayment,
  importExxasInvoiceToRenewal,
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
    q += ` AND i.invoice_status = 'overdue'`;
  } else if (status === 'entwurf') {
    q += ` AND i.invoice_status = 'draft'`;
  }
  q += ` ORDER BY COALESCE(i.paid_at, i.sent_at, i.created_at) DESC NULLS LAST, i.created_at DESC`;
  const invoices = await pool.query(q, params);
  const stats = await pool.query(`
    SELECT invoice_status, COUNT(*)::int as cnt FROM tour_manager.renewal_invoices GROUP BY invoice_status
  `);
  const statusCounts = Object.fromEntries(stats.rows.map((r) => [r.invoice_status, r.cnt]));
  return {
    ok: true,
    invoices: invoices.rows,
    filters: { status: status || null, source: 'renewal' },
    stats: {
      offen: (statusCounts.sent || 0) + (statusCounts.overdue || 0),
      ueberfaellig: statusCounts.overdue || 0,
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
       sent_at, paid_at, payment_method, payment_source, payment_note,
       recorded_by, recorded_at, subscription_start_at, subscription_end_at, invoice_kind
     ) VALUES (
       $1, $2, $3, $4::numeric, $5::date,
       CASE WHEN $3 IN ('sent','paid') THEN NOW() ELSE NULL END,
       $6::date, $7, 'manual', $8,
       $9, NOW(), $10::date, $11::date, 'manual_extension'
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
  const tour = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tour.rows[0]) {
    return { ok: false, error: 'Tour nicht gefunden' };
  }
  const normalizedTour = normalizeTourRow(tour.rows[0]);
  const s = String(search || '').trim();
  let q = 'SELECT * FROM tour_manager.exxas_invoices WHERE tour_id IS NULL ORDER BY zahlungstermin DESC NULLS LAST, dok_datum DESC NULLS LAST';
  const params = [];
  if (s) {
    q = `SELECT * FROM tour_manager.exxas_invoices
      WHERE tour_id IS NULL
        AND (LOWER(COALESCE(kunde_name,'')) LIKE $1 OR LOWER(COALESCE(bezeichnung,'')) LIKE $1 OR LOWER(COALESCE(nummer,'')) LIKE $1)
      ORDER BY zahlungstermin DESC NULLS LAST, dok_datum DESC NULLS LAST`;
    params.push(`%${s.toLowerCase()}%`);
  }
  const [invoices, suggestions] = await Promise.all([
    pool.query(q, params),
    getInvoiceLinkSuggestionsForTour(normalizedTour, { limit: 5, scanLimit: 250 }),
  ]);
  return {
    ok: true,
    tour: normalizedTour,
    invoices: invoices.rows,
    suggestions,
    search: s,
  };
}

async function postLinkInvoice(tourId, invoiceId) {
  if (!invoiceId) return { ok: false, error: 'missing' };
  const tour = await pool.query('SELECT id FROM tour_manager.tours WHERE id = $1', [tourId]);
  if (!tour.rows[0]) return { ok: false, error: 'Tour nicht gefunden' };
  const inv = await pool.query('SELECT id, tour_id FROM tour_manager.exxas_invoices WHERE id = $1', [invoiceId]);
  if (!inv.rows[0]) return { ok: false, error: 'notfound' };
  if (inv.rows[0].tour_id != null) return { ok: false, error: 'alreadylinked' };
  await pool.query('UPDATE tour_manager.exxas_invoices SET tour_id = $1 WHERE id = $2', [tourId, invoiceId]);
  return { ok: true };
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
    q += ` AND i.invoice_status = 'overdue'`;
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
  const stats = await pool.query(`
    SELECT invoice_status, COUNT(*)::int as cnt FROM tour_manager.renewal_invoices GROUP BY invoice_status
  `);
  const statusCounts = Object.fromEntries(stats.rows.map((r) => [r.invoice_status, r.cnt]));
  return {
    ok: true,
    invoices: invoices.rows,
    stats: {
      offen: (statusCounts.sent || 0) + (statusCounts.overdue || 0),
      ueberfaellig: statusCounts.overdue || 0,
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
      COUNT(*) FILTER (WHERE exxas_status != 'bz')::int         AS offen
    FROM tour_manager.exxas_invoices
    WHERE archived_at IS NULL
  `);
  const s = statsRes.rows[0] || {};
  return {
    ok: true,
    invoices: invoices.rows,
    stats: {
      offen: s.offen || 0,
      bezahlt: s.bezahlt || 0,
      total: s.total || 0,
    },
    source: 'exxas',
  };
}



const RENEWAL_INVOICE_STATUSES = new Set(['draft', 'sent', 'overdue', 'paid', 'cancelled', 'archived']);

async function deleteRenewalInvoice(invoiceId) {
  const id = parseInt(String(invoiceId), 10);
  if (!Number.isFinite(id)) throw new Error('Ungültige Rechnungs-ID');
  const r = await pool.query(
    `DELETE FROM tour_manager.renewal_invoices WHERE id = $1 AND invoice_status != 'paid' RETURNING id`,
    [id]
  );
  if (r.rowCount === 0) {
    const c = await pool.query(`SELECT invoice_status FROM tour_manager.renewal_invoices WHERE id = $1`, [id]);
    if (!c.rows[0]) throw new Error('Rechnung nicht gefunden');
    throw new Error('Bezahlte Rechnungen können nicht gelöscht werden');
  }
  return { ok: true };
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
  if (row.rows[0].invoice_status === 'paid') throw new Error('Bezahlte Rechnung kann nicht erneut versendet werden');
  const tourId = row.rows[0].tour_id;
  const result = await tourActions.sendInvoiceWithQrEmail(String(tourId), String(id));
  if (!result.success) throw new Error(result.error || 'E-Mail-Versand fehlgeschlagen');
  await pool.query(`UPDATE tour_manager.renewal_invoices SET sent_at = NOW() WHERE id = $1`, [id]);
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
    return {
      amount_chf: tx.amount ?? null,
      currency: tx.currency || 'CHF',
      booking_date: bankImport.toIsoDate(tx.bookingDate) || null,
      value_date: bankImport.toIsoDate(tx.valueDate) || null,
      reference_raw: tx.referenceRaw || null,
      debtor_name: tx.debtorName || null,
      purpose: tx.purpose || null,
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

module.exports = {
  getRenewalInvoicesJson,
  getRenewalInvoicesCentral,
  getExxasInvoicesCentral,
  deleteRenewalInvoice,
  archiveRenewalInvoice,
  updateRenewalInvoice,
  resendRenewalInvoice,
  deleteExxasInvoice,
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
  markPaidManualInvoice,
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
};
