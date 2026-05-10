'use strict';

/**
 * Self-Serve Magic-Link Login fuer Kunden.
 *
 * Flow:
 *   1. POST /api/customer/magic-link/request  { email }
 *      -> requestLoginLink(email): Token erzeugen, Hash speichern, Mail senden.
 *         Antwort ist IMMER ok (kein Account-Enumeration).
 *   2. GET /api/customer/magic-link/callback?token=...
 *      -> consumeLoginToken(token): Token einlosen, customer_session erzeugen,
 *         Cookie setzen, in den Frontend redirecten.
 *
 * Faellt _nicht_ auf tour_manager.portal_users zurueck. Identitaet kommt aus
 * core.customers (per E-Mail inkl. Aliase via db.getCustomerByEmail). Fuer den
 * passwortbasierten Login bleibt portal-auth-bridge.js unveraendert zustaendig.
 */

const customerAuth = require("./customer-auth");

const TOKEN_TTL_MIN = Number(process.env.CUSTOMER_MAGIC_LINK_TTL_MIN || 15);

function buildEmailContent(email, link) {
  const subject = "Ihr Login-Link fuer Propus";
  const text = [
    "Hallo,",
    "",
    "klicken Sie auf den folgenden Link, um sich anzumelden:",
    link,
    "",
    `Der Link ist ${TOKEN_TTL_MIN} Minuten gueltig und kann nur einmal verwendet werden.`,
    "",
    "Falls Sie diesen Login nicht angefordert haben, koennen Sie diese E-Mail ignorieren.",
    "",
    "Freundliche Gruesse",
    "Ihr Propus Team",
  ].join("\n");
  const html = `
    <p>Hallo,</p>
    <p>klicken Sie auf den folgenden Link, um sich anzumelden:</p>
    <p>
      <a href="${link}" style="display:inline-block;padding:10px 20px;background:#8b7a3d;color:#fff;text-decoration:none;border-radius:6px;">
        Jetzt anmelden
      </a>
    </p>
    <p style="color:#888;font-size:13px;">
      Oder kopieren Sie diesen Link in Ihren Browser:<br>${link}
    </p>
    <p style="color:#888;font-size:13px;">
      Der Link ist ${TOKEN_TTL_MIN} Minuten gueltig und kann nur einmal verwendet werden.
    </p>
    <p style="color:#888;font-size:13px;">
      Falls Sie diesen Login nicht angefordert haben, koennen Sie diese E-Mail ignorieren.
    </p>
    <p>Freundliche Gruesse<br>Ihr Propus Team</p>
  `;
  return { subject, text, html };
}

/**
 * Erzeugt einen Single-Use-Login-Token fuer den Kunden mit der angegebenen
 * E-Mail und versendet einen Login-Link per Mail.
 *
 * @param {object} ctx
 * @param {object} ctx.db                 - booking/db Modul
 * @param {function} ctx.sendMail         - async (to, subject, html, text) => void
 * @param {string}  ctx.frontendBaseUrl   - z. B. "https://booking.propus.ch"
 * @param {string}  ctx.callbackPath      - z. B. "/api/customer/magic-link/callback"
 * @param {string}  email
 * @param {string|null} ip                - optional, fuer Audit
 * @returns {Promise<{ok: true, sent: boolean}>}  sent=false wenn kein Account existiert
 */
async function requestLoginLink(ctx, email, ip = null) {
  const norm = customerAuth.normalizeEmail(email);
  if (!norm) return { ok: true, sent: false };

  let customer = null;
  try {
    customer = await ctx.db.getCustomerByEmail(norm);
  } catch (_e) {
    customer = null;
  }
  if (!customer || customer.blocked) {
    // Bewusst kein Hinweis nach aussen (keine Account-Enumeration).
    return { ok: true, sent: false };
  }

  const rawToken = customerAuth.createSessionToken();
  const tokenHash = customerAuth.hashSha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MIN * 60 * 1000);

  await ctx.db.createCustomerLoginToken({
    customerId: Number(customer.id),
    tokenHash,
    expiresAt,
    purpose: "login",
    ip,
  });

  const base = String(ctx.frontendBaseUrl || "").replace(/\/+$/, "");
  const path = String(ctx.callbackPath || "").startsWith("/")
    ? ctx.callbackPath
    : `/${ctx.callbackPath || ""}`;
  const link = `${base}${path}?token=${encodeURIComponent(rawToken)}`;

  const { subject, html, text } = buildEmailContent(norm, link);
  try {
    await ctx.sendMail(norm, subject, html, text);
  } catch (err) {
    // Mail fehlgeschlagen: Token bleibt verbraucht-bar; aussen kein Detail.
    console.warn("[customer-magic-link] sendMail failed:", err?.message || err);
    return { ok: true, sent: false };
  }
  return { ok: true, sent: true };
}

/**
 * Verbraucht einen Magic-Link-Token und gibt die Customer-Row zurueck, falls
 * gueltig. Der Aufrufer muss anschliessend createCustomerSession + Cookie
 * aufrufen (das passiert in der Route, damit dort auch das HTTP-Response-Objekt
 * zur Verfuegung steht).
 *
 * @param {object} ctx       - { db }
 * @param {string} rawToken
 * @returns {Promise<{customer: object, purpose: string}|null>}
 */
async function consumeLoginToken(ctx, rawToken) {
  const t = String(rawToken || "").trim();
  if (!t) return null;
  const tokenHash = customerAuth.hashSha256Hex(t);
  const consumed = await ctx.db.consumeCustomerLoginToken(tokenHash);
  if (!consumed) return null;

  // Customer-Row fuer Session-Erzeugung holen.
  // Direkter SQL-Pfad noetig, weil getCustomerByEmail per E-Mail sucht; hier
  // haben wir die ID. Nutzt den gemeinsamen Pool ueber db.query.
  const { rows } = await ctx.db.query(
    "SELECT * FROM core.customers WHERE id = $1 LIMIT 1",
    [consumed.customerId]
  );
  const customer = rows[0];
  if (!customer || customer.blocked) return null;
  return { customer, purpose: consumed.purpose };
}

module.exports = {
  requestLoginLink,
  consumeLoginToken,
  TOKEN_TTL_MIN,
};
