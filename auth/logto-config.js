/**
 * Logto OIDC Konfiguration – Wird von beiden Modulen (booking + tours) importiert.
 *
 * Logto stellt folgende Endpunkte bereit:
 *   - Authorization: ${LOGTO_ENDPOINT}/oidc/auth
 *   - Token:         ${LOGTO_ENDPOINT}/oidc/token
 *   - UserInfo:      ${LOGTO_ENDPOINT}/oidc/me
 *   - JWKS:          ${LOGTO_ENDPOINT}/oidc/jwks
 *   - Discovery:     ${LOGTO_ENDPOINT}/oidc/.well-known/openid-configuration
 *
 * Jedes Modul registriert eine eigene Application in der Logto Admin Console
 * und erhält eine eigene APP_ID + APP_SECRET.
 */

const LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT || 'http://localhost:3301';

function getLogtoConfig(modulePrefix) {
  return {
    endpoint: LOGTO_ENDPOINT,
    appId: process.env[`${modulePrefix}_LOGTO_APP_ID`] || '',
    appSecret: process.env[`${modulePrefix}_LOGTO_APP_SECRET`] || '',
    scopes: ['openid', 'profile', 'email'],
    discoveryUrl: `${LOGTO_ENDPOINT}/oidc/.well-known/openid-configuration`,
  };
}

function isLogtoEnabled(modulePrefix) {
  return !!(process.env[`${modulePrefix}_LOGTO_APP_ID`] && process.env[`${modulePrefix}_LOGTO_APP_SECRET`]);
}

module.exports = { getLogtoConfig, isLogtoEnabled, LOGTO_ENDPOINT };
