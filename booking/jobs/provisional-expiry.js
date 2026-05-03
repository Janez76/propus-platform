/**
 * jobs/provisional-expiry.js
 * Taeglich 03:00 Zuerich: Provisorien die abgelaufen sind auf "pending" setzen.
 * Kalender-Delete + Status-Reset laufen ueber changeOrderStatus (source: expiry_job).
 * Nach dem Reset: Ablauf-Mail an Kunde senden (Template: provisional_expired).
 * Idempotent: prueft status + provisional_expires_at vor jedem Update.
 *
 * Nutzt scheduleSafeCronJob (core/lib/safe-cron-job.js) fuer:
 *   - Distributed-Lock (pg_try_advisory_lock) → kein Mehrfach-Lauf in Multi-Pod-Deploys
 *   - Skip-on-overlap fuer langlaufende Ticks
 *   - Per-row try/catch via ctx.perRow → 1 bad-record blockiert nicht den Batch
 */

"use strict";

const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");
const { buildTemplateVars, sendMailIdempotent } = require("../template-renderer");
const { changeOrderStatus } = require("../order-status-workflow");

/**
 * @param {object} deps - { db, getSetting, sendMail, graphClient, OFFICE_EMAIL, PHOTOG_PHONES }
 */
function scheduleProvisionalExpiry(deps) {
  const { db, getSetting, sendMail, graphClient, OFFICE_EMAIL, PHOTOG_PHONES } = deps;
  const pool = db.getPool ? db.getPool() : null;

  scheduleSafeCronJob({
    name: "provisional-expiry",
    cron: "0 3 * * *",
    pool,
    timezone: "Europe/Zurich",
    run: async (ctx) => {
      ctx.log("Provisorium-Ablauf-Job gestartet");

      const flagResult = await getSetting("feature.backgroundJobs");
      if (!flagResult || !flagResult.value) {
        ctx.log("feature.backgroundJobs=false, uebersprungen");
        return;
      }

      if (!pool) { ctx.warn("DB nicht verfuegbar"); return; }

      const mailEnabled = await getSetting("feature.emailTemplatesOnStatusChange");
      const mailOn = !!(mailEnabled && mailEnabled.value);

      const { rows } = await pool.query(
        `SELECT order_no, status, provisional_expires_at, billing, address, services, pricing, photographer, schedule,
                photographer_event_id, office_event_id, object, attendee_emails
         FROM orders
         WHERE status = 'provisional'
           AND provisional_expires_at IS NOT NULL
           AND provisional_expires_at <= NOW()`
      );

      if (!rows.length) {
        ctx.log("keine abgelaufenen Provisorien");
        return;
      }

      ctx.log("abgelaufene Provisorien:", rows.length);

      for (const row of rows) {
        await ctx.perRow(row, async (r) => {
          const orderNo = r.order_no;

          // loadOrder liest **frisch** aus der DB statt den Snapshot aus
          // dem initialen Batch-SELECT zu nutzen. Damit kein Stale-Read,
          // wenn ein Auftrag zwischen Batch-Read und perRow manuell
          // geaendert wurde (CodeRabbit-Review #253). Gleichzeitig wird die
          // Expiry-Bedingung erneut geprueft — wenn der Auftrag inzwischen
          // nicht mehr provisorisch ist oder das Ablaufdatum entfernt
          // wurde, ueberspringen wir ihn.
          const loadOrder = async function() {
            const fresh = await pool.query(
              `SELECT order_no, status, provisional_expires_at, billing, address, services, pricing,
                      photographer, schedule, photographer_event_id, office_event_id, object, attendee_emails
               FROM orders WHERE order_no = $1 LIMIT 1`,
              [orderNo],
            );
            const f = fresh.rows[0];
            if (!f) return null;
            if (f.status !== 'provisional' || !f.provisional_expires_at || new Date(f.provisional_expires_at) > new Date()) {
              ctx.log("Auftrag nicht mehr ablaufbereit, skip:", orderNo, { status: f.status });
              return null;
            }
            return {
              orderNo,
              status: f.status,
              photographer: f.photographer || {},
              photographerEventId: f.photographer_event_id,
              officeEventId: f.office_event_id,
              schedule: f.schedule || {},
              billing: f.billing || {},
              address: f.address || "",
              services: f.services || {},
              pricing: f.pricing || {},
              object: f.object || {},
            };
          };

          // Zentrale Workflow-Engine: provisional -> pending via expiry_job.
          // changeOrderStatus ruft loadOrder; wenn null, brechen wir hier ab
          // (frisch-gelesener Auftrag passt nicht mehr zur Expiry-Bedingung).
          const freshSnapshot = await loadOrder();
          if (!freshSnapshot) return;
          const result = await changeOrderStatus(orderNo, "pending", {
            source: "expiry_job",
            actorId: "job:provisional-expiry",
            loadOrder: async () => freshSnapshot,
          }, { db, getSetting, graphClient, OFFICE_EMAIL, PHOTOG_PHONES: PHOTOG_PHONES || {} });

          if (!result.success) {
            ctx.error("changeOrderStatus fehlgeschlagen:", { orderNo, error: result.error, code: result.code });
            return;
          }

          ctx.log("Auftrag zurueck auf pending:", orderNo, { calendarResult: result.calendarResult });

          // Ablauf-Mail an Kunde (idempotent via email_send_log) — nutzt den
          // frisch-gelesenen Snapshot fuer aktuelle billing/services-Daten.
          if (mailOn && sendMail && freshSnapshot.billing && freshSnapshot.billing.email) {
            try {
              const vars = buildTemplateVars(freshSnapshot, {});
              await sendMailIdempotent(pool, "provisional_expired", freshSnapshot.billing.email, orderNo, vars, sendMail);
            } catch (mailErr) {
              ctx.error("Ablauf-Mail fehlgeschlagen:", orderNo, mailErr && mailErr.message);
            }
          }
        });
      }

      ctx.log("Provisorium-Ablauf-Job abgeschlossen");
    },
  });
}

module.exports = { scheduleProvisionalExpiry };
