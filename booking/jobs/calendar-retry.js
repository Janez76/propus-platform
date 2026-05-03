/**
 * jobs/calendar-retry.js
 * Stuendlich: Fehlgeschlagene Calendar-Event-Deletes aus der calendar_delete_queue erneut versuchen.
 *
 * Exponentieller Backoff: 2h, 4h, 8h, 16h, 32h (max. 5 Versuche; Formel: 2^(attempt+1)h).
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

  return scheduleSafeCronJob({
    name: "calendar-retry",
    cron: "5 * * * *",
    pool,
    timezone: process.env.TIMEZONE || "Europe/Zurich",
    run: async (ctx) => {
      ctx.log("Calendar-Delete-Retry-Job gestartet");
      if (!pool) { ctx.warn("Kein DB-Pool verfuegbar, uebersprungen"); return; }
      if (!graphClient) { ctx.warn("graphClient nicht verfuegbar, uebersprungen"); return; }

      /**
       * Retry-Bookkeeping: erhoeht attempts, setzt last_error + next_retry_at
       * mit exponentiellem Backoff (2h, 4h, 8h, 16h, 32h). Nutzt die Methode
       * fuer alle Fehlerpfade — Graph-API-Failures, DB-Update-Failures im
       * 404-Branch, alles. Honoriert die dokumentierte max-5-Versuche-Regel.
       */
      async function recordRetry(r, err) {
        const attempts = r.attempts + 1;
        const backoffMs = Math.pow(2, attempts) * 60 * 60 * 1000;
        const nextRetryAt = new Date(Date.now() + backoffMs);
        const lastError = String(err && err.message || err).slice(0, 500);
        try {
          await pool.query(
            `UPDATE calendar_delete_queue
             SET attempts = $1, last_error = $2, next_retry_at = $3
             WHERE id = $4`,
            [attempts, lastError, nextRetryAt, r.id],
          );
        } catch (updateErr) {
          ctx.error("Queue-Update fehlgeschlagen", { id: r.id, error: updateErr && updateErr.message });
        }
        return { attempts, lastError };
      }

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
          // Helper: Order-Cleanup + done_at-Marker. Bei DB-Fehler in einem
          // der beiden Schritte → Retry-Bookkeeping (Backoff/Max-Attempts).
          // Reihenfolge: erst updateOrderFields, dann done_at — sonst koennte
          // ein durchgefuehrter Calendar-Delete mit nicht-genulltem
          // photographer_event_id zurueckbleiben (CodeRabbit Major).
          async function finalizeAsDone() {
            const eventIdField = r.event_type === "photographer" ? "photographer_event_id" : "office_event_id";
            try {
              await db.updateOrderFields(Number(r.order_no), {
                [eventIdField]: null,
                calendar_sync_status: "deleted",
              });
              await pool.query("UPDATE calendar_delete_queue SET done_at = NOW() WHERE id = $1", [r.id]);
              return { ok: true };
            } catch (dbErr) {
              const { attempts, lastError } = await recordRetry(r, dbErr);
              ctx.error("DB-Cleanup fehlgeschlagen, retry-Bookkeeping aktualisiert", {
                orderNo: r.order_no,
                attempts,
                error: lastError,
              });
              return { ok: false };
            }
          }

          try {
            await graphClient.api("/users/" + r.user_email + "/events/" + r.event_id).delete();
            const fin = await finalizeAsDone();
            if (fin.ok) {
              ctx.log("Retry erfolgreich", { orderNo: r.order_no, eventType: r.event_type, eventId: r.event_id });
            }
          } catch (err) {
            const isGone = err && (err.statusCode === 404);
            if (isGone) {
              // 404 = Event existiert nicht mehr → gilt als erledigt.
              // finalizeAsDone uebernimmt Order-Cleanup + done_at; bei
              // DB-Fehler wird Retry-Bookkeeping aktualisiert.
              const fin = await finalizeAsDone();
              if (fin.ok) {
                ctx.log("Event bereits geloescht (404), als done markiert", { orderNo: r.order_no, eventType: r.event_type });
              }
            } else {
              // Graph-API-Fehler: regulaeres Retry-Bookkeeping.
              const { attempts, lastError } = await recordRetry(r, err);
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
