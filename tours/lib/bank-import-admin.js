/**
 * Bank-Import Schema + Zahlung verbuchen (geteilt mit admin.js-Logik).
 */

const { pool } = require('./db');
const matterport = require('./matterport');
const tourActions = require('./tour-actions');
const { logAction } = require('./actions');
const { toIsoDate } = require('./subscriptions');

let bankImportSchemaEnsured = false;

async function ensureBankImportSchema() {
  if (bankImportSchemaEnsured) return;
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
  bankImportSchemaEnsured = true;
}

function toImportIso(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
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

module.exports = {
  ensureBankImportSchema,
  applyImportedPayment,
};
