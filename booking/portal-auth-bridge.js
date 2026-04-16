"use strict";
/**
 * portal-auth-bridge.js
 *
 * Brücke zwischen dem Booking-Backend und dem Tours-Portal-Auth-System.
 * Ermöglicht dem Booking-Server, Portal-Kunden-Credentials zu validieren,
 * ohne eine direkte Abhängigkeit auf bcryptjs zu benötigen.
 *
 * Lädt tours/lib/portal-auth und tours/lib/db dynamisch (funktioniert nur
 * in der Platform-Umgebung, wo beide Pakete verfügbar sind).
 * Im Standalone-Betrieb des Booking-Servers werden alle Funktionen mit null/
 * Standardwert zurückgegeben.
 */

const path = require("path");

let _portalAuth = null;
let _toursPool = null;
let _bridgeAvailable = false;

try {
  _portalAuth = require(path.join(__dirname, "../tours/lib/portal-auth"));
  const { pool } = require(path.join(__dirname, "../tours/lib/db"));
  _toursPool = pool;
  _bridgeAvailable = true;
} catch (_e) {
  // Standalone-Booking ohne Tours-Modul – Portal-Login nicht verfügbar
}

/**
 * Validiert E-Mail + Passwort eines Portal-Kunden.
 * @returns {Promise<string|null>} normalisierte E-Mail bei Erfolg, sonst null
 */
async function verifyPortalCustomerPassword(email, password) {
  if (!_portalAuth || !email || !password) return null;
  return _portalAuth.verifyDbPortalPassword(email, password).catch(() => null);
}

/**
 * Ermittelt die Rolle eines Portal-Kunden.
 * Prüfreihenfolge:
 *   1. Globaler Tour-Manager  → "tour_manager"
 *   2. Team-Admin/Inhaber     → "customer_admin"
 *   3. Tour-Besitzer          → "customer_admin"
 *   4. Fallback               → "customer_user"
 *
 * @param {string} email normalisierte E-Mail-Adresse
 * @returns {Promise<string>}
 */
async function getPortalCustomerRole(email) {
  if (!_toursPool || !email) return "customer_user";
  const norm = String(email).toLowerCase().trim();
  try {
    // 1. Globaler Tour-Manager (portal_staff_roles)
    const tmResult = await _toursPool.query(
      `SELECT 1 FROM tour_manager.portal_staff_roles
       WHERE email_norm = $1 AND role = 'tour_manager' LIMIT 1`,
      [norm]
    );
    if (tmResult.rowCount > 0) return "tour_manager";
  } catch (_e) { /* Tabelle noch nicht vorhanden */ }

  try {
    // 2. Team-Inhaber oder Admin in einem Portal-Workspace
    const adminResult = await _toursPool.query(
      `SELECT 1 FROM tour_manager.portal_team_members
       WHERE (LOWER(TRIM(owner_email)) = $1
              OR (LOWER(TRIM(member_email)) = $1 AND role IN ('inhaber', 'admin')))
         AND status = 'active'
       LIMIT 1`,
      [norm]
    );
    if (adminResult.rowCount > 0) return "customer_admin";
  } catch (_e) { /* Tabelle noch nicht vorhanden */ }

  try {
    // 3. Direkter Tour-Besitzer (customer_email auf Tour)
    const tourResult = await _toursPool.query(
      `SELECT 1 FROM tour_manager.tours
       WHERE LOWER(TRIM(customer_email)) = $1 LIMIT 1`,
      [norm]
    );
    if (tourResult.rowCount > 0) return "customer_admin";
  } catch (_e) { /* Tabelle noch nicht vorhanden */ }

  return "customer_user";
}

module.exports = {
  verifyPortalCustomerPassword,
  getPortalCustomerRole,
  isBridgeAvailable: () => _bridgeAvailable,
};
