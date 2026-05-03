/**
 * core/lib/safe-cron-job.js
 *
 * Wrapper um `node-cron`-Jobs mit:
 *   - **Async-Error-Boundary**: abgelehnte Promises crashen nicht den Prozess.
 *   - **Distributed-Lock** via Postgres `pg_try_advisory_lock(hash)`:
 *     auf Multi-Pod-Deployments laeuft jeder Job-Slot nur in einer Replica.
 *   - **Skip-on-overlap**: wenn ein Lauf laenger braucht als der Cron-Tick,
 *     wird der naechste Tick uebersprungen statt parallel zu starten.
 *   - **Strukturiertes Logging**: konsistentes Prefix `[cron:NAME]`.
 *
 * Hintergrund (Bug-Hunt T07/T09):
 *   - `cron.schedule()`-Callbacks waren async, aber ohne `.catch()` →
 *     unhandledRejection bei jedem DB-Fehler.
 *   - Outer try/catch in den Job-Bodies bricht beim ersten Fehler-Eintrag
 *     den Batch ab → bad-record blockiert alle restlichen.
 *   - Mehrere Replicas fuehren denselben Job parallel aus → doppelte Mails,
 *     race conditions auf shared state.
 *
 * @example
 *   const { scheduleSafeCronJob } = require('../../core/lib/safe-cron-job');
 *
 *   scheduleSafeCronJob({
 *     name: 'review-requests',
 *     cron: '0 9 * * *',
 *     pool,
 *     run: async (ctx) => {
 *       const rows = await fetchPendingReviews(ctx);
 *       for (const row of rows) {
 *         await ctx.perRow(row, async () => sendReview(row));
 *       }
 *     },
 *   });
 */

"use strict";

const crypto = require("crypto");

let cronModule = null;
function getCron() {
  if (cronModule) return cronModule;
  try {
    cronModule = require("node-cron");
  } catch (_e) {
    cronModule = null;
  }
  return cronModule;
}

/**
 * Stabiler 64-bit-Lock-Key aus dem Job-Namen (Postgres advisory_lock erwartet
 * einen bigint). Wir nehmen die ersten 8 Bytes des SHA-256 als signed bigint.
 */
function jobLockKey(name) {
  const hash = crypto.createHash("sha256").update(String(name)).digest();
  // BigInt aus 8 Bytes -> signed (Postgres bigint range)
  let big = BigInt(0);
  for (let i = 0; i < 8; i++) {
    big = (big << BigInt(8)) | BigInt(hash[i]);
  }
  // In signed-bigint-Range bringen (Postgres bigint ist signed).
  const SIGNED_MIN = -(BigInt(1) << BigInt(63));
  const SIGNED_MAX = (BigInt(1) << BigInt(63)) - BigInt(1);
  if (big > SIGNED_MAX) big = big - (BigInt(1) << BigInt(64));
  if (big < SIGNED_MIN) big = SIGNED_MAX;
  return big.toString();
}

/**
 * Versucht einen Postgres-Advisory-Lock zu nehmen. Liefert true wenn
 * erfolgreich, false wenn von einer anderen Replica bereits gehalten.
 * Lock wird automatisch released wenn die Connection released wird —
 * deshalb halten wir die Connection bis `release()` aufgerufen wurde.
 */
async function acquireAdvisoryLock(pool, lockKey) {
  if (!pool) return { acquired: true, release: async () => {} };
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    // DB nicht erreichbar: best-effort, ohne Lock weiterlaufen statt Job zu blockieren.
    // eslint-disable-next-line no-console
    console.warn(`[safe-cron-job] DB-Connect fehlgeschlagen, ohne Lock weitermachen: ${err.message}`);
    return { acquired: true, release: async () => {} };
  }
  try {
    const r = await client.query("SELECT pg_try_advisory_lock($1::bigint) AS got", [lockKey]);
    const got = r.rows[0] && r.rows[0].got === true;
    if (!got) {
      client.release();
      return { acquired: false, release: async () => {} };
    }
    return {
      acquired: true,
      release: async () => {
        try {
          await client.query("SELECT pg_advisory_unlock($1::bigint)", [lockKey]);
        } catch (_e) {}
        client.release();
      },
    };
  } catch (err) {
    client.release();
    // eslint-disable-next-line no-console
    console.warn(`[safe-cron-job] advisory_lock fehlgeschlagen, ohne Lock weitermachen: ${err.message}`);
    return { acquired: true, release: async () => {} };
  }
}

/**
 * Plant einen Cron-Job mit allen Sicherheitsnetzen. Gibt das Cron-Task-
 * Objekt zurueck (oder null wenn node-cron nicht verfuegbar ist).
 *
 * @param {object} opts
 * @param {string} opts.name              - Job-Name (Lock-Key + Logs).
 * @param {string} opts.cron              - Cron-Pattern.
 * @param {object} [opts.pool]            - pg.Pool fuer Distributed-Lock.
 * @param {Function} opts.run             - async (ctx) => void
 * @param {string} [opts.timezone='Europe/Zurich']
 * @param {boolean} [opts.distributedLock=true]
 *
 * Im Run-Callback steht `ctx.perRow(row, fn)` zur Verfuegung — ein Helper
 * der Per-Row-Errors abfaengt + loggt, ohne den ganzen Batch zu killen.
 */
function scheduleSafeCronJob({
  name,
  cron,
  pool,
  run,
  timezone = "Europe/Zurich",
  distributedLock = true,
}) {
  if (!name || !cron || typeof run !== "function") {
    throw new Error("safe-cron-job: name, cron, run sind required");
  }
  const cronLib = getCron();
  if (!cronLib) {
    // eslint-disable-next-line no-console
    console.warn(`[cron:${name}] node-cron nicht verfuegbar, Job nicht geplant`);
    return null;
  }

  const lockKey = distributedLock ? jobLockKey(name) : null;
  let inFlight = false;

  const tick = async () => {
    if (inFlight) {
      // eslint-disable-next-line no-console
      console.warn(`[cron:${name}] vorheriger Lauf laeuft noch, ueberspringe Tick`);
      return;
    }
    inFlight = true;
    let lock = { acquired: true, release: async () => {} };
    try {
      if (distributedLock && pool && lockKey) {
        lock = await acquireAdvisoryLock(pool, lockKey);
        if (!lock.acquired) {
          // eslint-disable-next-line no-console
          console.log(`[cron:${name}] Lock von anderer Replica gehalten, skip`);
          return;
        }
      }
      const ctx = {
        name,
        log: (...args) => console.log(`[cron:${name}]`, ...args),
        warn: (...args) => console.warn(`[cron:${name}]`, ...args),
        error: (...args) => console.error(`[cron:${name}]`, ...args),
        /**
         * Per-Row-Wrapper: Fehler in einem einzelnen Row killen nicht den Batch.
         */
        perRow: async (row, fn) => {
          try {
            await fn(row);
          } catch (err) {
            console.error(
              `[cron:${name}] per-row Fehler (ignoriert, Batch laeuft weiter):`,
              err && err.message ? err.message : err,
            );
          }
        },
      };
      const startedAt = Date.now();
      await run(ctx);
      const dur = Date.now() - startedAt;
      console.log(`[cron:${name}] Tick fertig in ${dur}ms`);
    } catch (err) {
      console.error(`[cron:${name}] Tick failed:`, err && err.stack ? err.stack : err);
    } finally {
      try {
        await lock.release();
      } catch (_e) {}
      inFlight = false;
    }
  };

  // Erstes Tick nicht beim Boot ausfuehren — node-cron ruft den Callback
  // erst beim naechsten Match. Das ist gewollt.
  const task = cronLib.schedule(cron, tick, { timezone, scheduled: true });
  console.log(`[cron:${name}] geplant fuer "${cron}" (${timezone})`);
  return task;
}

module.exports = {
  scheduleSafeCronJob,
  jobLockKey, // export fuer Tests
};
