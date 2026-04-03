/**
 * Payrexx Webhook — muss VOR express.json() registriert werden,
 * damit express.raw() den unveränderten Body für die HMAC-Signatur-Verifizierung lesen kann.
 *
 * Eingebunden in tours/server.js als:
 *   app.use('/webhook', require('./routes/payrexx-webhook'));
 * vor app.use(express.json())
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../lib/db');
const { logAction } = require('../lib/actions');
const { normalizeTourRow } = require('../lib/normalize');
const { unarchiveSpace: mpUnarchiveSpace } = require('../lib/matterport');
const payrexx = require('../lib/payrexx');
const { getSubscriptionWindowFromStart } = require('../lib/subscriptions');
const tourActions = require('../lib/tour-actions');

async function ensureRenewalInvoiceSchema() {
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payrexx_payment_url TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS subscription_start_at DATE`).catch(() => {});
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS subscription_end_at DATE`).catch(() => {});
}

router.post('/payrexx', express.raw({ type: '*/*' }), async (req, res) => {
  await ensureRenewalInvoiceSchema();
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  const signature = req.headers['payrexx-signature'] || '';

  if (!payrexx.verifyWebhook(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let data;
  try {
    data = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const transaction = data?.transaction || data?.payment;
  const status = String(transaction?.status || '').toLowerCase();
  const referenceId = String(transaction?.referenceId || data?.referenceId || '');

  if (status === 'confirmed' || status === 'paid') {
    const match = referenceId.match(/tour-(\d+)-(?:inv|internal)-(.+)/);
    if (match) {
      const tourId = parseInt(match[1], 10);
      const invoiceRef = match[2];
      const invoiceResult = await pool.query(
        `SELECT id, invoice_number, invoice_kind, invoice_status, tour_id
         FROM tour_manager.renewal_invoices
         WHERE (id::text = $1 OR invoice_number = $1)
           AND tour_id = $2
         LIMIT 1`,
        [invoiceRef, tourId]
      );
      const invoice = invoiceResult.rows[0];
      const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId]);
      const tour = normalizeTourRow(tourResult.rows[0] || null);
      const isReactivation = invoice?.invoice_kind === 'portal_reactivation';
      let matterportState = tour?.matterport_state || null;

      const paidAtRaw =
        transaction?.confirmedAt
        || transaction?.confirmed_at
        || transaction?.createdAt
        || transaction?.created_at
        || transaction?.date
        || data?.createdAt
        || data?.date
        || new Date().toISOString();

      let subscriptionWindow;
      if (isReactivation) {
        subscriptionWindow = getSubscriptionWindowFromStart(paidAtRaw);
      } else {
        const existingEnd = tour?.canonical_term_end_date || tour?.term_end_date || tour?.ablaufdatum || null;
        const base = existingEnd && new Date(existingEnd) > new Date() ? existingEnd : paidAtRaw;
        subscriptionWindow = getSubscriptionWindowFromStart(base);
      }

      if (isReactivation && tour?.matterport_space_id) {
        const mpResult = await mpUnarchiveSpace(tour.matterport_space_id);
        if (mpResult?.success) matterportState = 'active';
      }

      await pool.query(
        `UPDATE tour_manager.renewal_invoices
         SET invoice_status = 'paid',
             paid_at = $3::date,
             payment_source = 'payrexx',
             payment_method = 'payrexx',
             subscription_start_at = $3::date,
             subscription_end_at = $4::date
         WHERE (id::text = $1 OR invoice_number = $1)
           AND tour_id = $2`,
        [invoiceRef, tourId, subscriptionWindow.startIso, subscriptionWindow.endIso]
      );

      const newTermEndDate = subscriptionWindow.endIso;
      const tourUpdateResult = await pool.query(
        `UPDATE tour_manager.tours
         SET status = 'ACTIVE',
             term_end_date = $2,
             ablaufdatum = $2,
             matterport_state = COALESCE($3, matterport_state),
             updated_at = NOW()
         WHERE id = $1 AND status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'`,
        [tourId, newTermEndDate, matterportState]
      );

      await logAction(tourId, 'system', 'payrexx', 'PAYMENT_CONFIRMED', {
        referenceId,
        transactionStatus: status,
        reactivation: isReactivation,
        subscription_start_at: subscriptionWindow.startIso,
        subscription_end_at: subscriptionWindow.endIso,
      });

      if (tourUpdateResult.rowCount > 0) {
        const templateKey = isReactivation ? 'reactivation_confirmed' : 'extension_confirmed';
        tourActions.sendPaymentConfirmedEmail(tourId, newTermEndDate, templateKey).catch((err) => {
          console.error('[payrexx-webhook] sendPaymentConfirmedEmail failed', tourId, err.message);
        });
      }
    }
  }

  res.json({ ok: true });
});

module.exports = router;
