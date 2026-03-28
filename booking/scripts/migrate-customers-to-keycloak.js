#!/usr/bin/env node
/**
 * migrate-customers-to-keycloak.js
 *
 * Migriert alle bestehenden Kunden-Konten aus der PostgreSQL-DB zu Keycloak.
 *
 * Was passiert:
 *  1. Alle Kunden ohne keycloak_sub werden aus der DB gelesen.
 *  2. Für jeden Kunden wird via Keycloak Admin REST API ein User angelegt.
 *  3. Die Realm-Rolle "customer" wird zugewiesen.
 *  4. E-Mail wird als verifiziert markiert.
 *  5. Passwort wird NICHT migriert (scrypt nicht exportierbar) →
 *     Kunden erhalten automatisch Required-Action "UPDATE_PASSWORD".
 *  6. keycloak_sub wird in die DB zurückgeschrieben.
 *
 * Umgebungsvariablen (erforderlich):
 *   DATABASE_URL          PostgreSQL-Verbindungsstring
 *   OIDC_ISSUER           z.B. https://sso.propus.ch/realms/propus
 *   KEYCLOAK_ADMIN_USER   Keycloak-Admin-Benutzername (z.B. admin)
 *   KEYCLOAK_ADMIN_PASS   Keycloak-Admin-Passwort
 *
 * Optional:
 *   KEYCLOAK_REALM        Realm-Name (Standard: aus OIDC_ISSUER extrahiert oder "propus")
 *   KEYCLOAK_BASE_URL     Basis-URL des Keycloak-Servers (Standard: aus OIDC_ISSUER)
 *   DRY_RUN               "true" → keine Änderungen vornehmen, nur ausgeben
 *
 * Aufruf:
 *   node backend/scripts/migrate-customers-to-keycloak.js
 *   DRY_RUN=true node backend/scripts/migrate-customers-to-keycloak.js
 */

"use strict";

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
const OIDC_ISSUER = process.env.OIDC_ISSUER || "";
const KEYCLOAK_ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER || "";
const KEYCLOAK_ADMIN_PASS = process.env.KEYCLOAK_ADMIN_PASS || "";
const DRY_RUN = String(process.env.DRY_RUN || "false").toLowerCase() === "true";

function extractRealmFromIssuer(issuer) {
  const match = String(issuer || "").match(/\/realms\/([^/]+)/);
  return match ? match[1] : "propus";
}

function extractBaseUrlFromIssuer(issuer) {
  const url = new URL(issuer);
  return `${url.protocol}//${url.host}`;
}

const REALM = process.env.KEYCLOAK_REALM || extractRealmFromIssuer(OIDC_ISSUER);
const KEYCLOAK_BASE = process.env.KEYCLOAK_BASE_URL || (OIDC_ISSUER ? extractBaseUrlFromIssuer(OIDC_ISSUER) : "");

async function getAdminToken() {
  const tokenUrl = `${KEYCLOAK_BASE}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    client_id: "admin-cli",
    username: KEYCLOAK_ADMIN_USER,
    password: KEYCLOAK_ADMIN_PASS,
    grant_type: "password",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keycloak Admin-Token fehlgeschlagen (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

async function findUserByEmail(token, email) {
  const url = `${KEYCLOAK_BASE}/admin/realms/${REALM}/users?email=${encodeURIComponent(email)}&exact=true`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const users = await res.json();
  return Array.isArray(users) && users.length > 0 ? users[0] : null;
}

async function createKeycloakUser(token, { email, name }) {
  const firstName = name.split(" ").slice(0, -1).join(" ") || name;
  const lastName = name.split(" ").slice(-1)[0] || "";

  const url = `${KEYCLOAK_BASE}/admin/realms/${REALM}/users`;
  const body = {
    username: email,
    email,
    firstName,
    lastName,
    emailVerified: true,
    enabled: true,
    requiredActions: ["UPDATE_PASSWORD"],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.status === 409) {
    return null; // Existiert bereits
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keycloak User erstellen fehlgeschlagen (${res.status}): ${text}`);
  }

  // Location-Header enthält neue User-ID
  const location = res.headers.get("Location") || "";
  const idMatch = location.match(/\/users\/([^/]+)$/);
  return idMatch ? idMatch[1] : null;
}

async function assignRealmRole(token, userId) {
  // Rolle "customer" suchen
  const rolesUrl = `${KEYCLOAK_BASE}/admin/realms/${REALM}/roles/customer`;
  const roleRes = await fetch(rolesUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!roleRes.ok) {
    console.warn(`  ⚠ Rolle "customer" nicht gefunden (${roleRes.status}) – wird übersprungen`);
    return;
  }

  const role = await roleRes.json();

  const assignUrl = `${KEYCLOAK_BASE}/admin/realms/${REALM}/users/${userId}/role-mappings/realm`;
  const assignRes = await fetch(assignUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([role]),
  });

  if (!assignRes.ok && assignRes.status !== 204) {
    const text = await assignRes.text();
    console.warn(`  ⚠ Rolle zuweisen fehlgeschlagen (${assignRes.status}): ${text}`);
  }
}

async function sendPasswordResetEmail(token, userId) {
  const url = `${KEYCLOAK_BASE}/admin/realms/${REALM}/users/${userId}/execute-actions-email`;
  await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["UPDATE_PASSWORD"]),
  });
}

async function main() {
  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL fehlt");
    process.exit(1);
  }
  if (!KEYCLOAK_ADMIN_USER || !KEYCLOAK_ADMIN_PASS) {
    console.error("❌ KEYCLOAK_ADMIN_USER und KEYCLOAK_ADMIN_PASS müssen gesetzt sein");
    process.exit(1);
  }
  if (!KEYCLOAK_BASE) {
    console.error("❌ OIDC_ISSUER oder KEYCLOAK_BASE_URL muss gesetzt sein");
    process.exit(1);
  }

  console.log(`\n🔑 Keycloak Migration: ${KEYCLOAK_BASE}/realms/${REALM}`);
  console.log(`📋 Realm: ${REALM}`);
  if (DRY_RUN) console.log("🔍 DRY RUN — keine Änderungen werden vorgenommen\n");

  const pool = new Pool({ connectionString: DATABASE_URL });

  let adminToken;
  try {
    adminToken = await getAdminToken();
    console.log("✅ Keycloak Admin-Token erhalten\n");
  } catch (e) {
    console.error("❌ Admin-Token fehlgeschlagen:", e.message);
    await pool.end();
    process.exit(1);
  }

  const { rows: customers } = await pool.query(
    "SELECT id, email, name FROM customers WHERE keycloak_sub IS NULL AND email IS NOT NULL ORDER BY id"
  );

  console.log(`📊 ${customers.length} Kunden ohne keycloak_sub gefunden\n`);

  let created = 0;
  let linked = 0;
  let skipped = 0;
  let errors = 0;

  for (const customer of customers) {
    const { id, email, name } = customer;
    const displayName = name || email;
    process.stdout.write(`  [${id}] ${email} (${displayName}) → `);

    try {
      if (DRY_RUN) {
        console.log("DRY RUN – übersprungen");
        skipped++;
        continue;
      }

      // Erst prüfen ob User bereits existiert
      let existingUser = await findUserByEmail(adminToken, email);
      let keycloakId = existingUser?.id || null;

      if (existingUser) {
        process.stdout.write(`bereits vorhanden (${keycloakId}) → verknüpfe… `);
        linked++;
      } else {
        keycloakId = await createKeycloakUser(adminToken, { email, name: displayName });
        if (!keycloakId) {
          // Nochmals suchen (race condition)
          existingUser = await findUserByEmail(adminToken, email);
          keycloakId = existingUser?.id || null;
          if (keycloakId) {
            process.stdout.write(`bereits vorhanden (race) → verknüpfe… `);
            linked++;
          } else {
            console.log("❌ User konnte nicht erstellt werden");
            errors++;
            continue;
          }
        } else {
          process.stdout.write(`erstellt (${keycloakId}) → `);
          created++;
          await assignRealmRole(adminToken, keycloakId);
          await sendPasswordResetEmail(adminToken, keycloakId);
        }
      }

      // keycloak_sub in DB schreiben
      await pool.query(
        "UPDATE customers SET keycloak_sub = $1, updated_at = NOW() WHERE id = $2",
        [keycloakId, id]
      );
      console.log("✅");
    } catch (e) {
      console.log(`❌ ${e.message}`);
      errors++;
    }
  }

  await pool.end();

  console.log("\n─────────────────────────────────");
  console.log(`✅ Erstellt:     ${created}`);
  console.log(`🔗 Verknüpft:    ${linked}`);
  console.log(`⏭ Übersprungen: ${skipped}`);
  console.log(`❌ Fehler:       ${errors}`);
  console.log("─────────────────────────────────\n");

  if (errors > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Unerwarteter Fehler:", e.message);
  process.exit(1);
});
