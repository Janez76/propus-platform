/**
 * jobs/confirmation-pending.js
 * Stuendlich: Bestellungen die >24h im Status "pending" warten und einen
 * confirmation_token haben, werden auf "provisional" hochgestuft.
 *
 * Ablauf (via changeOrderStatus):
 *  1. Status-Transition pending -> provisional ueber zentrale Workflow-Engine
 *  2. Provisorischer Kalender-Block wird in changeOrderStatus erstellt
 *  3. Provisorium-Felder werden von changeOrderStatus gesetzt
 *  4. E-Mails werden im Job gesendet (ausserhalb Workflow-Engine)
 *
 * Idempotent: prueft status='pending' + confirmation_pending_since IS NOT NULL + age > 24h.
 */

"use strict";

const cron = require("node-cron");
const { buildTemplateVars, sendMailIdempotent, sendAttendeeNotifications } = require("../template-renderer");
const { changeOrderStatus } = require("../order-status-workflow");
const { calcProvisionalExpiresAt } = require("../state-machine");

/**
 * @param {object} deps - { db, getSetting, sendMail, graphClient, OFFICE_EMAIL, PHOTOG_PHONES }
 */
function scheduleConfirmationPending(deps) {
  const { db, getSetting, sendMail, graphClient, OFFICE_EMAIL, PHOTOG_PHONES } = deps;

  cron.schedule("15 * * * *", async function runPendingConfirmation() {
    console.log("[job:confirmation-pending] Job gestartet");
    try {
      const flagResult = await getSetting("feature.backgroundJobs");
      if (!flagResult || !flagResult.value) {
        console.log("[job:confirmation-pending] feature.backgroundJobs=false, uebersprungen");
        return;
      }

      const pool = db.getPool ? db.getPool() : null;
      if (!pool) { console.warn("[job:confirmation-pending] DB nicht verfuegbar"); return; }

      const mailEnabled = await getSetting("feature.emailTemplatesOnStatusChange");
      const mailOn = !!(mailEnabled && mailEnabled.value);

      const { rows } = await pool.query(
        `SELECT order_no, status, billing, address, services, pricing, photographer, schedule,
                photographer_event_id, office_event_id, attendee_emails, object
         FROM orders
         WHERE status = 'pending'
           AND confirmation_pending_since IS NOT NULL
           AND confirmation_pending_since <= NOW() - INTERVAL '24 hours'`
      );

      if (!rows.length) {
        console.log("[job:confirmation-pending] keine Auftraege nach 24h ohne Bestaetigung");
        return;
      }

      console.log("[job:confirmation-pending] Auftraege nach 24h:", rows.length);

      for (const row of rows) {
        const orderNo = row.order_no;
        try {
          // Loader: gibt Row-Objekt in normalisierter Form zurueck
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

          // provisional_booked_at + expires_at im DB setzen (vor changeOrderStatus)
          // damit der Kalender-Effect die richtigen Daten hat
          const provisionalBooked = new Date();
          const provisionalExpires = calcProvisionalExpiresAt(provisionalBooked);
          try {
            await pool.query(
              `UPDATE orders
               SET provisional_booked_at = NOW(),
                   provisional_expires_at = $1,
                   provisional_reminder_1_sent_at = NULL,
                   provisional_reminder_2_sent_at = NULL,
                   provisional_reminder_3_sent_at = NULL,
                   confirmation_token = NULL,
                   confirmation_token_expires_at = NULL
               WHERE order_no = $2 AND status = 'pending'`,
              [provisionalExpires.toISOString(), orderNo]
            );
          } catch (preErr) {
            console.error("[job:confirmation-pending] Provisorium-Felder konnten nicht gesetzt werden:", orderNo, preErr && preErr.message);
          }

          // Zentrale Workflow-Engine: pending -> provisional
          const result = await changeOrderStatus(orderNo, "provisional", {
            source: "confirmation_job",
            actorId: "job:confirmation-pending",
            loadOrder,
          }, { db, getSetting, graphClient, OFFICE_EMAIL, PHOTOG_PHONES: PHOTOG_PHONES || {} });

          if (!result.success) {
            console.error("[job:confirmation-pending] changeOrderStatus fehlgeschlagen:", { orderNo, error: result.error, code: result.code });
            continue;
          }

          console.log("[job:confirmation-pending] Auftrag auf provisional gesetzt:", orderNo, { calendarResult: result.calendarResult });

          // E-Mails senden (ausserhalb Workflow-Engine gemaess Plan-Ausschluss)
          if (mailOn && sendMail) {
            const orderObj = {
              orderNo,
              address: row.address,
              billing: row.billing,
              services: row.services,
              pricing: row.pricing,
              photographer: row.photographer,
              schedule: row.schedule,
              status: "provisional",
              provisionalExpiresAt: provisionalExpires.toISOString(),
              attendeeEmails: row.attendee_emails,
            };
            const vars = buildTemplateVars(orderObj, {});
            const sendFn = function(to, subj, html, text) { return sendMail(to, subj, html, text, null); };
            const mailSummary = [];

            if (row.billing && row.billing.email) {
              const customerResult = await sendMailIdempotent(pool, "provisional_created", row.billing.email, orderNo, vars, sendFn)
                .catch(function(e) {
                  console.error("[job:confirmation-pending] provisional_created mail failed:", orderNo, e && e.message);
                  return { sent: false, reason: "send_error" };
                });
              mailSummary.push({ role: "customer", templateKey: "provisional_created", sent: customerResult && customerResult.sent === true, reason: customerResult && customerResult.reason ? customerResult.reason : null });
            }
            if (OFFICE_EMAIL) {
              const officeResult = await sendMailIdempotent(pool, "office_confirmation_pending_notice", OFFICE_EMAIL, orderNo, vars, sendFn)
                .catch(function(e) {
                  console.error("[job:confirmation-pending] office notice mail failed:", orderNo, e && e.message);
                  return { sent: false, reason: "send_error" };
                });
              mailSummary.push({ role: "office", templateKey: "office_confirmation_pending_notice", sent: officeResult && officeResult.sent === true, reason: officeResult && officeResult.reason ? officeResult.reason : null });
            }
            const attendeeResult = await sendAttendeeNotifications(pool, orderObj, "provisional", sendFn)
              .catch(function(e) {
                console.error("[job:confirmation-pending] attendee CC mail failed:", orderNo, e && e.message);
                return { sent: 0, skipped: 0, failed: 1 };
              });
            mailSummary.push({ role: "cc", templateKey: "attendee_notification", sent: (attendeeResult && attendeeResult.sent) || 0, skipped: (attendeeResult && attendeeResult.skipped) || 0, failed: (attendeeResult && attendeeResult.failed) || 0 });
            console.log("[job:confirmation-pending] Mail-Summary", { orderNo, mailSummary });
          }
        } catch (err) {
          console.error("[job:confirmation-pending] Fehler bei Auftrag", orderNo, err && err.message);
        }
      }

      console.log("[job:confirmation-pending] Job abgeschlossen");
    } catch (err) {
      console.error("[job:confirmation-pending] Unerwarteter Fehler:", err && err.message);
    }
  }, { timezone: "Europe/Zurich" });

  console.log("[job:confirmation-pending] Job registriert (stuendlich :15)");
}

module.exports = { scheduleConfirmationPending };
