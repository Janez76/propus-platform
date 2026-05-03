const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../lib/db');
const {
  acceptInvite,
  ensureAdminTeamSchema,
  getEnvAdminCredentials,
  getInviteByToken,
  touchAdminLastLogin,
  verifyDbAdminPassword,
} = require('../lib/admin-team');

const REMEMBER_COOKIE = 'propus_admin_remember';
let rememberSchemaReady = false;

function hashRememberToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function shouldUseSecureCookie(req) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
}

/**
 * Verhindert Open-Redirects: nur same-origin-relative Pfade akzeptieren.
 * Blockt insbesondere protokoll-relative Targets wie `//attacker.com/x`,
 * Backslash-Tricks (`/\\evil.com`) und absolute URLs.
 */
function safeReturnTo(returnTo, fallback = '/admin') {
  const raw = String(returnTo || '');
  if (!raw.startsWith('/')) return fallback;
  // protokoll-relativ (//host) oder normalisiert zu //host
  if (raw.startsWith('//') || raw.startsWith('/\\') || raw.startsWith('/%5C')) return fallback;
  // Whitelist: nur Pfad-Zeichen + ggf. Query/Fragment
  if (!/^\/[A-Za-z0-9_\-./?&=%#:,+]*$/.test(raw)) return fallback;
  return raw;
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
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_remember_tokens_hash
    ON tour_manager.admin_remember_tokens(token_hash)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_remember_tokens_email
    ON tour_manager.admin_remember_tokens(email)
  `);
  rememberSchemaReady = true;
}

// Login-Seite
// Wenn Logto-App-ID gesetzt → OIDC-Flow starten (Weiterleitung zu /auth/login)
const LOGTO_ENABLED = !!(
  process.env.PROPUS_TOURS_ADMIN_LOGTO_APP_ID &&
  process.env.PROPUS_TOURS_ADMIN_LOGTO_APP_SECRET
);

router.get('/login', (req, res) => {
  if (req.isPortalHost) {
    const nextPath =
      typeof req.query?.next === 'string' && req.query.next.startsWith('/')
        ? req.query.next
        : '/portal/dashboard';
    return res.redirect('/portal/login?next=' + encodeURIComponent(nextPath));
  }
  if (req.session && req.session.isAdmin) return res.redirect('/admin');

  // Logto aktiv → direkt zu OIDC-Login weiterleiten
  if (LOGTO_ENABLED) {
    const returnTo = safeReturnTo(req.query.returnTo, '/admin');
    return res.redirect('/auth/login?returnTo=' + encodeURIComponent(returnTo));
  }

  return res.redirect('/login');
});

// Login-Formular
router.post('/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;
  const emailNorm = (email || '').toLowerCase().trim();
  await ensureAdminTeamSchema().catch(() => null);
  const dbMatchEmail = await verifyDbAdminPassword(emailNorm, password).catch(() => null);
  const envMatch = getEnvAdminCredentials().find((c) => c.email === emailNorm && String(password || '') === c.password);
  const matchedEmail = dbMatchEmail || envMatch?.email || null;
  if (matchedEmail) {
    const keepSignedIn = rememberMe === '1' || rememberMe === 'on' || rememberMe === true || rememberMe === 'true';
    try {
      await ensureRememberSchema();
    } catch (e) {}
    return req.session.regenerate(async (regenErr) => {
      if (regenErr) return res.redirect('/login?auth_error=' + encodeURIComponent('Session konnte nicht erstellt werden.'));
      if (keepSignedIn) {
        // Persistente Session für "Angemeldet bleiben"
        req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;
        try {
          const token = crypto.randomBytes(32).toString('hex');
          const tokenHash = hashRememberToken(token);
          await pool.query(
            `INSERT INTO tour_manager.admin_remember_tokens (email, token_hash, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
            [matchedEmail, tokenHash]
          );
          res.cookie(REMEMBER_COOKIE, token, {
            httpOnly: true,
            secure: shouldUseSecureCookie(req),
            sameSite: 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/',
          });
        } catch (e) {}
      } else {
        // Session-Cookie (endet beim Browser-Schließen)
        req.session.cookie.expires = false;
        req.session.cookie.maxAge = null;
        res.clearCookie(REMEMBER_COOKIE, { path: '/' });
      }
      req.session.isAdmin = true;
      req.session.admin = { email: matchedEmail };
      req.session.adminEmail = matchedEmail;
      await touchAdminLastLogin(matchedEmail).catch(() => null);
      req.session.save(() => {
        return res.redirect(safeReturnTo(req.query.returnTo, '/admin'));
      });
    });
  }
  return res.redirect('/login?auth_error=' + encodeURIComponent('E-Mail oder Passwort falsch.'));
});

// JSON-API für Einladungslinks (React SPA)
router.get('/api/invite/check', async (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) return res.json({ ok: true, valid: false, error: 'Einladung fehlt.' });
  const { invite, error } = await getInviteByToken(token);
  if (!invite) return res.json({ ok: true, valid: false, error: error || 'Einladung ungültig oder abgelaufen.' });
  return res.json({ ok: true, valid: true, email: invite.email, expiresAt: invite.expiresAt || null });
});

router.post('/api/invite/accept', express.json(), async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  const passwordRepeat = String(req.body?.passwordRepeat || '');
  if (!token) return res.status(400).json({ ok: false, error: 'Token fehlt.' });
  const checked = await getInviteByToken(token);
  if (!checked.invite) return res.status(400).json({ ok: false, error: checked.error || 'Einladung ungültig.' });
  if (!password || password.length < 8) return res.status(400).json({ ok: false, error: 'Passwort muss mindestens 8 Zeichen haben.' });
  if (password !== passwordRepeat) return res.status(400).json({ ok: false, error: 'Passwörter stimmen nicht überein.' });
  const accepted = await acceptInvite(token, password);
  if (!accepted.ok) return res.status(400).json({ ok: false, error: accepted.error || 'Einladung konnte nicht angenommen werden.' });
  req.session.regenerate(async (regenErr) => {
    if (regenErr) return res.status(500).json({ ok: false, error: 'Session konnte nicht erstellt werden.' });
    req.session.isAdmin = true;
    req.session.admin = { email: accepted.email };
    req.session.adminEmail = accepted.email;
    await touchAdminLastLogin(accepted.email).catch(() => null);
    req.session.save(() => res.json({ ok: true }));
  });
});

router.get('/accept-invite', (req, res) => {
  const token = String(req.query.token || '').trim();
  return res.redirect(`/accept-invite${token ? '?token=' + encodeURIComponent(token) : ''}`);
});

router.post('/accept-invite', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  const passwordRepeat = String(req.body?.passwordRepeat || '');
  const errRedirect = (msg) => res.redirect(`/accept-invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent(msg)}`);
  if (!token) return errRedirect('Einladung fehlt.');
  const checked = await getInviteByToken(token);
  if (!checked.invite) return errRedirect(checked.error || 'Einladung ist ungültig.');
  if (!password || password.length < 8) return errRedirect('Passwort muss mindestens 8 Zeichen haben.');
  if (password !== passwordRepeat) return errRedirect('Passwörter stimmen nicht überein.');
  const accepted = await acceptInvite(token, password);
  if (!accepted.ok) return errRedirect(accepted.error || 'Einladung konnte nicht angenommen werden.');
  return req.session.regenerate(async (regenErr) => {
    if (regenErr) return errRedirect('Session konnte nicht erstellt werden.');
    req.session.isAdmin = true;
    req.session.admin = { email: accepted.email };
    req.session.adminEmail = accepted.email;
    await touchAdminLastLogin(accepted.email).catch(() => null);
    req.session.save(() => res.redirect('/admin/team?accepted=1'));
  });
});

// Logout (Legacy + Logto)
router.post('/logout', async (req, res) => {
  const cookieHeader = String(req.headers.cookie || '');
  const match = cookieHeader.match(new RegExp(`${REMEMBER_COOKIE}=([^;]+)`));
  const rawToken = match?.[1] ? decodeURIComponent(match[1]) : null;
  if (rawToken) {
    const tokenHash = hashRememberToken(rawToken);
    await pool.query(
      `UPDATE tour_manager.admin_remember_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1`,
      [tokenHash]
    ).catch(() => null);
  }
  res.clearCookie(REMEMBER_COOKIE, { path: '/' });

  // Wenn Logto-Session: End-Session beim Logto-Server aufrufen
  const idToken = req.session?.logtoTokens?.idToken;
  const isLogtoSession = req.session?.isLogtoAuth;

  req.session.destroy(() => {
    if (isLogtoSession && idToken && LOGTO_ENABLED) {
      const logtoEndpoint = process.env.LOGTO_ENDPOINT || 'http://localhost:3301';
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const params = new URLSearchParams({
        id_token_hint: idToken,
        post_logout_redirect_uri: `${baseUrl}/login`,
      });
      return res.redirect(`${logtoEndpoint}/oidc/session/end?${params}`);
    }
    res.redirect('/login');
  });
});

module.exports = router;
