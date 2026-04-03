/**
 * JSON-/Hilfslogik für admin-api Phase 3 (Rechnungen, Bank-Import, Matterport-Link, Rechnung linken).
 */

const { pool } = require('./db');
const matterport = require('./matterport');
const bankImport = require('./bank-import');
const { normalizeTourRow, getMatterportId } = require('./normalize');
const { logAction } = require('./actions');
const customerLookup = require('./customer-lookup');
const { ensureBankImportSchema, applyImportedPayment } = require('./bank-import-admin');
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
  const reviewRes = await pool.query(
    `SELECT t.*,
            i.invoice_number,
            i.amount_chf AS invoice_amount_chf,
            i.invoice_status,
            tr.customer_email,
            COALESCE(tr.object_label, tr.bezeichnung) AS tour_label
     FROM tour_manager.bank_import_transactions t
     LEFT JOIN tour_manager.renewal_invoices i ON i.id = t.matched_invoice_id
     LEFT JOIN tour_manager.tours tr ON tr.id = COALESCE(t.matched_tour_id, i.tour_id)
     WHERE t.match_status = 'review'
     ORDER BY t.created_at DESC
     LIMIT 120`
  );
  return { ok: true, runs: runsRes.rows, reviewRows: reviewRes.rows };
}

async function runBankImportUpload({ buffer, originalname, actorEmail }) {
  await ensureBankImportSchema();
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

  const invoiceRows = await pool.query(
    `SELECT id, tour_id, invoice_number, amount_chf, invoice_status, subscription_end_at
     FROM tour_manager.renewal_invoices
     WHERE invoice_status IN ('sent','overdue','draft','paid')
     ORDER BY created_at DESC`
  );
  const invoiceIndex = bankImport.buildOpenInvoiceIndex(invoiceRows.rows);

  let exactRows = 0;
  let reviewRows = 0;
  let noneRows = 0;
  for (const tx of transactions) {
    const match = bankImport.matchTransaction(tx, invoiceIndex);
    if (match.matchStatus === 'exact') exactRows += 1;
    else if (match.matchStatus === 'review') reviewRows += 1;
    else noneRows += 1;

    const note = `Bankimport #${runId}: ${tx.referenceRaw || '-'} / ${tx.amount ?? '-'}`;
    let finalStatus = match.matchStatus;
    if (match.matchStatus === 'exact' && match.invoice?.id) {
      const ok = await applyImportedPayment(match.invoice.id, actorEmail, {
        bookingDate: tx.bookingDate,
        note,
      });
      if (!ok) finalStatus = 'review';
    }

    await pool.query(
      `INSERT INTO tour_manager.bank_import_transactions (
        run_id, booking_date, value_date, amount_chf, currency,
        reference_raw, reference_digits, debtor_name, purpose,
        match_status, confidence, match_reason, matched_invoice_id, matched_tour_id, raw_json
      ) VALUES (
        $1, $2::date, $3::date, $4::numeric, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15::jsonb
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

async function confirmBankTransaction(txId, invoiceId, actorEmail) {
  await ensureBankImportSchema();
  if (!Number.isFinite(txId)) return { ok: false, error: 'Ungültige Transaktion.' };
  if (!String(invoiceId || '').trim()) return { ok: false, error: 'Rechnung fehlt.' };
  const txRes = await pool.query(
    `SELECT * FROM tour_manager.bank_import_transactions WHERE id = $1 LIMIT 1`,
    [txId]
  );
  const tx = txRes.rows[0];
  if (!tx) return { ok: false, error: 'Transaktion nicht gefunden.' };
  await applyImportedPayment(invoiceId, actorEmail, {
    bookingDate: tx.booking_date,
    note: `Bankimport #${tx.run_id}: ${tx.reference_raw || '-'}`,
  });
  await pool.query(
    `UPDATE tour_manager.bank_import_transactions
     SET match_status = 'exact',
         matched_invoice_id = $2::bigint,
         match_reason = COALESCE(match_reason, '') || ' | manuell bestätigt',
         confidence = GREATEST(confidence, 95)
     WHERE id = $1`,
    [txId, invoiceId]
  );
  return { ok: true };
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
           updated_at = NOW()
       WHERE id = $1`,
      [tourId, subscriptionEndIso]
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
    `SELECT id, tour_id, invoice_number
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

  await pool.query(
    `UPDATE tour_manager.tours
     SET status = 'ACTIVE',
         term_end_date = $2::date,
         ablaufdatum = $2::date,
         updated_at = NOW()
     WHERE id = $1`,
    [tourId, subWindow.endIso]
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
  const autoOpenSpace = openSpaceId
    ? (allOpenSpaces.find((model) => String(model.id || '').trim() === openSpaceId) || null)
    : null;

  let openSpaces = allOpenSpaces;
  if (qLower) {
    openSpaces = allOpenSpaces.filter((model) => {
      const createdLabel = model.created
        ? new Date(model.created).toLocaleDateString('de-CH', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      const haystack = [
        model.name || '',
        model.id || '',
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
    await pool.query(
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
      )`,
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

  if (Number.isFinite(bookingOrderNo) && bookingOrderNo > 0 && mpId) {
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

module.exports = {
  getRenewalInvoicesJson,
  getBankImportJson,
  runBankImportUpload,
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
