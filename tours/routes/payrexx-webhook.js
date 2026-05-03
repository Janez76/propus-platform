/**
 * Payrexx Webhook — registriert VOR express.json() damit express.raw() den Body liest.
 *
 * Payrexx sendet:
 *   Header:       X-Webhook-Signature: <hmac-sha256-hex>
 *   Content-Type: application/x-www-form-urlencoded
 *   Body:         PHP-Array-Syntax (transaction%5Bid%5D=1&...)
 *
 * HMAC: SHA256(rawBody, PAYREXX_WEBHOOK_SECRET)
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../lib/db');
const { logAction } = require('../lib/actions');
const { normalizeTourRow } = require('../lib/normalize');
const { unarchiveSpace: mpUnarchiveSpace, setVisibility: mpSetVisibility } = require('../lib/matterport');
const payrexx = require('../lib/payrexx');
const { getSubscriptionWindowFromStart } = require('../lib/subscriptions');
const tourActions = require('../lib/tour-actions');

async function ensureRenewalInvoiceSchema() {
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS payrexx_payment_url TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS subscription_start_at DATE`).catch(() => {});
  await pool.query(`ALTER TABLE tour_manager.renewal_invoices ADD COLUMN IF NOT EXISTS subscription_end_at DATE`).catch(() => {});
}

/**
 * Idempotency-Tabelle (siehe core/migrations/054_webhook_idempotency.sql).
 * Wird einmal pro Prozess sichergestellt, falls die Migration noch nicht
 * gefahren wurde (defensiv).
 */
let webhookIdempotencyReady = false;
async function ensureWebhookIdempotencySchema() {
  if (webhookIdempotencyReady) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tour_manager.webhook_events (
        id             BIGSERIAL PRIMARY KEY,
        provider       TEXT        NOT NULL,
        event_id       TEXT        NOT NULL,
        reference_id   TEXT        NULL,
        status         TEXT        NULL,
        received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload_sha256 TEXT        NULL,
        CONSTRAINT webhook_events_provider_event_uniq UNIQUE (provider, event_id)
      )
    `);
    webhookIdempotencyReady = true;
  } catch (err) {
    // Bewusst NICHT readyReady setzen, damit der naechste Aufruf erneut probiert.
    // Die Migration core/migrations/054_webhook_idempotency.sql ist die kanonische
    // Quelle; dieses ensure ist nur ein defensives Bootstrap.
    console.warn(
      '[payrexx-webhook] ensureWebhookIdempotencySchema fehlgeschlagen:',
      err && err.message ? err.message : err,
    );
  }
}

/**
 * Versucht einen Webhook-Event zu reservieren. Rueckgabe true = neu,
 * false = bereits verarbeitet (Replay).
 */
async function claimWebhookEvent({ provider, eventId, referenceId, status, payloadSha256 }) {
  await ensureWebhookIdempotencySchema();
  const result = await pool.query(
    `INSERT INTO tour_manager.webhook_events (provider, event_id, reference_id, status, payload_sha256)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [provider, eventId, referenceId || null, status || null, payloadSha256 || null],
  );
  return result.rowCount > 0;
}

/**
 * Gibt einen Webhook-Claim wieder frei. Wird bei einem Top-Level-Fehler im
 * Side-Effect-Block aufgerufen, damit Payrexx-Retries die Verarbeitung erneut
 * starten koennen. Vollwertige two-state Idempotency (received vs processed)
 * waere sauberer, sprengt aber Sprint A — siehe Backlog-Note.
 */
async function releaseWebhookEvent({ provider, eventId }) {
  try {
    await pool.query(
      `DELETE FROM tour_manager.webhook_events WHERE provider = $1 AND event_id = $2`,
      [provider, eventId],
    );
  } catch (err) {
    console.warn(
      '[payrexx-webhook] releaseWebhookEvent fehlgeschlagen (ignoriert):',
      err && err.message ? err.message : err,
    );
  }
}

/**
 * Parst PHP-style URL-encoded Nested Arrays:
 *   transaction[id]=1 → { transaction: { id: '1' } }
 */
function parsePhpNestedForm(urlencoded) {
  const flat = new URLSearchParams(urlencoded);
  const result = {};
  for (const [key, value] of flat.entries()) {
    // Wandelt "transaction[invoice][referenceId]" in verschachteltes Objekt um
    const parts = key.replace(/\]/g, '').split('[');
    let cur = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (cur[part] === undefined || typeof cur[part] !== 'object') cur[part] = {};
      cur = cur[part];
    }
    const last = parts[parts.length - 1];
    cur[last] = value;
  }
  return result;
}

router.post('/payrexx', express.raw({ type: '*/*' }), async (req, res) => {
  await ensureRenewalInvoiceSchema();

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
  // Payrexx sendet X-Webhook-Signature (nicht payrexx-signature)
  const signature = req.headers['x-webhook-signature'] || req.headers['payrexx-signature'] || '';

  const webhookSecret = process.env.PAYREXX_WEBHOOK_SECRET || process.env.PAYREXX_API_SECRET || '';

  if (!webhookSecret || !signature) {
    console.warn('[payrexx-webhook] Kein Secret oder keine Signatur');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex');
  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  const valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

  if (!valid) {
    console.warn('[payrexx-webhook] Signatur ungültig. Erwartet:', expected, 'Erhalten:', signature);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Body parsen: URL-encoded PHP-Array-Format
  let parsed;
  try {
    parsed = parsePhpNestedForm(rawBody);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid body' });
  }

  const transaction = parsed?.transaction || {};
  const status = String(transaction?.status || '').toLowerCase();
  // referenceId kann direkt auf transaction oder in transaction.invoice stehen
  const referenceId = String(
    transaction?.referenceId
    || transaction?.invoice?.referenceId
    || ''
  );

  console.log('[payrexx-webhook] OK – status:', status, 'referenceId:', referenceId);

  if (status === 'confirmed' || status === 'paid') {
    // Replay-Schutz: NUR fuer terminale Payment-States deduzieren. Davor wuerde
    // ein frueher 'pending'-Event den Slot konsumieren (Codex Review #1) und
    // 'confirmed'+'paid' wuerden als zwei verschiedene Events laufen, obwohl
    // beide denselben Side-Effect-Branch triggern (Codex Review #2). Loesung:
    // claimWebhookEvent NUR hier, mit kanonischem ':paid'-Suffix.
    //
    // event_id-Strategie:
    //   1. transaction.id wenn vorhanden  -> stabiler Provider-Identifier
    //   2. sonst SHA-256 des Roh-Bodies   -> deterministischer Fallback
    const transactionId = String(transaction?.id || transaction?.uuid || '').trim();
    const payloadSha256 = crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
    const baseEventId = transactionId || `sha256-${payloadSha256}`;
    const fresh = await claimWebhookEvent({
      provider: 'payrexx',
      eventId: `${baseEventId}:paid`,
      referenceId,
      status,
      payloadSha256,
    });
    if (!fresh) {
      console.log('[payrexx-webhook] replay ignoriert – baseEventId:', baseEventId, 'status:', status);
      return res.json({ ok: true, replay: true });
    }

    // Compensating action: bei einem Top-Level-Fehler im Side-Effect-Block den
    // Claim wieder freigeben, damit Payrexx-Retries die Verarbeitung erneut
    // anstossen. Vollwertige two-state-Idempotency (received vs processed) ist
    // Backlog (Sprint B). Side-Effect-Calls mit eigenem .catch() (Mail,
    // Matterport setVisibility) werfen sowieso nicht — die zaehlen als best-
    // effort und blockieren den Webhook nicht.
    const claimedEventId = `${baseEventId}:paid`;
    try {
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
        if (!invoice) {
          // Race-Condition zwischen Checkout und Persistenz oder verzoegerte
          // Invoice-Erstellung. Throw -> outer catch gibt den Idempotency-
          // Claim frei -> Payrexx-Retry verarbeitet erneut.
          throw new Error(`payrexx-webhook: renewal_invoice nicht gefunden (referenceId=${referenceId})`);
        }
        const tourResult = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1 LIMIT 1', [tourId]);
        const tour = normalizeTourRow(tourResult.rows[0] || null);
        if (!tour) {
          throw new Error(`payrexx-webhook: tour nicht gefunden (tourId=${tourId}, referenceId=${referenceId})`);
        }
        const isReactivation = invoice?.invoice_kind === 'portal_reactivation';
        let matterportState = tour?.matterport_state || null;

        const paidAtRaw = transaction?.time || new Date().toISOString();

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
          if (mpResult?.success) {
            matterportState = 'active';
            await mpSetVisibility(tour.matterport_space_id, 'LINK_ONLY').catch((err) =>
              console.warn('payrexx-webhook: setVisibility LINK_ONLY failed', tour.matterport_space_id, err?.message)
            );
          }
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
               subscription_start_date = $4::date,
               matterport_state = COALESCE($3, matterport_state),
               updated_at = NOW()
           WHERE id = $1 AND status = 'CUSTOMER_ACCEPTED_AWAITING_PAYMENT'`,
          [tourId, newTermEndDate, matterportState, subscriptionWindow.startIso]
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
      } else {
        console.log('[payrexx-webhook] referenceId passt nicht zu Tour-Format:', referenceId);
      }
    } catch (err) {
      // Slot wieder freigeben, damit Payrexx beim Retry erneut angenommen wird.
      console.error(
        '[payrexx-webhook] Fehler in Side-Effect-Block, gebe Idempotency-Claim frei:',
        err && err.message ? err.message : err,
      );
      await releaseWebhookEvent({ provider: 'payrexx', eventId: claimedEventId });
      throw err;
    }
  }

  res.json({ ok: true });
});

module.exports = router;
