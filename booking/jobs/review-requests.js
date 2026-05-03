/**
 * jobs/review-requests.js
 * Taeglich 10:00 Zuerich: Review-Anfragen fuer abgeschlossene Auftraege.
 * Nur aktiv wenn feature.autoReviewRequest=true.
 * Phase 3: Mail-Versand aktiv.
 * Idempotent: prueft review_request_count und review_request_sent_at.
 *
 * Versand-Logik:
 *   1. Erste Anfrage: review_request_count=0, done_at >= Wartezeit
 *   2. Einmalige Erinnerung: review_request_count=1, letzte Mail 14–60 Tage her,
 *      noch keine interne Bewertung abgegeben
 *   3. Kein weiterer Versand wenn review_request_count >= 2 oder Mail > 60 Tage alt
 */

"use strict";

const crypto = require("crypto");
const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");
const { buildTemplateVars, sendMailIdempotent, normalizeMailSendResult } = require("../template-renderer");

// Erinnerungsabstand: fruehestens nach 14 Tagen (in Sekunden fuer SQL-Interval)
const REMINDER_MIN_DAYS = 14;
// 60-Tage-Sperre: kein Versand mehr wenn letzte Mail aelter als 60 Tage
const REMINDER_MAX_DAYS = 60;

function scheduleReviewRequests(deps) {
  const { db, getSetting, sendMail, createPortalMagicLink } = deps;
  const pool = db.getPool ? db.getPool() : null;

  scheduleSafeCronJob({
    name: "review-requests",
    cron: "0 10 * * *",
    pool,
    timezone: "Europe/Zurich",
    run: async (ctx) => {
      ctx.log("Review-Anfrage-Job gestartet");
      const flagResult = await getSetting("feature.autoReviewRequest");
      if (!flagResult || !flagResult.value) {
        ctx.log("feature.autoReviewRequest=false, uebersprungen");
        return;
      }

      if (!pool) { ctx.warn("DB nicht verfuegbar"); return; }

      const delayResult = await getSetting("workflow.reviewRequestDelayHours");
      const delayHours = Number((delayResult && delayResult.value) || 120);
      const delayMs = delayHours * 60 * 60 * 1000;
      const threshold = new Date(Date.now() - delayMs).toISOString();

      // Erste Anfragen: noch nie gesendet, Wartezeit abgelaufen
      const { rows: firstRows } = await pool.query(
        `SELECT order_no, done_at, billing, address, services, pricing, photographer, schedule, review_request_count, review_request_sent_at
         FROM orders
         WHERE status='done'
           AND review_request_sent_at IS NULL
           AND review_request_count = 0
           AND done_at IS NOT NULL
           AND done_at <= $1`,
        [threshold]
      );

      // Erinnerungen: genau 1x gesendet, 14–60 Tage her, noch keine interne Bewertung,
      // und kein Google-Flag gesetzt (google_review_left IS NOT TRUE).
      // Abstaende als parametrisierte Intervalle uebergeben (in Tagen als Integer).
      const { rows: reminderRows } = await pool.query(
        `SELECT o.order_no, o.done_at, o.billing, o.address, o.services, o.pricing, o.photographer, o.schedule, o.review_request_count, o.review_request_sent_at
         FROM orders o
         WHERE o.status='done'
           AND o.review_request_count = 1
           AND o.review_request_sent_at IS NOT NULL
           AND o.review_request_sent_at <= NOW() - ($1 || ' days')::interval
           AND o.review_request_sent_at >= NOW() - ($2 || ' days')::interval
           AND NOT EXISTS (
             SELECT 1 FROM order_reviews r
             WHERE r.order_no = o.order_no AND r.submitted_at IS NOT NULL
           )
           AND NOT EXISTS (
             SELECT 1 FROM order_reviews r
             WHERE r.order_no = o.order_no AND r.google_review_left = TRUE
           )`,
        [REMINDER_MIN_DAYS, REMINDER_MAX_DAYS]
      );

      const rows = [...firstRows, ...reminderRows];

      if (!rows.length) {
        ctx.log("keine faelligen Review-Anfragen");
        return;
      }

      ctx.log("faellige Review-Anfragen:", firstRows.length, "erste,", reminderRows.length, "Erinnerungen");
      const mailEnabled = await getSetting("feature.emailTemplatesOnStatusChange");
      const mailOn = !!(mailEnabled && mailEnabled.value);
      const frontendUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
      const googleReviewLink = "https://g.page/r/CSQ5RnWmJOumEAE/review";
      const companyName = process.env.COMPANY_NAME || "Propus";

      for (const row of rows) {
        const isReminder = row.review_request_count === 1;
        // ctx.perRow faengt Per-Row-Fehler ab — 1 bad-record blockiert nicht
        // den ganzen Batch.
        await ctx.perRow(row, async (r) => {
          const token = crypto.randomBytes(32).toString("base64url");
          await pool.query(
            "INSERT INTO order_reviews (order_no, token) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            [r.order_no, token]
          );
          const reviewLink = frontendUrl + "/review/" + token;

          let mailSent = false;
          let mailReason = "mail_disabled_or_missing_recipient";
          if (mailOn && sendMail && r.billing && r.billing.email) {
            const reviewMagicLink = createPortalMagicLink
              ? await createPortalMagicLink(r.billing || {}, { sessionDays: 30, returnTo: "/portal/dashboard" }).catch(() => null)
              : null;
            const vars = buildTemplateVars(r, { reviewLink, googleReviewLink, companyName, portalMagicLink: reviewMagicLink || "" });
            const templateKey = isReminder ? "review_reminder" : "review_request";
            const result = await sendMailIdempotent(
              pool, templateKey, r.billing.email, r.order_no, vars, sendMail
            );
            if (result && result.sent === true) {
              mailSent = true;
              mailReason = "sent";
            } else if (!result.sent && result.reason === "template_not_found") {
              const subject = isReminder
                ? "Haben Sie uns auf Google bewertet? Wir wuerden uns freuen!"
                : "Wie hat Ihnen Ihr Shooting bei " + companyName + " gefallen?";
              const html = "<p>Guten Tag " + (r.billing.name || "") + ",</p>"
                + "<p>Ihr Feedback ist uns sehr wichtig. Wir wuerden uns freuen, wenn Sie kurz eine Bewertung hinterlassen:</p>"
                + "<p><a href=\"" + reviewLink + "\">Jetzt bewerten (1–5 Sterne)</a></p>"
                + "<p><a href=\"" + googleReviewLink + "\">Auf Google bewerten</a></p>"
                + "<p>Herzliche Gruesse<br>Ihr " + companyName + "-Team</p>";
              const text = "Jetzt bewerten: " + reviewLink + "\nAuf Google bewerten: " + googleReviewLink;
              const fallbackResult = normalizeMailSendResult(await sendMail(r.billing.email, subject, html, text));
              if (fallbackResult.sent) {
                mailSent = true;
                mailReason = "fallback_sent";
                ctx.log("Fallback-Mail gesendet fuer Auftrag", r.order_no, isReminder ? "(Erinnerung)" : "(erste Anfrage)");
              } else {
                mailReason = fallbackResult.reason || "fallback_send_not_confirmed";
              }
            } else {
              mailReason = result && result.reason ? result.reason : "send_not_confirmed";
            }
          } else {
            ctx.log("Review-Link:", reviewLink, "(Mail-Flag:", mailOn, ")");
          }

          if (mailSent) {
            await pool.query(
              "UPDATE orders SET review_request_sent_at=NOW(), review_request_count=review_request_count+1, updated_at=NOW() WHERE order_no=$1",
              [r.order_no]
            );
          } else {
            ctx.warn("Marker nicht gesetzt, Versand nicht bestaetigt", { orderNo: r.order_no, isReminder, reason: mailReason });
          }
        });
      }

      ctx.log("Review-Anfrage-Job abgeschlossen");
    },
  });
}

module.exports = { scheduleReviewRequests };