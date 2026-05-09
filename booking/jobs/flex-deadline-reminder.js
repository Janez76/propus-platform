/**
 * jobs/flex-deadline-reminder.js
 * Mailt das Office einmalig, wenn ein flexibler Auftrag (booking_kind='flexible',
 * status='disposition_offen') seine Deadline innerhalb von 7 Tagen erreicht.
 *
 * - Cron: stuendlich (00 *).
 * - Idempotent: pro Auftrag wird flex_deadline_reminder_sent_at gesetzt; weitere
 *   Mails werden uebersprungen. Vor dem DB-Update prueft sendMailIdempotent
 *   zusaetzlich email_send_log.
 * - Mail-Versand hinter feature.emailTemplatesOnStatusChange (kein
 *   neuer Flag noetig, da reine Office-Notification).
 *
 * @param {object} deps - { db, getSetting, sendMail, OFFICE_EMAIL }
 */

"use strict";

const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");
const { buildTemplateVars, sendMailIdempotent } = require("../template-renderer");

function formatDeCH(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysUntil(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000)));
}

function scheduleFlexDeadlineReminder(deps) {
  const { db, getSetting, sendMail, OFFICE_EMAIL } = deps;
  const pool = db && typeof db.getPool === "function" ? db.getPool() : null;

  return scheduleSafeCronJob({
    name: "flex-deadline-reminder",
    cron: "0 * * * *",
    pool,
    timezone: "Europe/Zurich",
    run: async (ctx) => {
      ctx.log("Flex-Deadline-Reminder-Job gestartet");

      const flag = await getSetting("feature.backgroundJobs");
      if (!flag || !flag.value) {
        ctx.log("feature.backgroundJobs=false, uebersprungen");
        return;
      }
      if (!pool) { ctx.warn("DB nicht verfuegbar"); return; }
      if (!OFFICE_EMAIL) { ctx.warn("OFFICE_EMAIL nicht konfiguriert"); return; }

      const mailFlag = await getSetting("feature.emailTemplatesOnStatusChange");
      const mailOn = !!(mailFlag && mailFlag.value);
      if (!mailOn) { ctx.log("emailTemplatesOnStatusChange=false, uebersprungen"); return; }
      if (!sendMail) { ctx.warn("sendMail nicht verfuegbar"); return; }

      // Auftraege deren Deadline in <= 7 Tagen liegt, noch ohne Reminder.
      // Vergangenheits-Deadlines werden ebenfalls eingeschlossen — das Office
      // soll explizit gewarnt werden, falls eine Disposition versaeumt wurde.
      const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const { rows } = await pool.query(
        `SELECT order_no, deadline_at, flexible_earliest_at, billing, address, services, photographer, schedule
         FROM orders
         WHERE booking_kind = 'flexible'
           AND status = 'disposition_offen'
           AND flex_deadline_reminder_sent_at IS NULL
           AND deadline_at IS NOT NULL
           AND deadline_at <= $1`,
        [sevenDaysFromNow],
      );

      for (const row of rows) {
        await ctx.perRow(row, async (r) => {
          const days = daysUntil(r.deadline_at);
          const adminBase = process.env.ADMIN_BASE_URL || "https://admin-booking.propus.ch";
          const vars = buildTemplateVars(r, {
            deadlineDate: formatDeCH(r.deadline_at),
            flexibleEarliestDate: r.flexible_earliest_at ? formatDeCH(r.flexible_earliest_at) : "—",
            daysUntilDeadline: days === null ? "?" : String(days),
            adminOrderLink: `${adminBase.replace(/\/$/, "")}/orders/${r.order_no}/termin`,
          });
          const sendFn = (to, subj, html, text) => sendMail(to, subj, html, text, null);
          const result = await sendMailIdempotent(
            pool, "flex_deadline_office_reminder", OFFICE_EMAIL, r.order_no, vars, sendFn,
          );

          if (result && result.sent === true) {
            await pool.query(
              `UPDATE orders SET flex_deadline_reminder_sent_at=NOW(), updated_at=NOW()
               WHERE order_no=$1
                 AND booking_kind='flexible'
                 AND status='disposition_offen'
                 AND flex_deadline_reminder_sent_at IS NULL`,
              [r.order_no],
            );
            ctx.log("flex-deadline-reminder gesendet", { orderNo: r.order_no, days });
          } else {
            ctx.warn("flex-deadline-reminder nicht bestaetigt", {
              orderNo: r.order_no,
              reason: result && result.reason ? result.reason : "unknown",
            });
          }
        });
      }

      ctx.log("abgeschlossen", { kandidaten: rows.length });
    },
  });
}

module.exports = { scheduleFlexDeadlineReminder };
