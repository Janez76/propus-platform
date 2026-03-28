/**
 * Auth-Context-Helfer fuer Audit-Logging.
 * Extrahiert Benutzer-/Rollen-Informationen aus dem Request-Objekt,
 * unabhaengig davon ob der Aufrufer ein Admin, Fotograf oder Company-Member ist.
 */

function buildAuthContext(req) {
  const user = req.user || {};
  return {
    userId: user.id || user.sub || null,
    email: user.email || null,
    role: user.role || null,
    companyRole: req.companyMembership?.role || null,
    companyId: req.companyId || null,
  };
}

module.exports = { buildAuthContext };
