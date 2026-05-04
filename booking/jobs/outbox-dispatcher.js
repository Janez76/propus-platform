/**
 * jobs/outbox-dispatcher.js
 * Pollt booking.order_outbox alle 30 s und dispatcht pending-Rows
 * an die registrierten Handler (siehe lib/outbox-dispatcher.js).
 *
 * Distributed-Lock + skip-on-overlap kommen von scheduleSafeCronJob:
 * mehrere Pods koennen problemlos parallel laufen, aber pro Tick faehrt
 * nur einer den Worker hoch. Die SELECT FOR UPDATE SKIP LOCKED-Logik im
 * Dispatcher selbst erlaubt dann zusaetzlich Mehrfach-Worker innerhalb
 * eines Pods (currently nicht genutzt).
 */

"use strict";

const { scheduleSafeCronJob } = require("../../core/lib/safe-cron-job");
const {
  createRegistry,
  processOutboxBatch,
} = require("../lib/outbox-dispatcher");

/**
 * Globale Handler-Registry. In Phase 1 (PR 4) ist nur ein No-Op-Handler
 * fuer Smoke-Tests registriert. Folge-PRs wandern Side-Effect-Typen
 * inkrementell hierher (workflow_status_mail, calendar_reschedule, ...).
 */
const registry = createRegistry();

/**
 * Smoke-Test-Handler: loggt nur die Payload, marked die Row als done.
 * Erlaubt End-to-End-Test der Outbox-Pipeline ohne reale Side-Effects.
 */
registry.register("noop_log", async (ctx) => {
  ctx.log.log?.(
    `[outbox/noop_log] order=${ctx.orderNo} id=${ctx.id} payload=`,
    ctx.payload,
  );
});

function scheduleOutboxDispatcher(deps) {
  const { db, getSetting } = deps;
  const pool = db && typeof db.getPool === "function" ? db.getPool() : null;

  scheduleSafeCronJob({
    name: "outbox-dispatcher",
    cron: "*/30 * * * * *", // alle 30 s
    pool,
    timezone: "Europe/Zurich",
    run: async (ctx) => {
      const flagResult = await getSetting?.("feature.backgroundJobs");
      if (!flagResult || !flagResult.value) return;
      if (!pool) {
        ctx.warn("DB nicht verfuegbar");
        return;
      }
      const stats = await processOutboxBatch({
        pool,
        registry,
        batchSize: 25,
        log: ctx,
      });
      if (stats.processed > 0) {
        ctx.log(
          `outbox-dispatcher: processed=${stats.processed} ok=${stats.succeeded} retry=${stats.retried} failed=${stats.failed}`,
        );
      }
    },
  });
}

module.exports = {
  scheduleOutboxDispatcher,
  registry,
};
