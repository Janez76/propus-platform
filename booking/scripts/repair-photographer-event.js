#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * repair-photographer-event.js
 *
 * Repariert Orders mit zwei Klassen von Calendar-Inkonsistenzen:
 *
 *   1) NULL-ID-Drift: DB-event_id ist NULL, sollte aber gesetzt sein
 *      (durch geschluckte Graph-Fehler beim Statuswechsel).
 *
 *   2) Stale-ID-Drift: DB-event_id ist gesetzt, aber Outlook gibt 404 zurueck
 *      (manuell oder durch Sync-Tool geloescht). Erkennt --verify Modus.
 *
 * Usage:
 *   node scripts/repair-photographer-event.js                  # NULL-ID-Liste (schnell, nur SQL)
 *   node scripts/repair-photographer-event.js --verify         # PLUS Stale-ID-Check (langsam, GET pro ID)
 *   node scripts/repair-photographer-event.js <orderNo>        # repariert eine (deckt beide Klassen)
 *   node scripts/repair-photographer-event.js <orderNo> --dry-run
 *   node scripts/repair-photographer-event.js --all            # repariert alle (NULL-ID-Liste)
 *   node scripts/repair-photographer-event.js --all --verify   # repariert alle (NULL-ID + Stale-ID)
 *   node scripts/repair-photographer-event.js --all --dry-run
 *
 * Beispiel:
 *   node scripts/repair-photographer-event.js
 *   node scripts/repair-photographer-event.js --verify
 *   node scripts/repair-photographer-event.js 100101
 *   node scripts/repair-photographer-event.js --all
 */

"use strict";

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const { ClientSecretCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");
const db = require("../db");
const { repairCalendarEvents, eventExistsInMailbox, CalendarServiceError } = require("../calendar-service");
const PHOTOGRAPHERS_CONFIG = require("../photographers.config.js");

// Status, in denen ein Kalender-Event aktiv existieren MUSS (vgl. state-machine.js):
//   - provisional: calendar.create_provisional (tentative Events)
//   - confirmed:   calendar.upgrade_to_final / calendar.create_final
// Bei completed/done/archived bleiben Events historisch im Postfach, aber Auditing
// dort lohnt sich seltener — fuer "live" Inkonsistenzen reichen die zwei.
const STATUSES_REQUIRING_EVENT = ["provisional", "confirmed"];

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const all = args.includes("--all");
  const verify = args.includes("--verify");
  const orderNoArg = args.find((a) => /^\d+$/.test(a));
  const orderNo = orderNoArg ? parseInt(orderNoArg, 10) : null;
  return { orderNo, dryRun, all, verify };
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
    throw new Error("MS Graph env nicht vollstaendig: " + missing.join(", "));
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

/**
 * Findet alle Orders mit inkonsistenten Calendar-Event-IDs:
 *   - Status erfordert Event, aber genau eine ID ist NULL
 *   - Status erfordert Event, aber beide IDs sind NULL
 * Reine "deleted"/"cancelled" Status werden ignoriert (dort sollen Events fehlen).
 */
async function findAffectedOrders(pool) {
  const placeholders = STATUSES_REQUIRING_EVENT.map((_, i) => "$" + (i + 1)).join(",");
  const { rows } = await pool.query(
    `SELECT o.order_no,
            o.status,
            o.schedule->>'date' AS schedule_date,
            o.schedule->>'time' AS schedule_time,
            o.photographer->>'key'   AS photographer_key,
            o.photographer->>'email' AS photographer_email,
            o.photographer_event_id,
            o.office_event_id,
            o.calendar_sync_status
       FROM orders o
      WHERE o.status IN (${placeholders})
        AND (
              o.photographer_event_id IS NULL
           OR o.office_event_id IS NULL
        )
      ORDER BY o.order_no DESC`,
    STATUSES_REQUIRING_EVENT
  );
  return rows.map((r) => ({
    orderNo: r.order_no,
    status: r.status,
    scheduleDate: r.schedule_date,
    scheduleTime: r.schedule_time,
    photographerKey: r.photographer_key,
    photographerEmail: r.photographer_email,
    photographerEventId: r.photographer_event_id,
    officeEventId: r.office_event_id,
    calendarSyncStatus: r.calendar_sync_status,
    missing: [
      !r.photographer_event_id ? "photographer" : null,
      !r.office_event_id ? "office" : null,
    ].filter(Boolean),
  }));
}

function printAffectedTable(rows) {
  if (!rows.length) {
    console.log("Keine inkonsistenten Orders gefunden.");
    return;
  }
  console.log("Inkonsistente Orders (Status erfordert Event, aber Event-ID fehlt):");
  console.log("");
  console.log(
    "OrderNo".padEnd(10) +
    "Status".padEnd(14) +
    "Termin".padEnd(20) +
    "Fotograf".padEnd(12) +
    "Fehlt"
  );
  console.log("-".repeat(72));
  for (const r of rows) {
    console.log(
      String(r.orderNo).padEnd(10) +
      String(r.status || "—").padEnd(14) +
      String((r.scheduleDate || "—") + " " + (r.scheduleTime || "")).padEnd(20) +
      String(r.photographerKey || "—").padEnd(12) +
      r.missing.join(", ")
    );
  }
  console.log("");
  console.log("Total: " + rows.length);
}

async function repairOne(orderNo, deps) {
  const order = await db.getOrderByNo(orderNo);
  if (!order) return { orderNo, error: "not_found" };
  if (!order.schedule || !order.schedule.date || !order.schedule.time) {
    return { orderNo, error: "no_schedule" };
  }
  // Hinweis: kein "already_complete" short-circuit mehr — repairCalendarEvents
  // verifiziert intern auch gesetzte IDs (Stale-ID-Check). Diese Funktion ist
  // jetzt idempotent und sicher fuer alle Orders aufrufbar.
  try {
    const result = await repairCalendarEvents(order, deps);
    return { orderNo, result };
  } catch (err) {
    if (err instanceof CalendarServiceError) {
      return { orderNo, error: err.code, message: err.message };
    }
    return { orderNo, error: "unknown", message: String(err && err.message || err) };
  }
}

/**
 * Findet zusaetzlich Stale-ID-Drift via Graph-GET pro Event-ID. Langsam!
 * Eine Outlook-API-Roundtrip pro gesetzte ID. Nur fuer --verify Modus.
 *
 * @returns Liste von { orderNo, status, photographerStale, officeStale, ... }
 */
async function findStaleIdOrders(pool, graphClient, OFFICE_EMAIL) {
  const placeholders = STATUSES_REQUIRING_EVENT.map((_, i) => "$" + (i + 1)).join(",");
  const { rows } = await pool.query(
    `SELECT o.order_no,
            o.status,
            o.schedule->>'date' AS schedule_date,
            o.schedule->>'time' AS schedule_time,
            o.photographer->>'key'   AS photographer_key,
            o.photographer->>'email' AS photographer_email,
            o.photographer_event_id,
            o.office_event_id
       FROM orders o
      WHERE o.status IN (${placeholders})
        AND (o.photographer_event_id IS NOT NULL OR o.office_event_id IS NOT NULL)
      ORDER BY o.order_no DESC`,
    STATUSES_REQUIRING_EVENT
  );

  const stale = [];
  let checked = 0;
  for (const r of rows) {
    checked++;
    if (checked % 25 === 0) {
      process.stderr.write("[verify] " + checked + "/" + rows.length + " Orders geprueft...\r");
    }
    const photogStale = r.photographer_event_id && r.photographer_email
      ? !(await eventExistsInMailbox(graphClient, r.photographer_email, r.photographer_event_id).catch(() => true))
      : false;
    const officeStale = r.office_event_id && OFFICE_EMAIL
      ? !(await eventExistsInMailbox(graphClient, OFFICE_EMAIL, r.office_event_id).catch(() => true))
      : false;
    if (photogStale || officeStale) {
      stale.push({
        orderNo: r.order_no,
        status: r.status,
        scheduleDate: r.schedule_date,
        scheduleTime: r.schedule_time,
        photographerKey: r.photographer_key,
        photographerStale: photogStale,
        officeStale,
      });
    }
  }
  if (checked >= 25) process.stderr.write("\n");
  return stale;
}

function printStaleTable(rows) {
  if (!rows.length) {
    console.log("Keine Stale-ID-Drifts gefunden — alle gesetzten Event-IDs existieren in Outlook.");
    return;
  }
  console.log("Stale-ID-Drift (DB hat ID, Outlook gibt 404):");
  console.log("");
  console.log("OrderNo".padEnd(10) + "Status".padEnd(14) + "Termin".padEnd(20) + "Fotograf".padEnd(12) + "Stale");
  console.log("-".repeat(72));
  for (const r of rows) {
    const stale = [];
    if (r.photographerStale) stale.push("photographer");
    if (r.officeStale) stale.push("office");
    console.log(
      String(r.orderNo).padEnd(10) +
      String(r.status || "—").padEnd(14) +
      String((r.scheduleDate || "—") + " " + (r.scheduleTime || "")).padEnd(20) +
      String(r.photographerKey || "—").padEnd(12) +
      stale.join(", ")
    );
  }
  console.log("");
  console.log("Total: " + rows.length);
}

async function main() {
  const { orderNo, dryRun, all, verify } = parseArgs();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL nicht gesetzt (.env.local/.env).");
    process.exit(1);
  }

  const pool = db.getPool();
  if (!pool) {
    console.error("DB-Pool nicht verfuegbar.");
    process.exit(1);
  }

  const PHOTOG_PHONES = PHOTOGRAPHERS_CONFIG.reduce((acc, p) => {
    if (p && p.key) acc[p.key] = p.phone || "";
    return acc;
  }, {});
  const OFFICE_EMAIL = process.env.OFFICE_EMAIL || "office@propus.ch";

  // ── Modus 1: List-Modus (kein Argument) ────────────────────────────────
  if (!orderNo && !all) {
    const affected = await findAffectedOrders(pool);
    printAffectedTable(affected);

    if (verify) {
      console.log("\n--verify aktiv: pruefe gesetzte Event-IDs gegen Outlook (langsam)...");
      const graphClient = buildGraphClient();
      const stale = await findStaleIdOrders(pool, graphClient, OFFICE_EMAIL);
      console.log("");
      printStaleTable(stale);
    }

    const totalRepairTargets = affected.length + (verify ? 1 : 0); // hint
    if (totalRepairTargets) {
      console.log("\nReparatur einer einzelnen Order:");
      console.log("  node scripts/repair-photographer-event.js <orderNo>");
      console.log("Reparatur aller (NULL-ID + Stale-ID):");
      console.log("  node scripts/repair-photographer-event.js --all --verify");
    }
    return;
  }

  // ── Modus 2: Bulk-Modus (--all) ────────────────────────────────────────
  if (all) {
    const affected = await findAffectedOrders(pool);
    printAffectedTable(affected);

    let staleSet = [];
    if (verify) {
      console.log("\n--verify aktiv: pruefe gesetzte Event-IDs gegen Outlook (langsam)...");
      const graphForVerify = buildGraphClient();
      staleSet = await findStaleIdOrders(pool, graphForVerify, OFFICE_EMAIL);
      printStaleTable(staleSet);
    }

    // Vereinige Order-Nummern aus beiden Listen (NULL-ID-Drift + Stale-ID-Drift)
    const orderNos = new Set([
      ...affected.map((r) => r.orderNo),
      ...staleSet.map((r) => r.orderNo),
    ]);

    if (!orderNos.size) {
      console.log("\nNichts zu reparieren.");
      return;
    }

    if (dryRun) {
      console.log("\n[dry-run] Wuerde " + orderNos.size + " Order(s) reparieren — kein Schreib-Call.");
      return;
    }

    const graphClient = buildGraphClient();
    const deps = { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, db };
    const summary = { ok: 0, error: 0, skipped: 0 };
    for (const no of orderNos) {
      process.stdout.write("\nRepair Order #" + no + " ... ");
      const r = await repairOne(no, deps);
      if (r.error) {
        summary.error++;
        console.log("ERROR (" + r.error + ") " + (r.message || ""));
      } else if (r.skipped) {
        summary.skipped++;
        console.log("skipped (" + r.skipped + ")");
      } else {
        summary.ok++;
        console.log("ok");
        for (const a of r.result.actions) console.log("   - " + a);
        const orphTotal = r.result.orphans.photographer.length + r.result.orphans.office.length;
        if (orphTotal) {
          console.log("   ! " + orphTotal + " verwaiste Outlook-Eintraege gemeldet (Detail siehe Einzel-Repair)");
        }
      }
    }
    console.log("\nFertig: " + summary.ok + " ok, " + summary.skipped + " skipped, " + summary.error + " error");
    return;
  }

  // ── Modus 3: Einzel-Order ──────────────────────────────────────────────
  const order = await db.getOrderByNo(orderNo);
  if (!order) {
    console.error("Order #" + orderNo + " nicht gefunden");
    process.exit(1);
  }

  console.log("=== Order #" + orderNo + " — aktueller Zustand ===");
  console.log({
    status: order.status,
    schedule: order.schedule,
    photographer_key: order.photographer && order.photographer.key,
    photographer_email: order.photographer && order.photographer.email,
    photographer_event_id: order.photographerEventId || null,
    office_event_id: order.officeEventId || null,
  });

  if (!order.schedule || !order.schedule.date || !order.schedule.time) {
    console.error("Kein Termin auf Order — Repair nicht moeglich.");
    process.exit(2);
  }
  // Hinweis: kein Short-Circuit auf "beide IDs gesetzt" — repairCalendarEvents
  // verifiziert intern via Graph-GET ob die IDs noch valide sind (Stale-ID-Fix).

  if (dryRun) {
    console.log("\n[dry-run] Wuerde repairCalendarEvents() aufrufen mit:");
    console.log({
      OFFICE_EMAIL,
      photographer_email: order.photographer && order.photographer.email,
      photographer_event_id_set: !!order.photographerEventId,
      office_event_id_set: !!order.officeEventId,
      note: "Repair prueft intern auch Stale-IDs (Outlook-GET pro gesetzter ID).",
    });
    console.log("\n[dry-run] Kein Graph-API-Call ausgefuehrt.");
    return;
  }

  const graphClient = buildGraphClient();
  const result = await repairCalendarEvents(order, {
    graphClient,
    OFFICE_EMAIL,
    PHOTOG_PHONES,
    db,
  });

  console.log("\n=== Reparatur abgeschlossen ===");
  for (const a of result.actions) console.log(" - " + a);
  if (Object.keys(result.updateFields).length) {
    console.log("\nGespeicherte Felder:", result.updateFields);
  }
  if (result.orphans.photographer.length || result.orphans.office.length) {
    console.log("\nVerwaiste Eintraege im Postfach (NICHT automatisch geloescht):");
    if (result.orphans.photographer.length) {
      console.log(" Fotograf:");
      for (const e of result.orphans.photographer) {
        console.log("   -", e.id, "|", e.subject, "|", e.start && e.start.dateTime);
      }
    }
    if (result.orphans.office.length) {
      console.log(" Office:");
      for (const e of result.orphans.office) {
        console.log("   -", e.id, "|", e.subject, "|", e.start && e.start.dateTime);
      }
    }
    console.log("\nWenn das die alten verwaisten Events sind, manuell aus dem");
    console.log("Outlook-Postfach loeschen ODER per:");
    console.log("  curl -X DELETE 'https://graph.microsoft.com/v1.0/users/<mailbox>/events/<eventId>'");
  }
}

main()
  .catch((err) => {
    if (err instanceof CalendarServiceError) {
      console.error("CalendarServiceError [" + err.code + "]:", err.message);
    } else {
      console.error(err);
    }
    process.exit(1);
  })
  .finally(async () => {
    try { await db.closePool(); } catch (_) { /* ignore */ }
  });
