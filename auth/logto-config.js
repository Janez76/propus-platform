/**
 * Logto OIDC Konfiguration – No-Op Shim
 *
 * Logto wurde aus der Plattform entfernt.
 * `isLogtoEnabled` gibt immer false zurück.
 */

function getLogtoConfig() {
  return {
    endpoint: '',
    appId: '',
    appSecret: '',
    scopes: [],
    discoveryUrl: '',
  };
}

function isLogtoEnabled() {
  return false;
}

module.exports = { getLogtoConfig, isLogtoEnabled, LOGTO_ENDPOINT: '' };
