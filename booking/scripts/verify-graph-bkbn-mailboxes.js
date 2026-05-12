#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Prüft App-only-Zugriff auf BKBN-Kalenderpostfächer (Microsoft Graph calendarView),
 * identisch zur Logik in booking/server.js (loadBkbnCalendarEvents).
 *
 * Usage:
 *   cd booking && node scripts/verify-graph-bkbn-mailboxes.js
 *   npm run verify:graph-bkbn
 *
 * ENV: MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET;
 *      BKBN_CALENDAR_MAILBOXES optional (sonst Default wie server.js).
 *
 * Auf dem VPS z. B.:
 *   set -a && source /opt/propus-platform/.env.vps && set +a && cd /app/booking && node scripts/verify-graph-bkbn-mailboxes.js
 * (Pfad /app/booking je nach Image anpassen.)
 */

"use strict";

const path = require("path");
try {
  const dotenv = require("dotenv");
  dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
} catch {
  // optional
}

const { ClientSecretCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");

const BKBN_CALENDAR_MAILBOXES_DEFAULT = "ivan.mijajlovic@propus.ch,janez.smirmaul@propus.ch";

function bkbnMailboxes() {
  return String(process.env.BKBN_CALENDAR_MAILBOXES || BKBN_CALENDAR_MAILBOXES_DEFAULT)
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

function buildGraphClient() {
  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_CLIENT_ID;
  const secret = process.env.MS_GRAPH_CLIENT_SECRET;
  const missing = [];
  if (!tenant) missing.push("MS_GRAPH_TENANT_ID");
  if (!clientId) missing.push("MS_GRAPH_CLIENT_ID");
  if (!secret) missing.push("MS_GRAPH_CLIENT_SECRET");
  if (missing.length) {
    throw new Error("MS Graph env unvollstaendig: " + missing.join(", "));
  }
  const credential = new ClientSecretCredential(tenant, clientId, secret);
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken("https://graph.microsoft.com/.default");
        return token.token;
      },
    },
  });
}

function summarizeGraphError(err) {
  const statusCode = err && (err.statusCode ?? err.code);
  const message = err && err.message ? String(err.message) : String(err);
  let code = "";
  let inner = "";
  if (err && err.body) {
    try {
      const b = typeof err.body === "string" ? JSON.parse(err.body) : err.body;
      if (b && b.error) {
        code = b.error.code || "";
        inner = b.error.message || "";
      }
    } catch {
      /* ignore */
    }
  }
  return { statusCode, message, code, inner };
}

async function main() {
  console.log("[verify-graph-bkbn] BKBN_CALENDAR_MAILBOXES =", process.env.BKBN_CALENDAR_MAILBOXES || "(default)");
  const mailboxes = bkbnMailboxes();
  if (mailboxes.length === 0) {
    console.error("[verify-graph-bkbn] Keine gueltigen Mailbox-Adressen.");
    process.exit(1);
  }

  let graphClient;
  try {
    graphClient = buildGraphClient();
  } catch (e) {
    console.error("[verify-graph-bkbn]", e.message);
    process.exit(1);
  }

  const today = new Date();
  const fromIso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}T00:00:00Z`;
  const toIso = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}T23:59:59Z`;
  const tz = process.env.TIMEZONE || "Europe/Zurich";

  let failed = 0;
  for (const mb of mailboxes) {
    try {
      const response = await graphClient
        .api(`/users/${encodeURIComponent(mb)}/calendarView`)
        .query({ startDateTime: fromIso, endDateTime: toIso, $top: "5" })
        .header("Prefer", `outlook.timezone="${tz}"`)
        .select("id,subject,start")
        .orderby("start/dateTime")
        .get();
      const n = Array.isArray(response && response.value) ? response.value.length : 0;
      console.log(`[verify-graph-bkbn] OK  ${mb}  (sample fetch: ${n} events today window)`);
    } catch (err) {
      failed += 1;
      const s = summarizeGraphError(err);
      console.error(`[verify-graph-bkbn] FAIL ${mb}`, s);
    }
  }

  if (failed > 0) {
    console.error(`[verify-graph-bkbn] Fertig mit Fehlern (${failed}/${mailboxes.length}). Siehe docs/OPS_M365_GRAPH_BKBN.md (Consent / Exchange Policy).`);
    process.exit(1);
  }
  console.log("[verify-graph-bkbn] Alle Postfaecher OK.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[verify-graph-bkbn] Unerwarteter Fehler:", e);
  process.exit(1);
});
