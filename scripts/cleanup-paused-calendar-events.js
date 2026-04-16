#!/usr/bin/env node
/**
 * Einmaliges Cleanup: Löscht Outlook-Kalender-Events für alle pausierten Aufträge
 * die noch eine photographer_event_id oder office_event_id haben.
 *
 * Ausführen auf dem VPS (im Container oder mit korrekten Env-Vars):
 *   node scripts/cleanup-paused-calendar-events.js
 */

const { Pool } = require("pg");
const { ClientSecretCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");

const DATABASE_URL = process.env.DATABASE_URL;
const DB_SEARCH_PATH = process.env.DB_SEARCH_PATH || "booking,core,public";
const OFFICE_EMAIL = process.env.OFFICE_EMAIL || "office@propus.ch";
const { MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET } = process.env;

if (!DATABASE_URL) { console.error("DATABASE_URL fehlt"); process.exit(1); }
if (!MS_GRAPH_TENANT_ID || !MS_GRAPH_CLIENT_ID || !MS_GRAPH_CLIENT_SECRET) {
  console.error("MS Graph Env-Vars fehlen (MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET)");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  options: `-c search_path=${DB_SEARCH_PATH}`,
});

const credential = new ClientSecretCredential(MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET);
const graphClient = Client.initWithMiddleware({
  authProvider: {
    getAccessToken: async () => {
      const token = await credential.getToken("https://graph.microsoft.com/.default");
      return token.token;
    },
  },
});

async function deleteEvent(email, eventId, label) {
  try {
    await graphClient.api(`/users/${email}/events/${eventId}`).delete();
    console.log(`  ✓ ${label} gelöscht (${eventId})`);
    return true;
  } catch (err) {
    const code = err?.statusCode || err?.code || "?";
    if (code === 404 || code === "404") {
      console.log(`  ~ ${label} bereits nicht mehr vorhanden (404)`);
      return true;
    }
    console.error(`  ✗ ${label} Fehler: ${err?.message || err}`);
    return false;
  }
}

async function run() {
  const { rows } = await pool.query(`
    SELECT order_no,
           photographer_event_id,
           office_event_id,
           photographer->>'email' AS photographer_email
    FROM orders
    WHERE status = 'paused'
      AND (photographer_event_id IS NOT NULL OR office_event_id IS NOT NULL)
  `);

  if (rows.length === 0) {
    console.log("Keine pausierten Aufträge mit offenen Kalender-Events gefunden.");
    await pool.end();
    return;
  }

  console.log(`${rows.length} pausierte Auftrag/Aufträge gefunden:\n`);

  for (const row of rows) {
    console.log(`Auftrag #${row.order_no}:`);

    let deletedPhotographer = false;
    let deletedOffice = false;

    if (row.photographer_event_id && row.photographer_email) {
      deletedPhotographer = await deleteEvent(row.photographer_email, row.photographer_event_id, "Fotograf-Event");
    } else if (row.photographer_event_id) {
      console.log(`  ~ Fotograf-Event vorhanden aber keine E-Mail – übersprungen`);
    }

    if (row.office_event_id) {
      deletedOffice = await deleteEvent(OFFICE_EMAIL, row.office_event_id, "Büro-Event");
    }

    const updates = [];
    const values = [];
    let idx = 1;
    if (deletedPhotographer) { updates.push(`photographer_event_id = $${idx++}`); values.push(null); }
    if (deletedOffice)       { updates.push(`office_event_id = $${idx++}`);       values.push(null); }

    if (updates.length > 0) {
      values.push(row.order_no);
      await pool.query(
        `UPDATE orders SET ${updates.join(", ")} WHERE order_no = $${idx}`,
        values
      );
      console.log(`  ✓ DB aktualisiert\n`);
    } else {
      console.log(`  ! Keine DB-Änderung (Events konnten nicht gelöscht werden)\n`);
    }
  }

  await pool.end();
  console.log("Cleanup abgeschlossen.");
}

run().catch((err) => {
  console.error("Fehler:", err);
  pool.end().catch(() => {});
  process.exit(1);
});
