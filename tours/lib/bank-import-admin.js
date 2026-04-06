/**
 * Bank-Import Schema + Zahlung verbuchen (geteilt mit admin.js-Logik).
 */

const { pool } = require('./db');
const matterport = require('./matterport');
const tourActions = require('./tour-actions');
const { logAction } = require('./actions');
const { toIsoDate } = require('./subscriptions');

let bankImportSchemaEnsured = false;

async function ensureRenewalInvoiceImportSchema() {
  await pool.query(`
    ALTER TABLE tour_manager.renewal_invoices
      ADD COLUMN IF NOT EXISTS exxas_invoice_id TEXT
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_renewal_invoices_exxas_invoice_id
      ON tour_manager.renewal_invoices (exxas_invoice_id)
      WHERE exxas_invoice_id IS NOT NULL
  `);
}

async function ensureBankImportSchema() {
  if (bankImportSchemaEnsured) return;
  await ensureRenewalInvoiceImportSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.bank_import_runs (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      source_format VARCHAR(16) NOT NULL,
      file_name TEXT,
      total_rows INT NOT NULL DEFAULT 0,
      exact_rows INT NOT NULL DEFAULT 0,
      review_rows INT NOT NULL DEFAULT 0,
      none_rows INT NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.bank_import_transactions (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES tour_manager.bank_import_runs(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      booking_date DATE,
      value_date DATE,
      amount_chf NUMERIC(10,2),
      currency VARCHAR(3),
      reference_raw TEXT,
      reference_digits TEXT,
      debtor_name TEXT,
      purpose TEXT,
      match_status VARCHAR(16) NOT NULL DEFAULT 'none',
      confidence INT NOT NULL DEFAULT 0,
      match_reason TEXT,
      matched_invoice_id BIGINT,
      matched_tour_id INT,
      raw_json JSONB
    )
  `);
  await pool.query(`
    ALTER TABLE tour_manager.bank_import_transactions
      ADD COLUMN IF NOT EXISTS matched_invoice_source VARCHAR(16)
  `);
  const col = await pool.query(`
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'tour_manager'
      AND table_name = 'bank_import_transactions'
      AND column_name = 'matched_invoice_id'
  `);
  const dt = col.rows[0];
  if (dt && (dt.data_type === 'uuid' || dt.udt_name === 'uuid')) {
    await pool.query(`
      ALTER TABLE tour_manager.bank_import_transactions
        ALTER COLUMN matched_invoice_id TYPE BIGINT USING NULL
    `);
  }
  // Sequenzen synchronisieren (verhindert duplicate key bei wiederverwendeten IDs)
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('tour_manager.bank_import_runs', 'id'),
      COALESCE((SELECT MAX(id) FROM tour_manager.bank_import_runs), 0) + 1,
      false
    )
  `);
  await pool.query(`
    SELECT setval(
      pg_get_serial_sequence('tour_manager.bank_import_transactions', 'id'),
      COALESCE((SELECT MAX(id) FROM tour_manager.bank_import_transactions), 0) + 1,
      false
    )
  `);
  bankImportSchemaEnsured = true;
}

function toImportIso(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function classifyExxasInvoiceStatus(invoice) {
  if (invoice?.exxas_status === 'bz') return 'paid';
  const due = invoice?.zahlungstermin ? new Date(invoice.zahlungstermin) : null;
  if (due && !Number.isNaN(due.getTime()) && due < new Date()) return 'overdue';
  return 'sent';
}

function getExxasExternalInvoiceId(invoice) {
  return String(invoice?.exxas_document_id || invoice?.nummer || '').trim() || null;
}

async function applySafeTourSyncFromRenewalInvoice(invoice) {
  const tourId = Number(invoice?.tour_id);
  if (!Number.isFinite(tourId) || tourId <= 0) return false;
  const status = String(invoice?.invoice_status || '').trim().toLowerCase();
  const subEndIso = toImportIso(invoice?.subscription_end_at);
  if (status !== 'paid') return false;
  if (!subEndIso) {
    const fallback = await pool.query(
      `UPDATE tour_manager.tours
       SET status = 'ACTIVE',
           updated_at = NOW()
       WHERE id = $1
         AND status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'`,
      [tourId]
    );
    return fallback.rowCount > 0;
  }
  const subEndDate = new Date(subEndIso);
  if (Number.isNaN(subEndDate.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (subEndDate < today) return false;
  const subStartIso = toImportIso(invoice?.subscription_start_at) || toImportIso(invoice?.paid_at) || subEndIso;
  await pool.query(
    `UPDATE tour_manager.tours
     SET status = 'ACTIVE',
         term_end_date = $2::date,
         ablaufdatum = $2::date,
         subscription_start_date = $3::date,
         updated_at = NOW()
     WHERE id = $1`,
    [tourId, subEndIso, subStartIso]
  );
  return true;
}

async function applyImportedPayment(invoiceId, actorEmail, details = {}) {
  const invoiceRes = await pool.query(
    `SELECT id, tour_id, invoice_number, invoice_kind, subscription_end_at, subscription_start_at
     FROM tour_manager.renewal_invoices
     WHERE id = $1
     LIMIT 1`,
    [invoiceId]
  );
  const inv = invoiceRes.rows[0];
  if (!inv) return false;
  const paidAtIso = toImportIso(details.bookingDate) || toIsoDate(new Date());
  const note = String(details.note || '').trim() || 'Bankimport';
  await pool.query(
    `UPDATE tour_manager.renewal_invoices
     SET invoice_status = 'paid',
         paid_at = $2::date,
         payment_method = 'bank_transfer',
         payment_source = 'bank_import',
         payment_note = CASE
           WHEN COALESCE(payment_note, '') = '' THEN $3
           ELSE payment_note || E'\n' || $3
         END,
         recorded_by = $4,
         recorded_at = NOW()
     WHERE id = $1`,
    [invoiceId, paidAtIso, note, actorEmail || 'admin']
  );

  if (inv.subscription_end_at) {
    const endIso = toImportIso(inv.subscription_end_at);
    const startFromInv = toImportIso(inv.subscription_start_at);
    const subStartIso = startFromInv || paidAtIso;
    if (endIso) {
      await pool.query(
        `UPDATE tour_manager.tours
         SET status = 'ACTIVE',
             term_end_date = $2::date,
             ablaufdatum = $2::date,
             subscription_start_date = $3::date,
             updated_at = NOW()
         WHERE id = $1`,
        [inv.tour_id, endIso, subStartIso]
      );

      if (inv.invoice_kind === 'portal_reactivation') {
        const tourMpRes = await pool.query(
          `SELECT matterport_space_id FROM tour_manager.tours WHERE id = $1 LIMIT 1`,
          [inv.tour_id]
        );
        const spaceId = tourMpRes.rows[0]?.matterport_space_id;
        if (spaceId) {
          matterport.unarchiveSpace(spaceId).then((mpResult) => {
            if (mpResult?.success) {
              pool.query(
                `UPDATE tour_manager.tours SET matterport_state = 'active', updated_at = NOW() WHERE id = $1`,
                [inv.tour_id]
              ).catch(() => null);
            }
          }).catch((err) => {
            console.warn('applyImportedPayment: unarchiveSpace failed', inv.tour_id, err.message);
          });
        }
      }

      const templateKey = inv.invoice_kind === 'portal_reactivation' ? 'reactivation_confirmed' : 'extension_confirmed';
      tourActions.sendPaymentConfirmedEmail(inv.tour_id, endIso, templateKey).catch((err) => {
        console.warn('applyImportedPayment: sendPaymentConfirmedEmail failed', inv.tour_id, err.message);
      });
    }
  }

  await logAction(inv.tour_id, 'admin', actorEmail || 'admin', 'INVOICE_MARK_PAID_BANK_IMPORT', {
    invoice_id: inv.id,
    invoice_number: inv.invoice_number || null,
    paid_at: paidAtIso,
    note,
  });
  return true;
}

async function importExxasInvoiceToRenewal(exxasInvoiceId, actorEmail) {
  await ensureRenewalInvoiceImportSchema();
  const id = parseInt(String(exxasInvoiceId || ''), 10);
  if (!Number.isFinite(id)) {
    return { ok: false, error: 'Ungültige Exxas-Rechnungs-ID.' };
  }
  const invoiceRes = await pool.query(
    `SELECT *
     FROM tour_manager.exxas_invoices
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  const invoice = invoiceRes.rows[0];
  if (!invoice) {
    return { ok: false, error: 'Exxas-Rechnung nicht gefunden.' };
  }
  const tourId = Number(invoice.tour_id);
  if (!Number.isFinite(tourId) || tourId <= 0) {
    return { ok: false, error: 'Exxas-Rechnung ist keiner Tour zugeordnet.' };
  }
  const externalInvoiceId = String(invoice.exxas_document_id || invoice.nummer || '').trim();
  if (!externalInvoiceId) {
    return { ok: false, error: 'Exxas-Rechnung hat keine importierbare Referenz.' };
  }

  const existingRes = await pool.query(
    `SELECT id
     FROM tour_manager.renewal_invoices
     WHERE tour_id = $1
       AND exxas_invoice_id = $2
     LIMIT 1`,
    [tourId, externalInvoiceId]
  );
  const existing = existingRes.rows[0];
  if (existing) {
    return {
      ok: true,
      created: false,
      invoiceId: existing.id,
      tourId,
      exxasInvoiceId: externalInvoiceId,
    };
  }

  const status = classifyExxasInvoiceStatus(invoice);
  const note = `Importiert aus Exxas (${invoice.nummer || invoice.exxas_document_id || id})`;
  const paidAtIso = status === 'paid'
    ? toImportIso(invoice.zahlungstermin) || toImportIso(invoice.dok_datum)
    : null;
  const createdRes = await pool.query(
    `INSERT INTO tour_manager.renewal_invoices (
      tour_id,
      exxas_invoice_id,
      invoice_number,
      invoice_status,
      amount_chf,
      due_at,
      sent_at,
      paid_at,
      payment_source,
      payment_note,
      recorded_by,
      recorded_at
    ) VALUES (
      $1,
      $2,
      $3,
      $4,
      $5::numeric,
      $6::timestamptz,
      $7::timestamptz,
      $8::timestamptz,
      $9,
      $10,
      $11,
      NOW()
    )
    RETURNING id`,
    [
      tourId,
      externalInvoiceId,
      invoice.nummer || null,
      status,
      invoice.preis_brutto ?? null,
      invoice.zahlungstermin || null,
      invoice.dok_datum || null,
      paidAtIso,
      'exxas_import',
      note,
      actorEmail || 'admin',
    ]
  );
  const createdId = createdRes.rows[0]?.id || null;
  if (createdId) {
    await logAction(tourId, 'admin', actorEmail || 'admin', 'EXXAS_INVOICE_IMPORTED_TO_INTERNAL', {
      exxas_row_id: id,
      exxas_invoice_id: externalInvoiceId,
      invoice_number: invoice.nummer || null,
      imported_invoice_id: createdId,
    });
  }
  return {
    ok: true,
    created: true,
    invoiceId: createdId,
    tourId,
    exxasInvoiceId: externalInvoiceId,
  };
}

async function syncRenewalInvoiceFromExxas(exxasInvoiceId, actorEmail, options = {}) {
  await ensureRenewalInvoiceImportSchema();
  const createIfMissing = options.createIfMissing !== false;
  const id = parseInt(String(exxasInvoiceId || ''), 10);
  if (!Number.isFinite(id)) {
    return { ok: false, error: 'Ungültige Exxas-Rechnungs-ID.' };
  }
  const invoiceRes = await pool.query(
    `SELECT *
     FROM tour_manager.exxas_invoices
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  const invoice = invoiceRes.rows[0];
  if (!invoice) {
    return { ok: false, error: 'Exxas-Rechnung nicht gefunden.' };
  }
  const tourId = Number(invoice.tour_id);
  if (!Number.isFinite(tourId) || tourId <= 0) {
    return { ok: false, error: 'Exxas-Rechnung ist keiner Tour zugeordnet.' };
  }
  const externalInvoiceId = getExxasExternalInvoiceId(invoice);
  if (!externalInvoiceId) {
    return { ok: false, error: 'Exxas-Rechnung hat keine importierbare Referenz.' };
  }

  const status = classifyExxasInvoiceStatus(invoice);
  const paidAtIso = status === 'paid'
    ? toImportIso(invoice.zahlungstermin) || toImportIso(invoice.dok_datum)
    : null;
  const dueAtIso = toImportIso(invoice.zahlungstermin);
  const sentAtIso = toImportIso(invoice.dok_datum);
  const note = `Mit Exxas abgeglichen (${invoice.nummer || invoice.exxas_document_id || id})`;

  const existingRes = await pool.query(
    `SELECT id, tour_id, invoice_status, invoice_kind, subscription_start_at, subscription_end_at, paid_at
     FROM tour_manager.renewal_invoices
     WHERE tour_id = $1
       AND exxas_invoice_id = $2
     LIMIT 1`,
    [tourId, externalInvoiceId]
  );
  const existing = existingRes.rows[0] || null;

  if (!existing) {
    if (!createIfMissing) {
      return {
        ok: true,
        created: false,
        updated: false,
        invoiceId: null,
        tourId,
        exxasInvoiceId: externalInvoiceId,
      };
    }
    return importExxasInvoiceToRenewal(id, actorEmail);
  }

  const updatedRes = await pool.query(
    `UPDATE tour_manager.renewal_invoices
     SET invoice_number = COALESCE($3, invoice_number),
         invoice_status = $4,
         amount_chf = COALESCE($5::numeric, amount_chf),
         due_at = COALESCE($6::timestamptz, due_at),
         sent_at = COALESCE($7::timestamptz, sent_at),
         paid_at = CASE
           WHEN $4 = 'paid' THEN COALESCE($8::timestamptz, paid_at, $7::timestamptz, $6::timestamptz)
           ELSE NULL
         END,
         payment_source = CASE
           WHEN $4 = 'paid' AND COALESCE(payment_source, '') = '' THEN 'exxas_sync'
           ELSE payment_source
         END,
         payment_note = CASE
           WHEN COALESCE(payment_note, '') = '' THEN $9
           WHEN payment_note LIKE '%' || $9 || '%' THEN payment_note
           ELSE payment_note || E'\\n' || $9
         END,
         recorded_by = $10,
         recorded_at = NOW()
     WHERE id = $1
       AND tour_id = $2
     RETURNING id, tour_id, invoice_number, invoice_status, invoice_kind, subscription_start_at, subscription_end_at, paid_at`,
    [
      existing.id,
      tourId,
      invoice.nummer || null,
      status,
      invoice.preis_brutto ?? null,
      dueAtIso,
      sentAtIso,
      paidAtIso,
      note,
      actorEmail || 'admin',
    ]
  );
  const updated = updatedRes.rows[0] || null;
  if (updated) {
    await applySafeTourSyncFromRenewalInvoice(updated);
    await logAction(tourId, 'admin', actorEmail || 'admin', 'RENEWAL_INVOICE_SYNCED_FROM_EXXAS', {
      exxas_row_id: id,
      exxas_invoice_id: externalInvoiceId,
      renewal_invoice_id: updated.id,
      invoice_status: updated.invoice_status,
      amount_chf: invoice.preis_brutto ?? null,
      due_at: dueAtIso,
    });
  }
  return {
    ok: true,
    created: false,
    updated: !!updated,
    invoiceId: updated?.id || existing.id,
    tourId,
    exxasInvoiceId: externalInvoiceId,
  };
}

module.exports = {
  ensureBankImportSchema,
  applyImportedPayment,
  importExxasInvoiceToRenewal,
  syncRenewalInvoiceFromExxas,
};
