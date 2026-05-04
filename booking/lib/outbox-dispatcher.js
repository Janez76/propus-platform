/**
 * Outbox-Dispatcher fuer booking.order_outbox.
 *
 * Pattern (siehe core/migrations/057_order_outbox.sql):
 *   1. App-Layer schreibt Side-Effect-Beschreibungen in derselben Tx wie
 *      die Order-Mutation (siehe app/src/lib/outbox.ts).
 *   2. Dieser Worker pollt pending-Rows und dispatcht sie an registrierte
 *      Handler. At-least-once: Handler MUESSEN idempotent sein.
 *   3. Bei Handler-Fehler steigt `attempts` und `next_attempt_at` wird
 *      per Exponential-Backoff (10 s, 1 min, 5 min, 30 min, 2 h)
 *      verschoben; nach `max_attempts` faellt die Row auf
 *      status='failed' und braucht manuelle Aufmerksamkeit.
 *
 * SELECT FOR UPDATE SKIP LOCKED ist die kritische Zutat: mehrere Worker
 * (Multi-Pod-Deploys) koennen sich die Queue teilen ohne Doppelarbeit;
 * jede Row wird genau einem Worker pro Tick zugeteilt.
 */

"use strict";

/**
 * Liefert den naechsten next_attempt_at-Zeitstempel fuer eine fehl-
 * geschlagene Row. Exponential mit Cap bei 2 h, damit ein hartnaeckig
 * fehlerhafter Handler nicht in einer Tight-Loop heisslaeuft.
 */
function backoffMs(attempts) {
  const schedule = [10_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
  return schedule[Math.min(attempts, schedule.length - 1)];
}

/**
 * Klein-Verbindbares Set von Handler-Funktionen.
 *
 *   handler(ctx) -> Promise<void>
 *
 * ctx = { id, orderNo, kind, payload, attempts, log }
 *
 * Wirft der Handler, wird die Row als fehlgeschlagen markiert (Retry
 * oder failed je nach attempts/max_attempts).
 *
 * Kein Default-Handler fuer `noop` registriert — Tests koennen direkt
 * registerHandler() benutzen.
 */
function createRegistry() {
  const map = new Map();
  return {
    register(kind, handler) {
      if (typeof handler !== "function") {
        throw new TypeError(`outbox handler for "${kind}" must be a function`);
      }
      map.set(kind, handler);
    },
    get(kind) {
      return map.get(kind) || null;
    },
    list() {
      return [...map.keys()];
    },
  };
}

/**
 * Verarbeitet bis zu `batchSize` Outbox-Rows und gibt eine Statistik
 * zurueck. Wird vom Cron pro Tick aufgerufen, oder direkt in Tests.
 *
 * Wichtig: jede Row laeuft in EIGENER kurzer Tx. Der Handler darf
 * laenger laufen — die Row ist waehrenddessen via FOR UPDATE gelockt,
 * andere Worker uebergehen sie via SKIP LOCKED.
 */
async function processOutboxBatch({ pool, registry, batchSize = 25, log = console }) {
  if (!pool) {
    log.warn?.("[outbox] pool nicht verfuegbar, skip");
    return { processed: 0, succeeded: 0, failed: 0, retried: 0 };
  }
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let retried = 0;

  for (let i = 0; i < batchSize; i++) {
    const client = await pool.connect();
    let row = null;
    try {
      await client.query("BEGIN");
      const lockResult = await client.query(
        `SELECT id, order_no, kind, payload, attempts, max_attempts
           FROM booking.order_outbox
          WHERE status = 'pending'
            AND next_attempt_at <= NOW()
          ORDER BY next_attempt_at ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1`,
      );
      row = lockResult.rows[0] || null;
      if (!row) {
        await client.query("COMMIT");
        break; // Queue leer
      }
      await client.query(
        `UPDATE booking.order_outbox
            SET status = 'in_progress', updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
      log.error?.("[outbox] lock-Phase fehlgeschlagen", err?.message || err);
      break;
    } finally {
      // client wird im Erfolgs-Pfad weitergehalten ist nicht der Fall —
      // wir release()n hier separat.
    }
    client.release();

    if (!row) break;

    processed += 1;
    const handler = registry.get(row.kind);
    if (!handler) {
      // Unbekannter kind: failed markieren, manuelle Korrektur.
      await pool.query(
        `UPDATE booking.order_outbox
            SET status = 'failed',
                last_error = $2,
                updated_at = NOW()
          WHERE id = $1`,
        [row.id, `Unbekannter Handler-Kind: ${row.kind}`],
      );
      failed += 1;
      log.error?.(`[outbox] unbekannter kind=${row.kind} (id=${row.id})`);
      continue;
    }

    const ctx = {
      id: Number(row.id),
      orderNo: Number(row.order_no),
      kind: String(row.kind),
      payload: row.payload || {},
      attempts: Number(row.attempts || 0),
      log,
    };

    try {
      await handler(ctx);
      await pool.query(
        `UPDATE booking.order_outbox
            SET status = 'done',
                processed_at = NOW(),
                updated_at = NOW(),
                last_error = NULL
          WHERE id = $1`,
        [row.id],
      );
      succeeded += 1;
    } catch (err) {
      const attempts = ctx.attempts + 1;
      const maxAttempts = Number(row.max_attempts || 5);
      const errMsg = String(err?.message || err).slice(0, 1000);
      if (attempts >= maxAttempts) {
        await pool.query(
          `UPDATE booking.order_outbox
              SET status = 'failed',
                  attempts = $2,
                  last_error = $3,
                  updated_at = NOW()
            WHERE id = $1`,
          [row.id, attempts, errMsg],
        );
        failed += 1;
        log.error?.(`[outbox] kind=${row.kind} id=${row.id} endgueltig fehlgeschlagen`, errMsg);
      } else {
        const ms = backoffMs(attempts);
        await pool.query(
          `UPDATE booking.order_outbox
              SET status = 'pending',
                  attempts = $2,
                  last_error = $3,
                  next_attempt_at = NOW() + ($4::int * INTERVAL '1 millisecond'),
                  updated_at = NOW()
            WHERE id = $1`,
          [row.id, attempts, errMsg, ms],
        );
        retried += 1;
        log.warn?.(
          `[outbox] kind=${row.kind} id=${row.id} retry #${attempts} in ${ms}ms: ${errMsg}`,
        );
      }
    }
  }

  return { processed, succeeded, failed, retried };
}

module.exports = {
  createRegistry,
  processOutboxBatch,
  backoffMs,
};
