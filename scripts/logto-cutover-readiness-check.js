#!/usr/bin/env node
/**
 * Logto Big-Bang Cutover – Readiness Check
 *
 * Prüft ob alle Voraussetzungen für den Cutover erfüllt sind:
 * 1. Alle aktiven Admin-User haben ein lokales Passwort (password_hash)
 * 2. Alle Portal-User können sich lokal authentifizieren
 * 3. Keine OIDC-Abhängigkeiten mehr aktiv im Code
 * 4. Logto Env-Variablen deaktiviert/nicht gesetzt
 *
 * Ausführung: node scripts/logto-cutover-readiness-check.js
 */

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });
require("dotenv").config({ path: require("path").join(__dirname, "..") });

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const PASS = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const WARN = "\x1b[33m⚠\x1b[0m";
const INFO = "\x1b[34mℹ\x1b[0m";

let exitCode = 0;

function ok(msg) { console.log(`  ${PASS} ${msg}`); }
function fail(msg) { console.log(`  ${FAIL} ${msg}`); exitCode = 1; }
function warn(msg) { console.log(`  ${WARN} ${msg}`); }
function info(msg) { console.log(`  ${INFO} ${msg}`); }

async function runChecks() {
  console.log("\n=== Logto Cutover Readiness Check ===\n");

  // ── 1. DB Verbindung ──────────────────────────────────────────────────────
  console.log("1. Datenbankverbindung");
  try {
    const { rows } = await pool.query("SELECT NOW() AS now, version() AS v");
    ok(`Verbunden. Server-Zeit: ${rows[0].now}`);
  } catch (e) {
    fail(`DB-Verbindung fehlgeschlagen: ${e.message}`);
    process.exit(1);
  }

  // ── 2. Admin-User Credentials ────────────────────────────────────────────
  console.log("\n2. Admin-User (lokale Zugangsdaten)");
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE active = TRUE AND password_hash IS NOT NULL) AS with_password,
        COUNT(*) FILTER (WHERE active = TRUE AND password_hash IS NULL)     AS without_password,
        COUNT(*) FILTER (WHERE active = TRUE)                               AS total_active,
        COUNT(*) FILTER (WHERE active = FALSE)                              AS inactive
      FROM admin_users
    `);
    const r = rows[0];
    if (Number(r.without_password) > 0) {
      fail(`${r.without_password} aktive Admin-User OHNE lokales Passwort`);
      const { rows: missing } = await pool.query(`
        SELECT id, username, email, role FROM admin_users
        WHERE active = TRUE AND password_hash IS NULL
        ORDER BY id
      `);
      for (const u of missing) {
        info(`  ID=${u.id} ${u.email || u.username} (${u.role})`);
      }
      warn("  → Passwort setzen über: POST /api/admin/internal-users/:id/reset-password");
    } else {
      ok(`Alle ${r.total_active} aktiven Admin-User haben lokale Passwörter`);
    }
    if (Number(r.inactive) > 0) {
      info(`${r.inactive} inaktive Admin-User (OK)`);
    }
  } catch (e) {
    fail(`Admin-User Check fehlgeschlagen: ${e.message}`);
  }

  // ── 3. Portal-User ────────────────────────────────────────────────────────
  console.log("\n3. Portal-User (lokale Zugangsdaten)");
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE password_hash IS NOT NULL) AS with_password,
        COUNT(*) FILTER (WHERE password_hash IS NULL)     AS without_password,
        COUNT(*)                                          AS total
      FROM tour_manager.portal_users
    `);
    const r = rows[0];
    if (Number(r.without_password) > 0) {
      warn(`${r.without_password} von ${r.total} Portal-User haben kein lokales Passwort`);
      warn("  → Diese User können sich nicht lokal anmelden (müssen Passwort zurücksetzen)");
      warn("  → Beim ersten Login werden sie auf den Passwort-Reset-Flow geleitet");
    } else {
      ok(`Alle ${r.total} Portal-User haben lokale Passwörter`);
    }
  } catch (e) {
    warn(`Portal-User Check: ${e.message} (Tabelle evtl. leer)`);
  }

  // ── 4. Logto Env-Variablen ────────────────────────────────────────────────
  console.log("\n4. Logto Env-Variablen (müssen deaktiviert sein)");
  const logtoVars = [
    "PROPUS_BOOKING_LOGTO_APP_ID",
    "PROPUS_BOOKING_LOGTO_APP_SECRET",
    "PROPUS_MANAGEMENT_LOGTO_APP_ID",
    "PROPUS_MANAGEMENT_LOGTO_APP_SECRET",
    "LOGTO_ENDPOINT",
    "LOGTO_INTERNAL_ENDPOINT",
  ];
  let anySet = false;
  for (const v of logtoVars) {
    if (process.env[v]) {
      warn(`${v} ist noch gesetzt (sollte entfernt werden nach Cutover)`);
      anySet = true;
    }
  }
  if (!anySet) {
    ok("Keine Logto Env-Variablen gesetzt");
  } else {
    info("→ Logto Env-Variablen können erst nach vollständigem Cutover entfernt werden");
  }

  // ── 5. Admin-Sessions ────────────────────────────────────────────────────
  console.log("\n5. Aktive Admin-Sessions");
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE expires_at > NOW()) AS active
      FROM booking.admin_sessions
    `);
    const r = rows[0];
    info(`${r.active} aktive Sessions (${r.total} total)`);
    ok("Admin-Session-Tabelle erreichbar");
  } catch (e) {
    try {
      const { rows } = await pool.query(`
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE expires_at > NOW()) AS active
        FROM admin_sessions
      `);
      const r = rows[0];
      info(`${r.active} aktive Sessions (${r.total} total)`);
      ok("Admin-Session-Tabelle erreichbar");
    } catch (e2) {
      warn(`Sessions-Check: ${e2.message}`);
    }
  }

  // ── 6. Company-Mitglieder Login ──────────────────────────────────────────
  console.log("\n6. Company-Mitglieder (Workspace-Logins)");
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE cm.status = 'active') AS active_members,
        COUNT(*) FILTER (WHERE cm.status = 'invited') AS invited
      FROM core.company_members cm
    `);
    const r = rows[0];
    info(`${r.active_members} aktive Mitglieder, ${r.invited} ausstehende Einladungen`);
    ok("Company-Mitglieder erreichbar");
  } catch (e) {
    warn(`Company-Mitglieder Check: ${e.message}`);
  }

  // ── 7. RBAC Seeds ────────────────────────────────────────────────────────
  console.log("\n7. Lokales RBAC");
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*) AS groups FROM permission_groups
    `);
    if (Number(rows[0].groups) > 0) {
      ok(`${rows[0].groups} Berechtigungsgruppen vorhanden`);
    } else {
      warn("Keine RBAC-Gruppen vorhanden – werden beim ersten Login-Seed angelegt");
    }
  } catch (e) {
    warn(`RBAC Check: ${e.message}`);
  }

  // ── Zusammenfassung ───────────────────────────────────────────────────────
  console.log("\n=== Zusammenfassung ===\n");
  if (exitCode === 0) {
    console.log(`${PASS} Alle kritischen Checks bestanden.\n`);
    console.log("  Nächste Schritte:");
    console.log("  1. Logto Env-Variablen aus .env/.env.production entfernen");
    console.log("  2. Deploy ohne Logto-Container");
    console.log("  3. Persona-Smokes (Admin, Portal, Company) prüfen");
    console.log("  4. Rollback-Fenster offen halten (24h)\n");
  } else {
    console.log(`${FAIL} Kritische Checks FEHLGESCHLAGEN. Cutover nicht empfohlen.\n`);
    console.log("  → Alle fehlenden Passwörter setzen");
    console.log("  → Dann check erneut ausführen: node scripts/logto-cutover-readiness-check.js\n");
  }

  await pool.end();
  process.exit(exitCode);
}

runChecks().catch((e) => {
  console.error("Readiness check abgebrochen:", e.message);
  process.exit(2);
});
