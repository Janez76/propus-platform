/**
 * jobs/review-requests.js
 * Taeglich 10:00 Zuerich: Review-Anfragen fuer abgeschlossene Auftraege.
 * Nur aktiv wenn feature.autoReviewRequest=true.
 * Phase 3: Mail-Versand aktiv.
 * Idempotent: prueft review_request_count und review_request_sent_at.
 */

"use strict";

const cron = require("node-cron");
const crypto = require("crypto");
const { buildTemplateVars, sendMailIdempotent, normalizeMailSendResult } = require("../template-renderer");

function scheduleReviewRequests(deps) {
  const { db, getSetting, sendMail } = deps;

  cron.schedule("0 10 * * *", async function runReviews() {
    console.log("[job:reviews] Review-Anfrage-Job gestartet");
    try {
      const flagResult = await getSetting("feature.autoReviewRequest");
      if (!flagResult || !flagResult.value) {
        console.log("[job:reviews] feature.autoReviewRequest=false, uebersprungen");
        return;
      }

      const pool = db.getPool ? db.getPool() : null;
      if (!pool) { console.warn("[job:reviews] DB nicht verfuegbar"); return; }

      const delayResult = await getSetting("workflow.reviewRequestDelayHours");
      const delayHours = Number((delayResult && delayResult.value) || 120);
      const delayMs = delayHours * 60 * 60 * 1000;
      const threshold = new Date(Date.now() - delayMs).toISOString();

      const { rows } = await pool.query(
        "SELECT order_no, done_at, billing, address, services, pricing, photographer, schedule, review_request_count FROM orders WHERE status='done' AND review_request_sent_at IS NULL AND review_request_count = 0 AND done_at IS NOT NULL AND done_at <= $1",
        [threshold]
      );

      if (!rows.length) {
        console.log("[job:reviews] keine faelligen Review-Anfragen");
        return;
      }

      console.log("[job:reviews] faellige Review-Anfragen:", rows.length);
      const mailEnabled = await getSetting("feature.emailTemplatesOnStatusChange");
      const mailOn = !!(mailEnabled && mailEnabled.value);
      const frontendUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
      const googleReviewLink = "https://g.page/r/CSQ5RnWmJOumEAE/review";

      for (const row of rows) {
        try {
          const token = crypto.randomBytes(32).toString("base64url");
          await pool.query(
            "INSERT INTO order_reviews (order_no, token) VALUES ($1,$2) ON CONFLICT DO NOTHING",
            [row.order_no, token]
          );
          const reviewLink = frontendUrl + "/review/" + token;

          let mailSent = false;
          let mailReason = "mail_disabled_or_missing_recipient";
          if (mailOn && sendMail && row.billing && row.billing.email) {
            const vars = buildTemplateVars(row, { reviewLink, googleReviewLink });
            const result = await sendMailIdempotent(
              pool, "review_request", row.billing.email, row.order_no, vars, sendMail
            );
            if (result && result.sent === true) {
              mailSent = true;
              mailReason = "sent";
            } else if (!result.sent && result.reason === "template_not_found") {
              // Fallback wenn kein Template hinterlegt
              const subject = "Wie war Ihr Shooting? Auftrag #" + row.order_no;
              const html = "<p>Wir freuen uns ueber Ihr Feedback: <a href=" + reviewLink + ">Jetzt bewerten</a></p><p><a href=" + googleReviewLink + ">Google-Bewertung</a></p>";
              const fallbackResult = normalizeMailSendResult(await sendMail(row.billing.email, subject, html, ""));
              if (fallbackResult.sent) {
                mailSent = true;
                mailReason = "fallback_sent";
                console.log("[job:reviews] Fallback-Mail gesendet fuer Auftrag", row.order_no);
              } else {
                mailReason = fallbackResult.reason || "fallback_send_not_confirmed";
              }
            } else {
              mailReason = result && result.reason ? result.reason : "send_not_confirmed";
            }
          } else {
            console.log("[job:reviews] Review-Link:", reviewLink, "(Mail-Flag:", mailOn, ")");
          }

          if (mailSent) {
            await pool.query(
              "UPDATE orders SET review_request_sent_at=NOW(), review_request_count=review_request_count+1, updated_at=NOW() WHERE order_no=$1 AND review_request_count=0",
              [row.order_no]
            );
          } else {
            console.warn("[job:reviews] Marker nicht gesetzt, Versand nicht bestaetigt", { orderNo: row.order_no, reason: mailReason });
          }
        } catch (err) {
          console.error("[job:reviews] Fehler fuer Auftrag", row.order_no, err && err.message);
        }
      }

      console.log("[job:reviews] Review-Anfrage-Job abgeschlossen");
    } catch (err) {
      console.error("[job:reviews] Unerwarteter Fehler:", err && err.message);
    }
  }, { timezone: "Europe/Zurich" });

  console.log("[job:reviews] Review-Anfrage-Job registriert (taeglich 10:00 Zuerich)");
}

module.exports = { scheduleReviewRequests };