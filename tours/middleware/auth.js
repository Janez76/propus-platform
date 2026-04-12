/**
 * Session-basierte Admin-Authentifizierung.
 * Prüft ADMIN_EMAIL / ADMIN_PASSWORD aus .env.
 */
const crypto = require('crypto');
const { pool } = require('../lib/db');
const REMEMBER_COOKIE = 'propus_admin_remember';
const TOURS_SESSION_COOKIE = 'propus_tours.sid';
const TOURS_MOUNT_PATH = String(process.env.TOURS_MOUNT_PATH || '').replace(/\/$/, '');
const TOURS_SESSION_PATH =
  process.env.PROPUS_PLATFORM_MERGED === '1' ? '/' : (TOURS_MOUNT_PATH || '/');
let rememberSchemaReady = false;

function hashRememberToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
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

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  tryRememberLogin(req).then((ok) => {
    if (ok) return req.session.save(() => next());
    clearAdminAuthCookies(res);
    res.set('x-auth-error', 'invalid-admin-session');
    console.warn('[tours-auth] admin session invalid', getAuthRequestMeta(req));
    return res.status(401).json({
      error: 'Session ungültig oder abgelaufen. Bitte neu anmelden.',
      authError: 'invalid_admin_session',
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
  if (req.session && req.session.isAdmin) return next();
  tryRememberLogin(req).then((ok) => {
    if (ok) return req.session.save(() => next());
    const returnTo = req.originalUrl || '/admin';
    clearAdminAuthCookies(res);
    res.set('x-auth-error', 'invalid-admin-session');
    console.warn('[tours-auth] redirect to login due to invalid session', getAuthRequestMeta(req));
    return res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
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
};
