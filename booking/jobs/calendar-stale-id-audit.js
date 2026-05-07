/**
 * jobs/calendar-stale-id-audit.js
 * Naechtlicher Audit: prueft fuer alle confirmed/provisional Orders mit
 * gesetzten Calendar-Event-IDs, ob die Events tatsaechlich noch im Outlook-
 * Postfach existieren (Graph-GET pro ID). 404 = Stale-ID-Drift, wird geloggt
 * und optional via E-Mail an OFFICE_EMAIL gemeldet.
 *
 * READ-ONLY: Job aendert nichts in DB oder Outlook. Repair-Aktionen muessen
 * manuell via scripts/repair-photographer-event.js erfolgen — bewusst defensiv,
 * weil Auto-Recreate bei transienten Graph-Fehlern Duplikate erzeugen koennte.
 *
 * Cron: 03:30 Europe/Zurich (nach Mitternacht, vor erstem Shooting-Tag).
 * Gated durch feature.backgroundJobs (gemeinsam mit den anderen taeglichen Jobs).
 */

"use strict";

const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");
const { eventExistsInMailbox } = require("../calendar-service");

const STATUSES = ["provisional", "confirmed"];

/**
 * @param {object} deps - { db, graphClient, OFFICE_EMAIL, sendMail }
 */
function scheduleCalendarStaleIdAudit(deps) {
  const { db, graphClient, OFFICE_EMAIL, sendMail } = deps;
  const pool = db && typeof db.getPool === "function" ? db.getPool() : null;

  return scheduleSafeCronJob({
    name: "calendar-stale-id-audit",
    cron: "30 3 * * *",
    pool,
    timezone: process.env.TIMEZONE || "Europe/Zurich",
    run: async (ctx) => {
      ctx.log("Stale-ID-Audit gestartet");
      if (!pool) { ctx.warn("Kein DB-Pool verfuegbar, uebersprungen"); return; }
      if (!graphClient) { ctx.warn("graphClient nicht verfuegbar, uebersprungen"); return; }

      const placeholders = STATUSES.map((_, i) => "$" + (i + 1)).join(",");
      let rows;
      try {
        const result = await pool.query(
          `SELECT order_no, status,
                  photographer_event_id,
                  office_event_id,
                  photographer->>'email' AS photographer_email
             FROM booking.orders
            WHERE status IN (${placeholders})
              AND (photographer_event_id IS NOT NULL OR office_event_id IS NOT NULL)
            ORDER BY order_no DESC`,
          STATUSES
        );
        rows = result.rows;
      } catch (err) {
        ctx.error("DB-Abfrage fehlgeschlagen:", err && err.message);
        return;
      }

      if (!rows.length) { ctx.log("Keine Orders zu pruefen"); return; }

      const stale = [];
      for (const r of rows) {
        let photographerStale = false;
        let officeStale = false;
        if (r.photographer_event_id && r.photographer_email) {
          try {
            const exists = await eventExistsInMailbox(graphClient, r.photographer_email, r.photographer_event_id);
            if (!exists) photographerStale = true;
          } catch (err) {
            // Anderer Graph-Fehler (5xx, Throttle): konservativ als ok behandeln
            ctx.warn("Graph-Verify Fehler (photog), behandle als vorhanden", { orderNo: r.order_no, error: err && err.message });
          }
        }
        if (r.office_event_id && OFFICE_EMAIL) {
          try {
            const exists = await eventExistsInMailbox(graphClient, OFFICE_EMAIL, r.office_event_id);
            if (!exists) officeStale = true;
          } catch (err) {
            ctx.warn("Graph-Verify Fehler (office), behandle als vorhanden", { orderNo: r.order_no, error: err && err.message });
          }
        }
        if (photographerStale || officeStale) {
          stale.push({
            order_no: r.order_no,
            status: r.status,
            photographer_email: r.photographer_email,
            photographer_stale: photographerStale,
            office_stale: officeStale,
          });
        }
      }

      ctx.log("Audit abgeschlossen", { checked: rows.length, stale: stale.length });

      if (!stale.length) return;

      // Fuer jeden Drift einen Warning-Log; zusaetzlich zusammenfassende Mail an OFFICE.
      for (const s of stale) {
        ctx.warn("Stale-ID gefunden", s);
      }

      if (sendMail && OFFICE_EMAIL) {
        try {
          const lines = stale.map((s) =>
            `  - Order #${s.order_no} (status=${s.status}, photog=${s.photographer_email || "—"})`
            + (s.photographer_stale ? "  [PHOTOG 404]" : "")
            + (s.office_stale ? "  [OFFICE 404]" : "")
          ).join("\n");
          await sendMail(
            OFFICE_EMAIL,
            "[Propus] Calendar Stale-ID Drift erkannt — " + stale.length + " Order(s)",
            "Folgende Orders haben Event-IDs in der DB, deren Outlook-Events nicht mehr existieren:\n\n"
            + lines
            + "\n\nReparatur:\n"
            + "  cd /opt/propus-platform/booking && node scripts/repair-photographer-event.js <orderNo>\n"
            + "Oder bulk:\n"
            + "  node scripts/repair-photographer-event.js --all --verify\n",
            null
          );
          ctx.log("Audit-Mail an OFFICE_EMAIL gesendet");
        } catch (err) {
          ctx.error("Mail-Versand fehlgeschlagen:", err && err.message);
        }
      }
    },
  });
}

module.exports = { scheduleCalendarStaleIdAudit };
