'use strict';

const SUBSCRIPTION_MONTHS = 6;
const EXTENSION_PRICE_CHF = 59;
const REACTIVATION_FEE_CHF = 15;
const REACTIVATION_PRICE_CHF = EXTENSION_PRICE_CHF + REACTIVATION_FEE_CHF;

// Wie viele Tage vor Ablauf soll die Verlängerungsrechnung versendet werden
const RENEWAL_NOTICE_DAYS = 30;

function addMonths(baseDate, months = SUBSCRIPTION_MONTHS) {
  const date = baseDate ? new Date(baseDate) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getInitialTermEndDate(startDate = new Date()) {
  return addMonths(startDate, SUBSCRIPTION_MONTHS);
}

function getPortalPricingForTour(tour) {
  const isReactivation = String(tour?.status || '').toUpperCase() === 'ARCHIVED';
  return {
    months: SUBSCRIPTION_MONTHS,
    isReactivation,
    amountCHF: isReactivation ? REACTIVATION_PRICE_CHF : EXTENSION_PRICE_CHF,
    basePriceCHF: EXTENSION_PRICE_CHF,
    reactivationFeeCHF: isReactivation ? REACTIVATION_FEE_CHF : 0,
    actionLabel: isReactivation ? 'Reaktivierung' : 'Verlaengerung',
    invoiceKind: isReactivation ? 'portal_reactivation' : 'portal_extension',
  };
}

function getNextTermEndDate(currentEndDate, options = {}) {
  const { reactivation = false } = options;
  const now = new Date();
  let base = now;
  if (!reactivation && currentEndDate) {
    const endDate = new Date(currentEndDate);
    if (!Number.isNaN(endDate.getTime()) && endDate > now) {
      base = endDate;
    }
  }
  return addMonths(base, SUBSCRIPTION_MONTHS);
}

function getSubscriptionWindowFromStart(startDate, months = SUBSCRIPTION_MONTHS) {
  const start = startDate ? new Date(startDate) : new Date();
  if (Number.isNaN(start.getTime())) {
    return {
      startDate: null,
      endDate: null,
      startIso: null,
      endIso: null,
    };
  }
  const end = addMonths(start, months);
  return {
    startDate: start,
    endDate: end,
    startIso: toIsoDate(start),
    endIso: toIsoDate(end),
  };
}

// ─── scheduled_renewals: Schema sicherstellen ────────────────────────────────

let renewalSchemaEnsured = false;
async function ensureScheduledRenewalsSchema() {
  if (renewalSchemaEnsured) return;
  const { pool } = require('./db');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.scheduled_renewals (
      id SERIAL PRIMARY KEY,
      tour_id INTEGER NOT NULL REFERENCES tour_manager.tours(id) ON DELETE CASCADE,
      send_at TIMESTAMPTZ NOT NULL,
      term_end_date DATE NOT NULL,
      executed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_renewals_tour_term
      ON tour_manager.scheduled_renewals(tour_id, term_end_date)
      WHERE executed_at IS NULL
  `);
  renewalSchemaEnsured = true;
}

// ─── scheduleRenewalInvoice ───────────────────────────────────────────────────

/**
 * Plant eine automatische Verlängerungsrechnung für eine Tour.
 * send_at = termEndDate - RENEWAL_NOTICE_DAYS
 *
 * Idempotent: doppelte Einträge werden via UNIQUE INDEX verhindert.
 */
async function scheduleRenewalInvoice(tourId, termEndDate) {
  await ensureScheduledRenewalsSchema();
  const { pool } = require('./db');

  const endDate = termEndDate instanceof Date ? termEndDate : new Date(termEndDate);
  if (Number.isNaN(endDate.getTime())) {
    console.warn('scheduleRenewalInvoice: ungültiges termEndDate', tourId, termEndDate);
    return;
  }

  const sendAt = new Date(endDate.getTime());
  sendAt.setDate(sendAt.getDate() - RENEWAL_NOTICE_DAYS);

  const termEndIso = toIsoDate(endDate);

  await pool.query(
    `INSERT INTO tour_manager.scheduled_renewals (tour_id, send_at, term_end_date)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [tourId, sendAt.toISOString(), termEndIso]
  );
}

// ─── triggerDueRenewalInvoices: Cron-Job ─────────────────────────────────────

/**
 * Verarbeitet alle fälligen geplanten Verlängerungsrechnungen.
 * Wird täglich via Cron-Endpunkt aufgerufen.
 *
 * Für jede fällige scheduled_renewals-Zeile:
 *   1. Rechnung erstellen (invoice_status = 'sent', qr_pending)
 *   2. QR-Rechnung per E-Mail senden
 *   3. scheduled_renewals.executed_at = NOW() setzen
 */
async function triggerDueRenewalInvoices() {
  await ensureScheduledRenewalsSchema();
  const { pool } = require('./db');
  const tourActions = require('./tour-actions');

  const dueRows = await pool.query(
    `SELECT sr.id, sr.tour_id, sr.term_end_date, sr.send_at,
            t.status, t.customer_email,
            COALESCE(t.object_label, t.bezeichnung, 'Tour ' || t.id::text) AS tourname
     FROM tour_manager.scheduled_renewals sr
     JOIN tour_manager.tours t ON t.id = sr.tour_id
     WHERE sr.send_at <= NOW()
       AND sr.executed_at IS NULL
       AND t.status IN ('ACTIVE', 'EXPIRING_SOON')
       AND (t.customer_email IS NOT NULL AND TRIM(t.customer_email) != '')
     ORDER BY sr.send_at ASC`
  );

  const results = [];

  for (const row of dueRows.rows) {
    try {
      // Bereits eine offene Rechnung für dieses Abo-Window vorhanden?
      const existing = await pool.query(
        `SELECT id FROM tour_manager.renewal_invoices
         WHERE tour_id = $1
           AND invoice_status IN ('sent','pending','paid')
           AND subscription_end_at = $2::date
         LIMIT 1`,
        [row.tour_id, row.term_end_date]
      );
      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE tour_manager.scheduled_renewals SET executed_at = NOW() WHERE id = $1`,
          [row.id]
        );
        results.push({ tourId: row.tour_id, skipped: true, reason: 'Rechnung bereits vorhanden' });
        continue;
      }

      const subWindow = getSubscriptionWindowFromStart(new Date());
      const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      const invRes = await pool.query(
        `INSERT INTO tour_manager.renewal_invoices
           (tour_id, invoice_status, sent_at, amount_chf, due_at, invoice_kind, payment_source,
            subscription_start_at, subscription_end_at)
         VALUES ($1, 'sent', NOW(), $2, $3, 'portal_extension', 'qr_pending', $4, $5)
         RETURNING id`,
        [row.tour_id, EXTENSION_PRICE_CHF, dueAt, subWindow.startIso, subWindow.endIso]
      );
      const invoiceId = invRes.rows[0]?.id;

      tourActions.sendInvoiceWithQrEmail(String(row.tour_id), invoiceId).catch((err) => {
        console.error('[subscriptions] triggerDueRenewalInvoices: sendInvoiceWithQrEmail failed', row.tour_id, err.message);
      });

      await pool.query(
        `UPDATE tour_manager.scheduled_renewals SET executed_at = NOW() WHERE id = $1`,
        [row.id]
      );

      results.push({ tourId: row.tour_id, invoiceId, amount: EXTENSION_PRICE_CHF, sent: true });
    } catch (err) {
      console.error('[subscriptions] triggerDueRenewalInvoices error', row.tour_id, err.message);
      results.push({ tourId: row.tour_id, error: err.message });
    }
  }

  return {
    processed: dueRows.rows.length,
    sent: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => r.skipped).length,
    errors: results.filter((r) => r.error).length,
    results,
  };
}

module.exports = {
  SUBSCRIPTION_MONTHS,
  EXTENSION_PRICE_CHF,
  REACTIVATION_FEE_CHF,
  REACTIVATION_PRICE_CHF,
  RENEWAL_NOTICE_DAYS,
  addMonths,
  toIsoDate,
  getInitialTermEndDate,
  getPortalPricingForTour,
  getNextTermEndDate,
  getSubscriptionWindowFromStart,
  ensureScheduledRenewalsSchema,
  scheduleRenewalInvoice,
  triggerDueRenewalInvoices,
};
