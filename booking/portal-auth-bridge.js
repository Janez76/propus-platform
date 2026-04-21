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

const portalAuth = require('../tours/lib/portal-auth');
const portalTeam = require('../tours/lib/portal-team');
const { pool } = require('../tours/lib/db');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Verifiziert E-Mail + Passwort gegen tour_manager.portal_users (bcrypt).
 * @returns {Promise<string|null>} Normalisierte E-Mail bei Erfolg, sonst null.
 */
async function verifyPortalCustomerPassword(email, password) {
  return portalAuth.verifyDbPortalPassword(email, password);
}

/**
 * Bestimmt die Session-Rolle anhand der Portal-Team-Mitgliedschaft.
 *
 * Priorität:
 * 1. Globaler Tour-Manager (portal_staff_roles) → 'tour_manager'
 * 2. Team-Admin oder Inhaber (portal_team_members.role = 'admin'/'inhaber') → 'customer_admin'
 * 3. Direkte Touren-Zuordnung als Firmen-E-Mail → 'customer_admin'
 * 4. Sonstiger Portal-Benutzer → 'customer_user'
 *
 * WICHTIG: 'customer_admin' bedeutet Admin der eigenen Firma,
 *          NICHT Admin der Propus-Plattform.
 *
 * @param {string} email - Normalisierte E-Mail des Portal-Benutzers
 * @returns {Promise<'tour_manager'|'customer_admin'|'customer_user'>}
 */
async function getPortalCustomerRole(email) {
  const norm = normalizeEmail(email);
  if (!norm) return 'customer_user';

  try {
    const isTourMgr = await portalTeam.isGlobalTourManager(norm);
    if (isTourMgr) return 'tour_manager';
  } catch (_e) {
    // Tabelle noch nicht migriert – überspringen
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
    // Tabelle noch nicht vorhanden
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
