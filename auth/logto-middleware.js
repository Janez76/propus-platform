/**
 * Logto OIDC Auth Middleware – Zentraler Auth-Layer für alle Module.
 *
 * Verhalten:
 *   - Wenn LOGTO_APP_ID + LOGTO_APP_SECRET gesetzt → OIDC Login über Logto
 *   - Sonst → Fallback auf bestehende Session-/Passwort-Auth (Legacy-Modus)
 *
 * Nutzung in Express:
 *   const { createLogtoAuth } = require('../../auth/logto-middleware');
 *   const logtoAuth = createLogtoAuth({ prefix: 'BOOKING', callbackPath: '/auth/callback' });
 *   app.use(logtoAuth.routes());        // /auth/login, /auth/callback, /auth/logout
 *   app.use(logtoAuth.requireAuth());   // Schutz-Middleware
 */

const crypto = require('crypto');

function createLogtoAuth(options = {}) {
  const {
    prefix = 'BOOKING',
    callbackPath = '/auth/callback',
    logoutRedirect = '/',
    loginPath = '/auth/login',
    logoutPath = '/auth/logout',
  } = options;

  const appId = process.env[`${prefix}_LOGTO_APP_ID`] || '';
  const appSecret = process.env[`${prefix}_LOGTO_APP_SECRET`] || '';
  const logtoEndpoint = process.env.LOGTO_ENDPOINT || 'http://localhost:3301';
  const logtoInternalEndpoint = process.env.LOGTO_INTERNAL_ENDPOINT || logtoEndpoint;
  const enabled = !!(appId && appSecret);

  let oidcConfig = null;

  async function fetchOidcConfig() {
    if (oidcConfig) return oidcConfig;
    try {
      const res = await fetch(`${logtoInternalEndpoint}/oidc/.well-known/openid-configuration`);
      oidcConfig = await res.json();
      return oidcConfig;
    } catch (err) {
      console.error('[logto-auth] OIDC discovery failed:', err.message);
      return null;
    }
  }

  function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('base64url');
  }

  function generateCodeChallenge(verifier) {
    return crypto.createHash('sha256').update(verifier).digest('base64url');
  }

  function routes() {
    const { Router } = require('express');
    const router = Router();

    if (!enabled) return router;

    router.get(loginPath, async (req, res) => {
      const config = await fetchOidcConfig();
      if (!config) return res.status(503).send('Auth service unavailable');

      const state = crypto.randomBytes(16).toString('hex');
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      req.session.oidcState = state;
      req.session.oidcCodeVerifier = codeVerifier;
      req.session.oidcReturnTo = req.query.returnTo || '/';

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const mountPrefix = req.baseUrl || '';
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: `${baseUrl}${mountPrefix}${callbackPath}`,
        response_type: 'code',
        scope: 'openid profile email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      res.redirect(`${logtoEndpoint}/oidc/auth?${params}`);
    });

    router.get(callbackPath, async (req, res) => {
      const { code, state } = req.query;

      if (!code || state !== req.session.oidcState) {
        return res.status(400).send('Invalid auth callback');
      }

      const config = await fetchOidcConfig();
      if (!config) return res.status(503).send('Auth service unavailable');

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const mountPrefix = req.baseUrl || '';
      const tokenRes = await fetch(config.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: appId,
          client_secret: appSecret,
          redirect_uri: `${baseUrl}${mountPrefix}${callbackPath}`,
          code_verifier: req.session.oidcCodeVerifier || '',
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('[logto-auth] Token exchange failed:', err);
        return res.status(500).send('Auth failed');
      }

      const tokens = await tokenRes.json();

      const userInfoRes = await fetch(config.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = userInfoRes.ok ? await userInfoRes.json() : {};

      req.session.logtoUser = {
        sub: userInfo.sub,
        email: userInfo.email,
        name: userInfo.name || userInfo.username || userInfo.email,
        picture: userInfo.picture,
        emailVerified: userInfo.email_verified,
      };
      req.session.logtoTokens = {
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      };
      req.session.isLogtoAuth = true;
      req.session.isAdmin = true;

      const returnTo = req.session.oidcReturnTo || '/';
      delete req.session.oidcState;
      delete req.session.oidcCodeVerifier;
      delete req.session.oidcReturnTo;

      req.session.save(() => res.redirect(returnTo));
    });

    router.get(logoutPath, async (req, res) => {
      const idToken = req.session.logtoTokens?.idToken;
      req.session.destroy(() => {
        if (idToken) {
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          const mountPrefix = req.baseUrl || '';
          const params = new URLSearchParams({
            id_token_hint: idToken,
            post_logout_redirect_uri: `${baseUrl}${mountPrefix}${logoutRedirect}`,
          });
          res.redirect(`${logtoEndpoint}/oidc/session/end?${params}`);
        } else {
          res.redirect(logoutRedirect);
        }
      });
    });

    return router;
  }

  function requireAuth(opts = {}) {
    const { redirectTo } = opts;
    return (req, res, next) => {
      if (!enabled) return next();

      if (req.session?.isLogtoAuth && req.session?.logtoUser) {
        req.user = req.session.logtoUser;
        return next();
      }

      if (redirectTo) {
        const returnTo = req.originalUrl;
        return res.redirect(`${redirectTo}?returnTo=${encodeURIComponent(returnTo)}`);
      }
      return res.status(401).json({ error: 'Not authenticated' });
    };
  }

  function getUser(req) {
    if (req.session?.logtoUser) return req.session.logtoUser;
    return null;
  }

  return {
    enabled,
    routes,
    requireAuth,
    getUser,
    appId,
    logtoEndpoint,
  };
}

module.exports = { createLogtoAuth };
