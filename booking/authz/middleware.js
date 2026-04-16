/**
 * Auth-Context-Helfer fuer Audit-Logging.
 * Extrahiert Benutzer-/Rollen-Informationen aus dem Request-Objekt.
 */

function buildAuthContext(req) {
  const user = req.user || {};
  return {
    userId: user.id || user.sub || null,
    email: user.email || null,
    role: user.role || null,
  };
}

module.exports = { buildAuthContext };
