'use strict';

/**
 * Adapter-Modul: verbindet booking/server.js mit der Portal-Auth-Schicht
 * (tours/lib/portal-auth.js + tours/lib/portal-team.js).
 *
 * Ermöglicht den Unified-Login-Fallback in POST /auth/login:
 * Wenn ein Benutzer kein internes Admin-Konto hat, wird hier gegen
 * tour_manager.portal_users (bcrypt) geprüft und die korrekte
 * Kunden-Rolle bestimmt.
 *
 * SCOPE-GARANTIE: Alle zurückgegebenen Rollen (customer_admin, customer_user)
 * sind strikt auf den Kunden-Scope begrenzt – KEINE internen Propus-Rechte.
 */

const { pool } = require('../tours/lib/db');

let _bcrypt;
function getBcrypt() {
  if (!_bcrypt) {
    try { _bcrypt = require('bcryptjs'); } catch (_e) {
      _bcrypt = require('../tours/node_modules/bcryptjs');
    }
  }
  return _bcrypt;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Verifiziert E-Mail + Passwort direkt gegen tour_manager.portal_users (bcrypt).
 *
 * Direkter DB-Zugriff statt Delegation an portalAuth.verifyDbPortalPassword,
 * um den pre-existierenden Bug 'getBookingPortalSync is not defined' in
 * tours/lib/portal-team.js zu umgehen (tritt auf wenn lookupPortalIdentity
 * isGlobalTourManager aufruft).
 *
 * @returns {Promise<string|null>} Normalisierte E-Mail bei Erfolg, sonst null.
 */
async function verifyPortalCustomerPassword(email, password) {
  const norm = normalizeEmail(email);
  if (!norm || !password) return null;
  try {
    const r = await pool.query(
      `SELECT email, password_hash, is_active
       FROM tour_manager.portal_users
       WHERE LOWER(email) = $1 LIMIT 1`,
      [norm]
    );
    const user = r.rows[0];
    if (!user || !user.is_active || !user.password_hash) return null;
    const ok = await getBcrypt().compare(String(password), user.password_hash);
    return ok ? String(user.email).toLowerCase().trim() : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Bestimmt die Session-Rolle anhand der Portal-Team-Mitgliedschaft.
 *
 * Priorität:
 * 1. Globaler Tour-Manager (portal_staff_roles, direkte DB-Abfrage) → 'tour_manager'
 * 2. Team-Admin oder Inhaber (portal_team_members.role = 'admin'/'inhaber') → 'customer_admin'
 * 3. Direkte Touren-Zuordnung als Firmen-E-Mail → 'customer_admin'
 * 4. Sonstiger Portal-Benutzer → 'customer_user'
 *
 * WICHTIG: 'customer_admin' bedeutet Admin der eigenen Firma,
 *          NICHT Admin der Propus-Plattform.
 *
 * Hinweis: Direkter DB-Zugriff statt portalTeam.isGlobalTourManager, um den
 * Bug 'getBookingPortalSync is not defined' zu umgehen.
 *
 * @param {string} email - Normalisierte E-Mail des Portal-Benutzers
 * @returns {Promise<'tour_manager'|'customer_admin'|'customer_user'>}
 */
async function getPortalCustomerRole(email) {
  const norm = normalizeEmail(email);
  if (!norm) return 'customer_user';

  try {
    const staffR = await pool.query(
      `SELECT 1 FROM tour_manager.portal_staff_roles
       WHERE email_norm = $1 AND role = 'tour_manager' LIMIT 1`,
      [norm]
    );
    if (staffR.rows[0]) return 'tour_manager';
  } catch (_e) {
    // Tabelle nicht vorhanden
  }

  try {
    const teamAdmin = await pool.query(
      `SELECT 1 FROM tour_manager.portal_team_members
       WHERE LOWER(TRIM(member_email)) = $1
         AND role IN ('inhaber','admin')
         AND status = 'active'
       LIMIT 1`,
      [norm]
    );
    if (teamAdmin.rows[0]) return 'customer_admin';
  } catch (_e) {
    // Tabelle nicht vorhanden
  }

  try {
    const isTourOwner = await pool.query(
      `SELECT 1 FROM tour_manager.tours
       WHERE LOWER(TRIM(customer_email)) = $1 LIMIT 1`,
      [norm]
    );
    if (isTourOwner.rows[0]) return 'customer_admin';
  } catch (_e) {
    // Tabelle nicht vorhanden
  }

  return 'customer_user';
}

module.exports = { verifyPortalCustomerPassword, getPortalCustomerRole };
