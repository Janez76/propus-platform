/**
 * Session-basierte Admin-Authentifizierung.
 * Prüft ADMIN_EMAIL / ADMIN_PASSWORD aus .env.
 */
const crypto = require('crypto');
const { pool } = require('../lib/db');
const REMEMBER_COOKIE = 'propus_admin_remember';
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
  return m?.[1] ? decodeURIComponent(m[1]) : null;
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
    return res.status(403).json({ error: 'Nicht autorisiert' });
  }).catch(() => res.status(403).json({ error: 'Nicht autorisiert' }));
}

function requireAdminOrRedirect(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  tryRememberLogin(req).then((ok) => {
    if (ok) return req.session.save(() => next());
    const returnTo = req.originalUrl || '/admin';
    return res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }).catch(() => {
    const returnTo = req.originalUrl || '/admin';
    res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  });
}

module.exports = {
  requireAdmin,
  requireAdminOrRedirect,
};
