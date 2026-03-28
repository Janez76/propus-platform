/**
 * jobs/calendar-retry.js
 * Stuendlich: Fehlgeschlagene Calendar-Event-Deletes aus der calendar_delete_queue erneut versuchen.
 *
 * Exponentieller Backoff: 1h, 2h, 4h, 8h, 16h (max. 5 Versuche).
 * Nach 5 Fehlversuchen bleibt der Eintrag stehen und muss manuell geprueft werden.
 */

"use strict";

const cron = require("node-cron");

/**
 * @param {object} deps - { db, graphClient }
 */
function scheduleCalendarRetry(deps) {
  const { db, graphClient } = deps;

  cron.schedule("5 * * * *", async function runCalendarRetry() {
    console.log("[job:calRetry] Calendar-Delete-Retry-Job gestartet");
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) {
      console.log("[job:calRetry] Kein DB-Pool verfuegbar, uebersprungen");
      return;
    }
    if (!graphClient) {
      console.log("[job:calRetry] graphClient nicht verfuegbar, uebersprungen");
      return;
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
      console.error("[job:calRetry] Queue-Abfrage fehlgeschlagen:", err && err.message);
      return;
    }

    if (!rows.length) {
      console.log("[job:calRetry] Keine ausstehenden Retry-Eintraege");
      return;
    }

    console.log("[job:calRetry] Verarbeite", rows.length, "Eintrag/Eintraege");

    for (const row of rows) {
      try {
        await graphClient.api("/users/" + row.user_email + "/events/" + row.event_id).delete();

        // Erfolg: Eintrag als erledigt markieren
        await pool.query("UPDATE calendar_delete_queue SET done_at = NOW() WHERE id = $1", [row.id]);

        // Event-ID in der orders-Tabelle nullen + calendar_sync_status korrigieren
        const eventIdField = row.event_type === "photographer" ? "photographer_event_id" : "office_event_id";
        try {
          await db.updateOrderFields(Number(row.order_no), {
            [eventIdField]: null,
            calendar_sync_status: "deleted",
          });
        } catch (dbErr) {
          console.error("[job:calRetry] DB-Update nach Erfolg fehlgeschlagen", { orderNo: row.order_no, error: dbErr && dbErr.message });
        }

        console.log("[job:calRetry] Retry erfolgreich", { orderNo: row.order_no, eventType: row.event_type, eventId: row.event_id });

      } catch (err) {
        const isGone = err && (err.statusCode === 404);
        if (isGone) {
          // 404 = Event existiert nicht mehr, gilt als erledigt
          await pool.query("UPDATE calendar_delete_queue SET done_at = NOW() WHERE id = $1", [row.id]);
          const eventIdField = row.event_type === "photographer" ? "photographer_event_id" : "office_event_id";
          try {
            await db.updateOrderFields(Number(row.order_no), {
              [eventIdField]: null,
              calendar_sync_status: "deleted",
            });
          } catch (dbErr) { /* ignorieren */ }
          console.log("[job:calRetry] Event bereits geloescht (404), als done markiert", { orderNo: row.order_no, eventType: row.event_type });
        } else {
          // Noch ein Fehler: Backoff erhoehen
          const attempts = row.attempts + 1;
          // Exponentieller Backoff: 2^attempts Stunden (1h, 2h, 4h, 8h, 16h)
          const backoffMs = Math.pow(2, attempts) * 60 * 60 * 1000;
          const nextRetryAt = new Date(Date.now() + backoffMs);
          const lastError = String(err && err.message || err).slice(0, 500);
          try {
            await pool.query(
              `UPDATE calendar_delete_queue
               SET attempts = $1, last_error = $2, next_retry_at = $3
               WHERE id = $4`,
              [attempts, lastError, nextRetryAt, row.id]
            );
          } catch (updateErr) {
            console.error("[job:calRetry] Queue-Update fehlgeschlagen", { id: row.id, error: updateErr && updateErr.message });
          }
          console.error("[job:calRetry] Retry fehlgeschlagen, naechster Versuch in", Math.pow(2, attempts) + "h", {
            orderNo: row.order_no,
            eventType: row.event_type,
            attempts,
            error: lastError,
          });
        }
      }
    }

    console.log("[job:calRetry] Job abgeschlossen");
  }, {
    timezone: process.env.TIMEZONE || "Europe/Zurich"
  });

  console.log("[job:calRetry] Calendar-Delete-Retry-Job registriert (stuendlich :05)");
}

module.exports = { scheduleCalendarRetry };