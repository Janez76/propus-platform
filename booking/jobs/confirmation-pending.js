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
 *
 * Nutzt scheduleSafeCronJob (Distributed-Lock + Per-Row-Boundary).
 */

"use strict";

const crypto = require("crypto");
const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");
const { buildTemplateVars, sendMailIdempotent, sendAttendeeNotifications } = require("../template-renderer");
const { changeOrderStatus } = require("../order-status-workflow");
const { calcProvisionalExpiresAt } = require("../state-machine");

/**
 * @param {object} deps - { db, getSetting, sendMail, graphClient, OFFICE_EMAIL, PHOTOG_PHONES }
 */
function scheduleConfirmationPending(deps) {
  const { db, getSetting, sendMail, graphClient, OFFICE_EMAIL, PHOTOG_PHONES, createPortalMagicLink } = deps;
  const pool = db && typeof db.getPool === "function" ? db.getPool() : null;

  scheduleSafeCronJob({
    name: "confirmation-pending",
    cron: "15 * * * *",
    pool,
    timezone: "Europe/Zurich",
    run: async (ctx) => {
      ctx.log("Job gestartet");

      const flagResult = await getSetting("feature.backgroundJobs");
      if (!flagResult || !flagResult.value) {
        ctx.log("feature.backgroundJobs=false, uebersprungen");
        return;
      }
      if (!pool) { ctx.warn("DB nicht verfuegbar"); return; }

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
        ctx.log("keine Auftraege nach 24h ohne Bestaetigung");
        return;
      }

      ctx.log("Auftraege nach 24h:", rows.length);

      for (const row of rows) {
        await ctx.perRow(row, async (r) => {
          const orderNo = r.order_no;
          // Loader: gibt Row-Objekt in normalisierter Form zurueck
          const loadOrder = async function() {
            return {
              orderNo,
              status: r.status,
              photographer: r.photographer || {},
              photographerEventId: r.photographer_event_id,
              officeEventId: r.office_event_id,
              schedule: r.schedule || {},
              billing: r.billing || {},
              address: r.address || "",
              services: r.services || {},
              pricing: r.pricing || {},
              object: r.object || {},
            };
          };

          // provisional_booked_at + expires_at im DB setzen (vor changeOrderStatus)
          const provisionalBooked = new Date();
          const provisionalExpires = calcProvisionalExpiresAt(provisionalBooked);
          const freshToken = crypto.randomBytes(32).toString("base64url");
          const tokenExpires = new Date(provisionalExpires.getTime());
          try {
            await pool.query(
              `UPDATE orders
               SET provisional_booked_at = NOW(),
                   provisional_expires_at = $1,
                   provisional_reminder_1_sent_at = NULL,
                   provisional_reminder_2_sent_at = NULL,
                   provisional_reminder_3_sent_at = NULL,
                   confirmation_token = $3,
                   confirmation_token_expires_at = $4
               WHERE order_no = $2 AND status = 'pending'`,
              [provisionalExpires.toISOString(), orderNo, freshToken, tokenExpires.toISOString()]
            );
          } catch (preErr) {
            ctx.error("Provisorium-Felder konnten nicht gesetzt werden:", orderNo, preErr && preErr.message);
          }

          // Zentrale Workflow-Engine: pending -> provisional
          const result = await changeOrderStatus(orderNo, "provisional", {
            source: "confirmation_job",
            actorId: "job:confirmation-pending",
            loadOrder,
          }, { db, getSetting, graphClient, OFFICE_EMAIL, PHOTOG_PHONES: PHOTOG_PHONES || {} });

          if (!result.success) {
            ctx.error("changeOrderStatus fehlgeschlagen:", { orderNo, error: result.error, code: result.code });
            return;
          }

          ctx.log("Auftrag auf provisional gesetzt:", orderNo, { calendarResult: result.calendarResult });

          // E-Mails senden (ausserhalb Workflow-Engine gemaess Plan-Ausschluss)
          if (mailOn && sendMail) {
            const orderObj = {
              orderNo,
              address: r.address,
              billing: r.billing,
              services: r.services,
              pricing: r.pricing,
              photographer: r.photographer,
              schedule: r.schedule,
              status: "provisional",
              provisionalExpiresAt: provisionalExpires.toISOString(),
              confirmationToken: freshToken,
              attendeeEmails: r.attendee_emails,
            };
            const provisionalMagicLink = createPortalMagicLink
              ? await createPortalMagicLink(r.billing || {}, { sessionDays: 30, returnTo: "/portal/dashboard" }).catch(() => null)
              : null;
            const vars = buildTemplateVars(orderObj, { portalMagicLink: provisionalMagicLink || "" });
            const sendFn = function(to, subj, html, text) { return sendMail(to, subj, html, text, null); };
            const mailSummary = [];

            if (r.billing && r.billing.email) {
              const customerResult = await sendMailIdempotent(pool, "provisional_created", r.billing.email, orderNo, vars, sendFn)
                .catch(function(e) {
                  ctx.error("provisional_created mail failed:", orderNo, e && e.message);
                  return { sent: false, reason: "send_error" };
                });
              mailSummary.push({ role: "customer", templateKey: "provisional_created", sent: customerResult && customerResult.sent === true, reason: customerResult && customerResult.reason ? customerResult.reason : null });
            }
            // Büro-Hinweis bei pending→provisional wird nicht mehr gesendet.
            const attendeeResult = await sendAttendeeNotifications(pool, orderObj, "provisional", sendFn)
              .catch(function(e) {
                ctx.error("attendee CC mail failed:", orderNo, e && e.message);
                return { sent: 0, skipped: 0, failed: 1 };
              });
            mailSummary.push({ role: "cc", templateKey: "attendee_notification", sent: (attendeeResult && attendeeResult.sent) || 0, skipped: (attendeeResult && attendeeResult.skipped) || 0, failed: (attendeeResult && attendeeResult.failed) || 0 });
            ctx.log("Mail-Summary", { orderNo, mailSummary });
          }
        });
      }

      ctx.log("Job abgeschlossen");
    },
  });
}

module.exports = { scheduleConfirmationPending };
