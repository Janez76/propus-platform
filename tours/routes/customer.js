/**
 * Kunden-Routes: GET /r/yes?token=... und GET /r/no?token=...
 * Token-Validierung, Logging, Status-Update, Bestätigungsseite.
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../lib/db');
const { logAction } = require('../lib/actions');
const { verifyToken } = require('../lib/tokens');
const statusMachine = require('../lib/status-machine');
const payrexx = require('../lib/payrexx');
const { normalizeTourRow } = require('../lib/normalize');
const { getPortalPricingForTour } = require('../lib/subscriptions');

async function validateAndConsumeToken(token, type) {
  const result = await pool.query(
    `SELECT ct.*, t.id as tour_id, t.customer_name, t.kunde_ref, t.object_label, t.bezeichnung,
            t.customer_email, t.customer_contact, t.status, t.exxas_abo_id, t.exxas_subscription_id,
            t.term_end_date, t.ablaufdatum
     FROM tour_manager.customer_tokens ct
     JOIN tour_manager.tours t ON t.id = ct.tour_id
     WHERE ct.type = $1 AND ct.used_at IS NULL AND ct.expires_at > NOW()`,
    [type]
  );
  for (const row of result.rows) {
    const valid = await verifyToken(token, row.token);
    if (valid) {
      await pool.query(
        'UPDATE tour_manager.customer_tokens SET used_at = NOW() WHERE id = $1',
        [row.id]
      );
      return normalizeTourRow(row);
    }
  }
  return null;
}

router.get('/yes', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).render('customer/error', { message: 'Token fehlt.' });
  }

  const row = await validateAndConsumeToken(token, 'YES');
  if (!row) {
    return res.status(400).render('customer/error', { message: 'Token ungültig oder abgelaufen.' });
  }

  await logAction(row.tour_id, 'customer', 'token', 'CUSTOMER_YES', { token_id: row.id });

  if (!statusMachine.canAcceptCustomerYes(row.status)) {
    return res.render('customer/thank-you-yes', {
      message: 'Für diese Tour ist keine Verlängerung über diesen Link möglich. Bitte nutzen Sie das Kundenportal.',
    });
  }

  // Nur Payrexx – keine Exxas-Rechnung
  const pricing = getPortalPricingForTour(row);
  const baseUrl = process.env.PORTAL_BASE_URL || process.env.CUSTOMER_BASE_URL || 'https://tour.propus.ch';

  if (!payrexx.isConfigured()) {
    return res.render('customer/thank-you-yes', {
      message: 'Online-Zahlung ist momentan nicht verfügbar. Bitte melden Sie sich im Portal an: ' + baseUrl + '/portal',
    });
  }

  const dbInv = await pool.query(
    `INSERT INTO tour_manager.exxas_invoices
       (tour_id, sv_status, dok_datum, bezeichnung, preis_brutto)
     VALUES ($1, 'sent', NOW()::date, $2, $3)
     RETURNING id`,
    [row.tour_id, pricing.invoiceKind, pricing.amountCHF]
  );
  const internalInvId = dbInv.rows[0]?.id;

  await pool.query(
    "UPDATE tour_manager.tours SET status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT', updated_at = NOW() WHERE id = $1",
    [row.tour_id]
  );
  await logAction(row.tour_id, 'customer', 'token', 'CUSTOMER_YES_PAYREXX', {
    internal_inv_id: internalInvId,
    amount_chf: pricing.amountCHF,
    via: 'payrexx_only',
  });

  const successUrl = `${baseUrl}/portal/tours/${row.tour_id}?success=paid`;
  const cancelUrl = `${baseUrl}/portal?error=cancelled`;
  const refId = `tour-${row.tour_id}-internal-${internalInvId}`;
  const email = row.customer_email || '';

  const { paymentUrl, error: payErr } = await payrexx.createCheckout({
    referenceId: refId,
    amountCHF: pricing.amountCHF,
    purpose: `${row.canonical_object_label || row.bezeichnung || `Tour #${row.tour_id}`} – Verlängerung`,
    successUrl,
    cancelUrl,
    email,
  });

  if (paymentUrl) {
    await pool.query(
      `UPDATE tour_manager.exxas_invoices SET payrexx_payment_url = $1 WHERE id = $2`,
      [paymentUrl, internalInvId]
    );
    return res.redirect(paymentUrl);
  }
  if (payErr) console.warn('Payrexx createCheckout (r/yes):', payErr);
  res.render('customer/thank-you-yes', {
    message: 'Die Zahlung konnte nicht gestartet werden. Bitte versuchen Sie es im Portal: ' + baseUrl + '/portal',
  });
});

router.get('/no', async (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).render('customer/error', { message: 'Token fehlt.' });
  }

  const row = await validateAndConsumeToken(token, 'NO');
  if (!row) {
    return res.status(400).render('customer/error', { message: 'Token ungültig oder abgelaufen.' });
  }

  await logAction(row.tour_id, 'customer', 'token', 'CUSTOMER_NO', { token_id: row.id });

  if (statusMachine.canAcceptCustomerNo(row.status)) {
    await logAction(row.tour_id, 'customer', 'token', 'CUSTOMER_NO_DECLINE_INTENT', {
      note: 'Tour bleibt ACTIVE bis term_end_date; kein CUSTOMER_DECLINED mehr',
    });
  }

  res.render('customer/thank-you-no', {
    message: 'Besten Dank. Die Tour bleibt bis zum Ablaufdatum aktiv; danach wird sie archiviert.',
  });
});

module.exports = router;
