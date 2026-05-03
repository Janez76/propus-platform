#!/usr/bin/env node
/**
 * Admin-Benutzer anlegen / aktualisieren
 * Verwendung: node scripts/setup-admin-user.js
 *
 * Legt den Administrator-Hauptbenutzer in der admin_users Tabelle an
 * oder aktualisiert bestehendes Konto (Passwort, Rolle, Status).
 */

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..") });

const { Pool } = require("pg");
const crypto = require("crypto");

// ─── Konfiguration ────────────────────────────────────────────────────────────
// KEINE hartkodierten Identitaets-Defaults: das Skript schreibt sonst still in
// den falschen Account. Aliase fuer die existierenden Deploy-Variablen
// ADMIN_USER / ADMIN_PASS bleiben erhalten (siehe docker-compose.vps.yml,
// .env.vps.example, scripts/ADMIN-SETUP-ANLEITUNG.md).
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || process.env.ADMIN_USER  || "";
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "";
const ADMIN_NAME     = process.env.ADMIN_NAME     || "";
const ADMIN_ROLE     = process.env.ADMIN_ROLE     || "super_admin";
const ADMIN_PASSWORD =
  process.argv[2] ||
  process.env.ADMIN_PASSWORD ||
  process.env.ADMIN_PASS ||
  "";

if (!ADMIN_USERNAME || !ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
  const missing = [
    !ADMIN_USERNAME && "ADMIN_USERNAME (oder ADMIN_USER)",
    !ADMIN_EMAIL && "ADMIN_EMAIL",
    !ADMIN_NAME && "ADMIN_NAME",
    !ADMIN_PASSWORD && "ADMIN_PASSWORD (oder ADMIN_PASS, oder Argument $1)",
  ].filter(Boolean);
  console.error(
    "✖ Admin-Bootstrap unvollständig konfiguriert. Fehlend: " + missing.join(", ") + "\n" +
      "  Verwendung:  node scripts/setup-admin-user.js <password>\n" +
      "  Env:         ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD\n" +
      "  Aliase:      ADMIN_USER, ADMIN_PASS (Legacy)",
  );
  process.exit(1);
}

// ─── Passwort-Hashing (identisch mit customer-auth.js) ───────────────────────
async function scryptAsync(password, salt, keylen) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

async function hashPassword(plaintext) {
  const pw = String(plaintext || "").trim();
  if (pw.length < 8) throw new Error("Passwort muss mindestens 8 Zeichen haben");
  
  // Versuche zuerst bcrypt (wie customer-auth.js)
  try {
    const bcrypt = require("bcryptjs");
    return await bcrypt.hash(pw, 12);
  } catch (_) {}
  
  // Fallback: scrypt (wie alter Admin-Hash)
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${Buffer.from(derived).toString("base64")}`;
}

// ─── Hauptprogramm ────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL nicht gesetzt. Bitte .env prüfen.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log("\n=== Admin-Benutzer Setup ===\n");
    console.log(`  Benutzername : ${ADMIN_USERNAME}`);
    console.log(`  E-Mail       : ${ADMIN_EMAIL}`);
    console.log(`  Name         : ${ADMIN_NAME}`);
    console.log(`  Rolle        : ${ADMIN_ROLE}`);
    console.log(`  Passwort     : ${"*".repeat(ADMIN_PASSWORD.length)} (${ADMIN_PASSWORD.length} Zeichen)\n`);

    const hash = await hashPassword(ADMIN_PASSWORD);
    console.log("  ✓ Passwort gehasht\n");

    // Schema-Präfix ermitteln (booking.admin_users VIEW seit Migration 040,
    // oder public.admin_users auf alten Stand-Alone-DBs).
    let tableName = "admin_users";
    try {
      const schemaCheck = await pool.query(
        `SELECT table_schema FROM information_schema.tables
         WHERE table_name = 'admin_users'
           AND table_type IN ('BASE TABLE', 'VIEW')
         ORDER BY CASE table_schema WHEN 'booking' THEN 0 WHEN 'public' THEN 1 ELSE 2 END
         LIMIT 1`
      );
      if (schemaCheck.rows[0]) {
        tableName = `${schemaCheck.rows[0].table_schema}.admin_users`;
      }
    } catch (_) {}

    console.log(`  Tabelle: ${tableName}`);

    // Bestehenden Eintrag prüfen
    const existing = await pool.query(
      `SELECT id, username, email, role, active FROM ${tableName}
       WHERE LOWER(username) = $1 OR LOWER(email) = $2
       LIMIT 1`,
      [ADMIN_USERNAME, ADMIN_EMAIL]
    );

    if (existing.rows[0]) {
      const row = existing.rows[0];
      console.log(`\n  Bestehender Eintrag gefunden: ID=${row.id}, ${row.email}, Rolle=${row.role}`);
      
      // Update
      await pool.query(
        `UPDATE ${tableName}
         SET username = $1, email = $2, name = $3, role = $4,
             password_hash = $5, active = TRUE, updated_at = NOW()
         WHERE id = $6`,
        [ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_NAME, ADMIN_ROLE, hash, row.id]
      );
      console.log(`  ✓ Benutzer aktualisiert (ID=${row.id})`);
    } else {
      // Neuen Benutzer anlegen
      const insert = await pool.query(
        `INSERT INTO ${tableName} (username, email, name, role, password_hash, active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
         RETURNING id`,
        [ADMIN_USERNAME, ADMIN_EMAIL, ADMIN_NAME, ADMIN_ROLE, hash]
      );
      console.log(`\n  ✓ Neuer Benutzer angelegt (ID=${insert.rows[0].id})`);
    }

    // RBAC sync versuchen
    try {
      const rbac = require(path.join(__dirname, "..", "booking", "access-rbac"));
      await rbac.seedRbacIfNeeded();
      const checkUser = await pool.query(
        `SELECT id FROM ${tableName} WHERE LOWER(email) = $1 LIMIT 1`,
        [ADMIN_EMAIL]
      );
      if (checkUser.rows[0]) {
        await rbac.syncAdminUserRolesFromDb(checkUser.rows[0].id);
        console.log("  ✓ RBAC-Rollen synchronisiert");
      }
    } catch (e) {
      console.log(`  ⚠ RBAC sync: ${e.message} (wird beim ersten Login nachgeholt)`);
    }

    console.log("\n=== Fertig ===");
    console.log(`\n  Login unter: https://admin-booking.propus.ch/login`);
    console.log(`  Benutzername: ${ADMIN_USERNAME}  (oder E-Mail: ${ADMIN_EMAIL})`);
    console.log(`  Passwort:     ${ADMIN_PASSWORD}\n`);

  } catch (err) {
    console.error("\n❌ Fehler:", err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
