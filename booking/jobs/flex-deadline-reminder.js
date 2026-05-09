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

/**
 * (jahr, monat, tag) eines Date-Objekts in Europe/Zurich via
 * Intl.formatToParts — engine-stabil, anders als toLocaleDateString-Output.
 */
function chDateParts(d) {
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t) => {
    const p = parts.find((x) => x.type === t);
    return p ? p.value : "";
  };
  const y = Number(get("year"));
  const m = Number(get("month"));
  const day = Number(get("day"));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null;
  return { y, m, day };
}

/**
 * Vorzeichen-behaftete Differenz in Kalendertagen (Europe/Zurich):
 *  - positiv: Deadline in zukünftigen Kalendertagen
 *  - 0:       Deadline ist heute
 *  - negativ: Deadline überfällig
 *
 * Mitternacht-zu-Mitternacht-Vergleich via Date.UTC (keine Locale-Annahmen).
 */
function daysUntil(iso) {
  if (!iso) return null;
  const target = chDateParts(new Date(iso));
  const today = chDateParts(new Date());
  if (!target || !today) return null;
  const targetMidnight = Date.UTC(target.y, target.m - 1, target.day);
  const todayMidnight = Date.UTC(today.y, today.m - 1, today.day);
  return Math.round((targetMidnight - todayMidnight) / (24 * 60 * 60 * 1000));
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

      // Auftraege deren Deadline in <= 7 Kalendertagen liegt (Europe/Zurich),
      // noch ohne Reminder. Vergangenheits-Deadlines werden ebenfalls
      // eingeschlossen — das Office soll explizit gewarnt werden, falls eine
      // Disposition versaeumt wurde.
      //
      // Cutoff exklusiv: Deadline-Kalendertag (Zurich) muss kleiner sein als
      // Heute_Zurich + 8 → erfasst alle Deadlines bis Ende des 7. Tages. Die
      // Vergleichsbasis liegt in Postgres mit `AT TIME ZONE 'Europe/Zurich'`,
      // damit Sommer-/Winterzeit und UTC-Drift korrekt berücksichtigt werden.
      const { rows } = await pool.query(
        `SELECT order_no, deadline_at, flexible_earliest_at, billing, address, services, photographer, schedule
         FROM orders
         WHERE booking_kind = 'flexible'
           AND status = 'disposition_offen'
           AND flex_deadline_reminder_sent_at IS NULL
           AND deadline_at IS NOT NULL
           AND (deadline_at AT TIME ZONE 'Europe/Zurich')::date
               < ((NOW() AT TIME ZONE 'Europe/Zurich')::date + 8)`,
      );

      for (const row of rows) {
        await ctx.perRow(row, async (r) => {
          const days = daysUntil(r.deadline_at);
          const adminBase = process.env.ADMIN_BASE_URL || "https://admin-booking.propus.ch";
          // Vorzeichen-Auswertung: bei negativen Tagen ueberfaellig, sonst
          // "noch X Tage" / "heute". Ergebnis kommt als String ins Template
          // damit die Mail-Vorlage keine Zahlen-Logik braucht.
          let daysUntilLabel;
          if (days === null) {
            daysUntilLabel = "?";
          } else if (days < 0) {
            const overdue = Math.abs(days);
            daysUntilLabel = overdue === 1 ? "überfällig (seit 1 Tag)" : `überfällig (seit ${overdue} Tagen)`;
          } else if (days === 0) {
            daysUntilLabel = "heute fällig";
          } else if (days === 1) {
            daysUntilLabel = "morgen fällig";
          } else {
            daysUntilLabel = `noch ${days} Tage`;
          }
          // SQL row has snake_case `order_no`, aber buildTemplateVars liest
          // nur `order.orderNo` (camelCase). Im extras-override mappen, sonst
          // bliebe {{orderNo}} im gerenderten Template leer.
          const vars = buildTemplateVars(r, {
            orderNo: String(r.order_no || ""),
            deadlineDate: formatDeCH(r.deadline_at),
            flexibleEarliestDate: r.flexible_earliest_at ? formatDeCH(r.flexible_earliest_at) : "—",
            daysUntilDeadline: daysUntilLabel,
            adminOrderLink: `${adminBase.replace(/\/$/, "")}/orders/${r.order_no}/termin`,
          });
          const sendFn = (to, subj, html, text) => sendMail(to, subj, html, text, null);
          const result = await sendMailIdempotent(
            pool, "flex_deadline_office_reminder", OFFICE_EMAIL, r.order_no, vars, sendFn,
          );

          // sendMailIdempotent kann `{sent:false, reason:"already_sent"}` liefern,
          // wenn `email_send_log` bereits einen Eintrag hat. Ohne DB-Marker
          // wuerde der Cron stuendlich erneut anlaufen, jedes Mal "already_sent"
          // bekommen und nie den DB-Marker setzen → Endlosschleife in den Logs.
          // Beide Erfolgs-Faelle (frischer Versand + idempotent uebersprungen)
          // setzen den Marker.
          const sendOk = !!(result && (result.sent === true || result.reason === "already_sent"));
          if (sendOk) {
            await pool.query(
              `UPDATE orders SET flex_deadline_reminder_sent_at=NOW(), updated_at=NOW()
               WHERE order_no=$1
                 AND booking_kind='flexible'
                 AND status='disposition_offen'
                 AND flex_deadline_reminder_sent_at IS NULL`,
              [r.order_no],
            );
            ctx.log("flex-deadline-reminder marker gesetzt", {
              orderNo: r.order_no,
              days,
              reason: result && result.reason ? result.reason : "sent",
            });
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
