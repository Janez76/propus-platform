/**
 * jobs/provisional-expiry.js
 * Taeglich 03:00 Zuerich: Provisorien die abgelaufen sind auf "pending" setzen.
 * Kalender-Delete + Status-Reset laufen ueber changeOrderStatus (source: expiry_job).
 * Nach dem Reset: Ablauf-Mail an Kunde senden (Template: provisional_expired).
 * Idempotent: prueft status + provisional_expires_at vor jedem Update.
 */

"use strict";

const cron = require("node-cron");
const { buildTemplateVars, sendMailIdempotent } = require("../template-renderer");
const { changeOrderStatus } = require("../order-status-workflow");

/**
 * @param {object} deps - { db, getSetting, sendMail, graphClient, OFFICE_EMAIL, PHOTOG_PHONES }
 */
function scheduleProvisionalExpiry(deps) {
  const { db, getSetting, sendMail, graphClient, OFFICE_EMAIL, PHOTOG_PHONES } = deps;

  cron.schedule("0 3 * * *", async function runExpiry() {
    console.log("[job:expiry] Provisorium-Ablauf-Job gestartet");
    try {
      const flagResult = await getSetting("feature.backgroundJobs");
      if (!flagResult || !flagResult.value) {
        console.log("[job:expiry] feature.backgroundJobs=false, uebersprungen");
        return;
      }

      const pool = db.getPool ? db.getPool() : null;
      if (!pool) { console.warn("[job:expiry] DB nicht verfuegbar"); return; }

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
        console.log("[job:expiry] keine abgelaufenen Provisorien");
        return;
      }

      console.log("[job:expiry] abgelaufene Provisorien:", rows.length);

      for (const row of rows) {
        const orderNo = row.order_no;
        try {
          // Loader: gibt das Row-Objekt in normalisierter Form zurueck
          const loadOrder = async function() {
            return {
              orderNo,
              status: row.status,
              photographer: row.photographer || {},
              photographerEventId: row.photographer_event_id,
              officeEventId: row.office_event_id,
              schedule: row.schedule || {},
              billing: row.billing || {},
              address: row.address || "",
              services: row.services || {},
              pricing: row.pricing || {},
              object: row.object || {},
            };
          };

          // Zentrale Workflow-Engine: provisional -> pending via expiry_job
          const result = await changeOrderStatus(orderNo, "pending", {
            source: "expiry_job",
            actorId: "job:provisional-expiry",
            loadOrder,
          }, { db, getSetting, graphClient, OFFICE_EMAIL, PHOTOG_PHONES: PHOTOG_PHONES || {} });

          if (!result.success) {
            console.error("[job:expiry] changeOrderStatus fehlgeschlagen:", { orderNo, error: result.error, code: result.code });
            continue;
          }

          console.log("[job:expiry] Auftrag zurueck auf pending:", orderNo, { calendarResult: result.calendarResult });

          // Ablauf-Mail an Kunde (idempotent via email_send_log)
          if (mailOn && sendMail && row.billing && row.billing.email) {
            try {
              const vars = buildTemplateVars(row, {});
              await sendMailIdempotent(pool, "provisional_expired", row.billing.email, orderNo, vars, sendMail);
            } catch (mailErr) {
              console.error("[job:expiry] Ablauf-Mail fehlgeschlagen:", orderNo, mailErr && mailErr.message);
            }
          }
        } catch (err) {
          console.error("[job:expiry] Fehler bei Auftrag", orderNo, err && err.message);
        }
      }

      console.log("[job:expiry] Provisorium-Ablauf-Job abgeschlossen");
    } catch (err) {
      console.error("[job:expiry] Unerwarteter Fehler:", err && err.message);
    }
  }, { timezone: "Europe/Zurich" });

  console.log("[job:expiry] Provisorium-Ablauf-Job registriert (taeglich 03:00 Zuerich)");
}

module.exports = { scheduleProvisionalExpiry };
