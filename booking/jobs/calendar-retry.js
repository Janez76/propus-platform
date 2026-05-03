/**
 * jobs/calendar-retry.js
 * Stuendlich: Fehlgeschlagene Calendar-Event-Deletes aus der calendar_delete_queue erneut versuchen.
 *
 * Exponentieller Backoff: 1h, 2h, 4h, 8h, 16h (max. 5 Versuche).
 * Nach 5 Fehlversuchen bleibt der Eintrag stehen und muss manuell geprueft werden.
 *
 * Nutzt scheduleSafeCronJob (core/lib/safe-cron-job.js) fuer Distributed-
 * Lock + Skip-on-overlap + Per-Row-Error-Boundary.
 */

"use strict";

const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");

/**
 * @param {object} deps - { db, graphClient }
 */
function scheduleCalendarRetry(deps) {
  const { db, graphClient } = deps;
  const pool = db && typeof db.getPool === "function" ? db.getPool() : null;

  scheduleSafeCronJob({
    name: "calendar-retry",
    cron: "5 * * * *",
    pool,
    timezone: process.env.TIMEZONE || "Europe/Zurich",
    run: async (ctx) => {
      ctx.log("Calendar-Delete-Retry-Job gestartet");
      if (!pool) { ctx.warn("Kein DB-Pool verfuegbar, uebersprungen"); return; }
      if (!graphClient) { ctx.warn("graphClient nicht verfuegbar, uebersprungen"); return; }

      let rows;
      try {
        const result = await pool.query(
          `SELECT id, order_no, event_type, event_id, user_email, attempts
           FROM calendar_delete_queue
           WHERE done_at IS NULL AND attempts < 5 AND next_retry_at <= NOW()
           ORDER BY next_retry_at ASC
           LIMIT 20`
        );
        rows = result.rows;
      } catch (err) {
        ctx.error("Queue-Abfrage fehlgeschlagen:", err && err.message);
        return;
      }

      if (!rows.length) { ctx.log("Keine ausstehenden Retry-Eintraege"); return; }
      ctx.log("Verarbeite", rows.length, "Eintrag/Eintraege");

      for (const row of rows) {
        await ctx.perRow(row, async (r) => {
          try {
            await graphClient.api("/users/" + r.user_email + "/events/" + r.event_id).delete();

            // Erfolg: Eintrag als erledigt markieren
            await pool.query("UPDATE calendar_delete_queue SET done_at = NOW() WHERE id = $1", [r.id]);

            // Event-ID in der orders-Tabelle nullen + calendar_sync_status korrigieren
            const eventIdField = r.event_type === "photographer" ? "photographer_event_id" : "office_event_id";
            try {
              await db.updateOrderFields(Number(r.order_no), {
                [eventIdField]: null,
                calendar_sync_status: "deleted",
              });
            } catch (dbErr) {
              ctx.error("DB-Update nach Erfolg fehlgeschlagen", { orderNo: r.order_no, error: dbErr && dbErr.message });
            }

            ctx.log("Retry erfolgreich", { orderNo: r.order_no, eventType: r.event_type, eventId: r.event_id });

          } catch (err) {
            const isGone = err && (err.statusCode === 404);
            if (isGone) {
              // 404 = Event existiert nicht mehr, gilt als erledigt
              await pool.query("UPDATE calendar_delete_queue SET done_at = NOW() WHERE id = $1", [r.id]);
              const eventIdField = r.event_type === "photographer" ? "photographer_event_id" : "office_event_id";
              try {
                await db.updateOrderFields(Number(r.order_no), {
                  [eventIdField]: null,
                  calendar_sync_status: "deleted",
                });
              } catch (_dbErr) { /* ignorieren */ }
              ctx.log("Event bereits geloescht (404), als done markiert", { orderNo: r.order_no, eventType: r.event_type });
            } else {
              // Noch ein Fehler: Backoff erhoehen
              const attempts = r.attempts + 1;
              const backoffMs = Math.pow(2, attempts) * 60 * 60 * 1000;
              const nextRetryAt = new Date(Date.now() + backoffMs);
              const lastError = String(err && err.message || err).slice(0, 500);
              try {
                await pool.query(
                  `UPDATE calendar_delete_queue
                   SET attempts = $1, last_error = $2, next_retry_at = $3
                   WHERE id = $4`,
                  [attempts, lastError, nextRetryAt, r.id]
                );
              } catch (updateErr) {
                ctx.error("Queue-Update fehlgeschlagen", { id: r.id, error: updateErr && updateErr.message });
              }
              ctx.error("Retry fehlgeschlagen, naechster Versuch in", Math.pow(2, attempts) + "h", {
                orderNo: r.order_no,
                eventType: r.event_type,
                attempts,
                error: lastError,
              });
            }
          }
        });
      }

      ctx.log("Job abgeschlossen");
    },
  });
}

module.exports = { scheduleCalendarRetry };
