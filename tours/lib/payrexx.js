/**
 * Payrexx REST API v1 – Checkout erstellen und Webhook verifizieren.
 *
 * Env-Variablen:
 *   PAYREXX_INSTANCE  – Payrexx-Instanzname (z. B. "propus")
 *   PAYREXX_API_SECRET – API-Secret aus Payrexx-Dashboard
 *
 * Hinweis: E-Mails an Kunden (Zahlungsbestätigung, Ablauf-Erinnerung, Verlängerung)
 * werden von uns via Microsoft Graph verschickt. Im Payrexx-Dashboard unter
 * Settings → Notifications die Kunden-Benachrichtigungen deaktivieren, damit
 * keine doppelten Mails von Payrexx gesendet werden.
 *
 * Doku: https://developers.payrexx.com/reference
 */

const crypto = require('crypto');

const PAYREXX_INSTANCE = process.env.PAYREXX_INSTANCE || '';
const PAYREXX_API_SECRET = process.env.PAYREXX_API_SECRET || '';
const PAYREXX_BASE = `https://api.payrexx.com/v1.0`;

function getAuthHeader() {
  if (!PAYREXX_API_SECRET) return null;
  // X-API-KEY ist die empfohlene Methode laut Payrexx-Doku
  return PAYREXX_API_SECRET;
}

/**
 * Erstellt einen Payrexx-Checkout (Gateway).
 *
 * @param {object} opts
 * @param {string} opts.referenceId    – Interne Referenz (z. B. tour_id oder invoice_id)
 * @param {number} opts.amountCHF     – Betrag in CHF (z. B. 120.00)
 * @param {string} opts.purpose       – Verwendungszweck (Name der Tour / Objekt)
 * @param {string} opts.successUrl    – Redirect nach Zahlung
 * @param {string} opts.cancelUrl     – Redirect bei Abbruch
 * @param {string} [opts.email]       – E-Mail des Kunden (optional)
 * @returns {{ paymentUrl: string|null, gatewayId: string|null, error: string|null }}
 */
async function createCheckout({ referenceId, amountCHF, purpose, successUrl, cancelUrl, email }) {
  if (!PAYREXX_INSTANCE || !PAYREXX_API_SECRET) {
    return { paymentUrl: null, gatewayId: null, error: 'PAYREXX_INSTANCE und PAYREXX_API_SECRET setzen' };
  }

  const amountRappen = Math.round(Number(amountCHF) * 100);
  if (!amountRappen || amountRappen <= 0) {
    return { paymentUrl: null, gatewayId: null, error: 'Ungültiger Betrag' };
  }

  const body = new URLSearchParams();
  body.append('amount', String(amountRappen));
  body.append('currency', 'CHF');
  body.append('purpose', String(purpose || 'Propus VR Tour'));
  body.append('successRedirectUrl', String(successUrl));
  body.append('cancelRedirectUrl', String(cancelUrl));
  body.append('referenceId', String(referenceId));
  if (email) body.append('fields[email][value]', String(email));

  // Zahlungsmethoden einschränken für übersichtlichere Darstellung (ohne Duplikate)
  // PAYREXX_PAYMENT_METHODS: curated (Default) | all | visa,mastercard,twint,...
  const pmEnv = String(process.env.PAYREXX_PAYMENT_METHODS || 'curated').trim().toLowerCase();
  const pmList = pmEnv === 'all' ? [] : (pmEnv === 'curated' ? ['visa', 'mastercard', 'apple-pay', 'google-pay', 'twint', 'post-finance-pay', 'pay-by-bank', 'klarna', 'invoice'] : pmEnv.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean));
  pmList.forEach((pm) => body.append('pm[]', pm));

  const url = `${PAYREXX_BASE}/Gateway/?instance=${encodeURIComponent(PAYREXX_INSTANCE)}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-KEY': getAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(12000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.status === 'error') {
      return { paymentUrl: null, gatewayId: null, error: data.message || `Payrexx HTTP ${response.status}` };
    }
    const gateway = Array.isArray(data.data) ? data.data[0] : data.data;
    const paymentUrl = gateway?.link || gateway?.invoice?.paymentLink || null;
    const gatewayId = gateway?.id ? String(gateway.id) : null;
    return { paymentUrl, gatewayId, error: null };
  } catch (e) {
    if (e.name === 'TimeoutError') return { paymentUrl: null, gatewayId: null, error: 'Payrexx API Timeout' };
    return { paymentUrl: null, gatewayId: null, error: e.message };
  }
}

/**
 * Gibt Informationen zu einem bestehenden Gateway zurück.
 *
 * @param {string|number} gatewayId
 * @returns {{ gateway: object|null, error: string|null }}
 */
async function getGateway(gatewayId) {
  if (!PAYREXX_INSTANCE || !PAYREXX_API_SECRET) {
    return { gateway: null, error: 'PAYREXX_INSTANCE und PAYREXX_API_SECRET setzen' };
  }
  try {
    const url = `${PAYREXX_BASE}/Gateway/${encodeURIComponent(gatewayId)}/?instance=${encodeURIComponent(PAYREXX_INSTANCE)}`;
    const response = await fetch(url, {
      headers: { 'X-API-KEY': getAuthHeader() },
      signal: AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { gateway: null, error: `Payrexx HTTP ${response.status}` };
    const gateway = Array.isArray(data.data) ? data.data[0] : data.data;
    return { gateway: gateway || null, error: null };
  } catch (e) {
    return { gateway: null, error: e.message };
  }
}

/**
 * Verifiziert die Signatur eines Payrexx-Webhooks.
 * Payrexx signiert mit HMAC-SHA256 über den Raw-Body.
 *
 * @param {string} rawBody      – Roher Request-Body als String
 * @param {string} signature    – Wert des Headers "payrexx-signature"
 * @returns {boolean}
 */
function verifyWebhook(rawBody, signature) {
  if (!PAYREXX_API_SECRET || !signature) return false;
  const expected = crypto
    .createHmac('sha256', PAYREXX_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Gibt an ob Payrexx konfiguriert ist.
 */
function isConfigured() {
  return !!(PAYREXX_INSTANCE && PAYREXX_API_SECRET);
}

module.exports = { createCheckout, getGateway, verifyWebhook, isConfigured };
