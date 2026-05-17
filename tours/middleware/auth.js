/**
 * Session- und Bearer-Token-basierte Admin-Authentifizierung.
 *
 * Drei Pfade:
 *  1. Bearer `ppk_live_<token>` im Authorization-Header (PRO-73) — gleicher
 *     API-Key-Mechanismus wie in booking/server.js (`core.api_keys`).
 *     Setzt `req.user` + `req.apiKeyId`, mutiert die Session NICHT.
 *  2. Aktive Session (`req.session.isAdmin = true`) aus dem Login-Flow.
 *  3. Remember-Cookie `propus_admin_remember` — Auto-Login bei abgelaufener
 *     Browser-Session.
 *
 * Cookies werden NICHT als API-Key-Quelle akzeptiert (Source-Check), damit
 * ein verlorener Cookie keine Backend-Zugriffsrechte oeffnet.
 */
const crypto = require('crypto');
const { pool } = require('../lib/db');
const REMEMBER_COOKIE = 'propus_admin_remember';
const TOURS_SESSION_COOKIE = 'propus_tours.sid';
const TOURS_MOUNT_PATH = String(process.env.TOURS_MOUNT_PATH || '').replace(/\/$/, '');
const TOURS_SESSION_PATH =
  process.env.PROPUS_PLATFORM_MERGED === '1' ? '/' : (TOURS_MOUNT_PATH || '/');
let rememberSchemaReady = false;

function hashSha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function hashRememberToken(token) {
  return hashSha256Hex(token);
}

async function ensureRememberSchema() {
  if (rememberSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tour_manager.admin_remember_tokens (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ NULL
    )
  `);
  rememberSchemaReady = true;
}

function readCookie(req, key) {
  const cookieHeader = String(req.headers.cookie || '');
  const re = new RegExp(`${key}=([^;]+)`);
  const m = cookieHeader.match(re);
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

function clearAdminAuthCookies(res) {
  const clearPaths = new Set(['/']);
  if (TOURS_SESSION_PATH) clearPaths.add(TOURS_SESSION_PATH);

  for (const p of clearPaths) {
    res.clearCookie(TOURS_SESSION_COOKIE, { path: p });
    res.clearCookie(REMEMBER_COOKIE, { path: p });
  }
}

function getAuthRequestMeta(req) {
  const forwardedFor = String(req?.headers?.['x-forwarded-for'] || '').trim();
  return {
    method: req?.method,
    path: req?.originalUrl || req?.url,
    host: req?.headers?.host,
    cfRay: req?.headers?.['cf-ray'] || null,
    sourceIp: req?.ip || (forwardedFor ? forwardedFor.split(',')[0].trim() : null),
  };
}

async function tryRememberLogin(req) {
  const token = readCookie(req, REMEMBER_COOKIE);
  if (!token) return false;
  try {
    await ensureRememberSchema();
  } catch (e) {
    return false;
  }
  const tokenHash = hashRememberToken(token);
  const row = await pool.query(
    `SELECT email
     FROM tour_manager.admin_remember_tokens
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  ).then((r) => r.rows[0] || null).catch(() => null);
  if (!row?.email) return false;
  req.session.isAdmin = true;
  req.session.admin = { email: row.email };
  req.session.adminEmail = row.email;
  return true;
}

/**
 * Bearer-Token-Pfad (PRO-73).
 *
 * Liest `Authorization: Bearer ppk_live_<token>` aus dem Header (NICHT aus
 * dem Cookie — API-Keys duerfen nie via Cookie-Vector ankommen). Bei einem
 * Treffer in `core.api_keys` mit aktivem `created_by`-Admin werden
 * `req.user` + `req.apiKeyId` gesetzt; die Session bleibt unberuehrt.
 *
 * Spaeter: Scopes (z.B. tours:read/write). Aktuell: pauschal Admin-Rolle
 * fuer alle Keys (matched Booking-Verhalten).
 */
async function tryBearerApiKey(req) {
  const auth = String(req.headers?.authorization || '');
  const m = auth.match(/^Bearer\s+(\S+)$/i);
  if (!m) return false;
  const token = m[1].trim();
  if (!token || !token.startsWith('ppk_live_')) return false;

  const tokenHash = hashSha256Hex(token);
  const apiKeyRow = await pool.query(
    `SELECT id, label, created_by AS "createdBy"
     FROM core.api_keys
     WHERE token_hash = $1
       AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [tokenHash]
  ).then((r) => r.rows[0] || null).catch(() => null);
  if (!apiKeyRow?.createdBy) return false;

  const adminRow = await pool.query(
    `SELECT id, email, name, role, active
     FROM admin_users
     WHERE id = $1
     LIMIT 1`,
    [apiKeyRow.createdBy]
  ).then((r) => r.rows[0] || null).catch(() => null);
  if (!adminRow?.active) return false;

  req.user = {
    id: String(adminRow.id),
    userKey: String(adminRow.id),
    email: adminRow.email || '',
    name: adminRow.name || adminRow.email || '',
    role: String(adminRow.role || 'admin'),
  };
  req.apiKeyId = apiKeyRow.id;
  req.apiKeyLabel = apiKeyRow.label;

  // Fire-and-forget last_used_at touch (matched Booking-Pattern).
  pool.query(`UPDATE core.api_keys SET last_used_at = NOW() WHERE id = $1`, [apiKeyRow.id])
    .catch(() => {});

  console.log('[tours-auth] api-key accepted', {
    apiKeyId: apiKeyRow.id,
    apiKeyLabel: apiKeyRow.label,
    adminEmail: adminRow.email,
    ...getAuthRequestMeta(req),
  });
  return true;
}

/** Liefert true wenn die Request ein authentifizierter Admin ist — egal ob via Session oder API-Key. */
function isAuthenticatedAdmin(req) {
  if (req.user && req.user.role === 'admin') return true;
  if (req.session && req.session.isAdmin) return true;
  return false;
}

function requireAdmin(req, res, next) {
  if (isAuthenticatedAdmin(req)) return next();
  tryBearerApiKey(req).then((apiOk) => {
    if (apiOk) return next();
    return tryRememberLogin(req).then((ok) => {
      if (ok) return req.session.save(() => next());
      clearAdminAuthCookies(res);
      res.set('x-auth-error', 'invalid-admin-session');
      console.warn('[tours-auth] admin session invalid', getAuthRequestMeta(req));
      return res.status(401).json({
        error: 'Session ungültig oder abgelaufen. Bitte neu anmelden.',
        authError: 'invalid_admin_session',
      });
    });
  }).catch(() => {
    clearAdminAuthCookies(res);
    res.set('x-auth-error', 'admin-session-check-failed');
    console.warn('[tours-auth] admin session check failed', getAuthRequestMeta(req));
    return res.status(401).json({
      error: 'Sessionprüfung fehlgeschlagen. Bitte neu anmelden.',
      authError: 'admin_session_check_failed',
    });
  });
}

function requireAdminOrRedirect(req, res, next) {
  if (isAuthenticatedAdmin(req)) return next();
  // Browser-Pfad: Bearer macht hier wenig Sinn, aber wir pruefen ihn trotzdem
  // damit zB Cowork-Scripts auch HTML-Routen aufrufen koennen.
  tryBearerApiKey(req).then((apiOk) => {
    if (apiOk) return next();
    return tryRememberLogin(req).then((ok) => {
      if (ok) return req.session.save(() => next());
      const returnTo = req.originalUrl || '/admin';
      clearAdminAuthCookies(res);
      res.set('x-auth-error', 'invalid-admin-session');
      console.warn('[tours-auth] redirect to login due to invalid session', getAuthRequestMeta(req));
      return res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    });
  }).catch(() => {
    const returnTo = req.originalUrl || '/admin';
    clearAdminAuthCookies(res);
    res.set('x-auth-error', 'admin-session-check-failed');
    console.warn('[tours-auth] redirect to login due to auth check failure', getAuthRequestMeta(req));
    res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  });
}

module.exports = {
  requireAdmin,
  requireAdminOrRedirect,
  // Exports fuer Tests
  __test__: {
    tryBearerApiKey,
    isAuthenticatedAdmin,
    hashSha256Hex,
  },
};
