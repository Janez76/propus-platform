/**
 * jobs/provisional-reminders.js
 * Stuendlich: Reminder-Mails fuer Provisorien versenden.
 *  - Reminder 1: 24h nach provisional_booked_at  → Template: provisional_reminder_1
 *  - Reminder 2: 48h nach provisional_booked_at  → Template: provisional_reminder_2
 *  - Reminder 3: 72h nach provisional_booked_at  → Template: provisional_reminder_3 (letzter Tag)
 *
 * Mail-Versand hinter feature.emailTemplatesOnStatusChange.
 * Idempotent: prueft _sent_at-Felder vor jedem Update.
 *
 * Nutzt scheduleSafeCronJob (Distributed-Lock + Per-Row-Boundary).
 */

"use strict";

const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");
const { buildTemplateVars, sendMailIdempotent } = require("../template-renderer");

/**
 * @param {object} deps - { db, getSetting, sendMail, OFFICE_EMAIL }
 */
function scheduleProvisionalReminders(deps) {
  const { db, getSetting, sendMail, OFFICE_EMAIL } = deps;
  const pool = db && typeof db.getPool === "function" ? db.getPool() : null;

  return scheduleSafeCronJob({
    name: "provisional-reminders",
    cron: "0 * * * *",
    pool,
    timezone: "Europe/Zurich",
    run: async (ctx) => {
      ctx.log("Provisorium-Reminder-Job gestartet");

      const flagResult = await getSetting("feature.backgroundJobs");
      if (!flagResult || !flagResult.value) {
        ctx.log("feature.backgroundJobs=false, uebersprungen");
        return;
      }

      if (!pool) { ctx.warn("DB nicht verfuegbar"); return; }

      const mailEnabled = await getSetting("feature.emailTemplatesOnStatusChange");
      const mailOn = !!(mailEnabled && mailEnabled.value);

      const now = new Date();

      // Hilfsfunktion: Mail idempotent senden + DB-Marker setzen
      async function sendReminder(row, templateKey, sentAtColumn) {
        if (!(mailOn && sendMail && row.billing && row.billing.email)) {
          ctx.log(templateKey, "faellig:", row.order_no, mailOn ? "(kein Mail-Empfaenger)" : "(Mail-Flag off)");
          return { sent: false, reason: "mail_disabled_or_missing_recipient" };
        }

        const vars = buildTemplateVars(row, {
          provisionalExpiresDate: row.provisional_expires_at
            ? new Date(row.provisional_expires_at).toLocaleDateString("de-CH", {
                timeZone: "Europe/Zurich",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })
            : "",
        });
        const result = await sendMailIdempotent(
          pool, templateKey, row.billing.email, row.order_no, vars, sendMail
        );

        if (result && result.sent === true) {
          await pool.query(
            `UPDATE orders SET ${sentAtColumn}=NOW(), updated_at=NOW() WHERE order_no=$1 AND status='provisional' AND ${sentAtColumn} IS NULL`,
            [row.order_no]
          );
          ctx.log("marker gesetzt", { orderNo: row.order_no, templateKey, sentAtColumn });
          return { sent: true };
        }

        ctx.warn("marker nicht gesetzt, Versand nicht bestaetigt", {
          orderNo: row.order_no,
          templateKey,
          reason: result && result.reason ? result.reason : "unknown",
        });
        return { sent: false, reason: result && result.reason ? result.reason : "send_not_confirmed" };
      }

      // Reminder 1: >= 24h nach Buchung, noch nicht gesendet
      const r1Threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { rows: r1Rows } = await pool.query(
        `SELECT order_no, provisional_booked_at, provisional_expires_at, billing, address, services, pricing, photographer, schedule, confirmation_token
         FROM orders
         WHERE status='provisional'
           AND provisional_reminder_1_sent_at IS NULL
           AND provisional_booked_at IS NOT NULL
           AND provisional_booked_at <= $1`,
        [r1Threshold]
      );
      for (const row of r1Rows) {
        await ctx.perRow(row, async (r) => {
          await sendReminder(r, "provisional_reminder_1", "provisional_reminder_1_sent_at");
        });
      }

      // Reminder 2: >= 48h nach Buchung, Reminder-1 bereits gesendet, Reminder-2 noch nicht
      const r2Threshold = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const { rows: r2Rows } = await pool.query(
        `SELECT order_no, provisional_booked_at, provisional_expires_at, billing, address, services, pricing, photographer, schedule, confirmation_token
         FROM orders
         WHERE status='provisional'
           AND provisional_reminder_2_sent_at IS NULL
           AND provisional_reminder_1_sent_at IS NOT NULL
           AND provisional_booked_at IS NOT NULL
           AND provisional_booked_at <= $1`,
        [r2Threshold]
      );
      for (const row of r2Rows) {
        await ctx.perRow(row, async (r) => {
          await sendReminder(r, "provisional_reminder_2", "provisional_reminder_2_sent_at");
        });
      }

      // Reminder 3: >= 72h nach Buchung (letzter Tag)
      const r3Threshold = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
      const { rows: r3Rows } = await pool.query(
        `SELECT order_no, provisional_booked_at, provisional_expires_at, billing, address, services, pricing, photographer, schedule, confirmation_token
         FROM orders
         WHERE status='provisional'
           AND provisional_reminder_3_sent_at IS NULL
           AND provisional_reminder_2_sent_at IS NOT NULL
           AND provisional_booked_at IS NOT NULL
           AND provisional_booked_at <= $1`,
        [r3Threshold]
      );
      for (const row of r3Rows) {
        await ctx.perRow(row, async (r) => {
          await sendReminder(r, "provisional_reminder_3", "provisional_reminder_3_sent_at");
          // Büro einmalig beim letzten Reminder (Tag 3) benachrichtigen
          if (mailOn && sendMail && OFFICE_EMAIL) {
            const vars = buildTemplateVars(r, {});
            const sendFn = function(to, subj, html, text) { return sendMail(to, subj, html, text, null); };
            await sendMailIdempotent(pool, "office_provisional_expiry_notice", OFFICE_EMAIL, r.order_no, vars, sendFn)
              .catch(function(e) {
                ctx.error("office_provisional_expiry_notice fehlgeschlagen:", r.order_no, e && e.message);
              });
          }
        });
      }

      const total = r1Rows.length + r2Rows.length + r3Rows.length;
      ctx.log("abgeschlossen. Reminder-1:", r1Rows.length, "Reminder-2:", r2Rows.length, "Reminder-3:", r3Rows.length, "total:", total);
    },
  });
}

module.exports = { scheduleProvisionalReminders };
