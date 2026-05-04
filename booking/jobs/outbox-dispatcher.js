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
const {
  makeWorkflowStatusMailHandler,
} = require("../lib/outbox-handler-workflow-mail");
const {
  makeCalendarRescheduleHandler,
} = require("../lib/outbox-handler-calendar-reschedule");

/**
 * Globale Handler-Registry. Smoke-Handler wird beim Modul-Load
 * registriert; reale Handler brauchen Server-deps (sendMail) und
 * werden in scheduleOutboxDispatcher(deps) per Closure registriert.
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
  const { db, getSetting, sendMailWithFallback, performAdminReschedule } = deps;

  // Reale Handler erst hier registrieren, weil sie Server-deps brauchen.
  // Idempotent: scheduleSafeCronJob laeuft beim Boot einmalig — eine
  // doppelte register()-Call wuerde den vorherigen Handler ueberschreiben,
  // was hier gewollt ist (immer der aktuellste Closure).
  if (typeof sendMailWithFallback === "function") {
    registry.register(
      "workflow_status_mail",
      makeWorkflowStatusMailHandler({ sendMailWithFallback }),
    );
  } else {
    console.warn(
      "[outbox] sendMailWithFallback fehlt in deps — workflow_status_mail-Handler NICHT registriert",
    );
  }

  if (typeof performAdminReschedule === "function") {
    registry.register(
      "calendar_reschedule",
      makeCalendarRescheduleHandler({ performAdminReschedule }),
    );
  } else {
    console.warn(
      "[outbox] performAdminReschedule fehlt in deps — calendar_reschedule-Handler NICHT registriert",
    );
  }

  const pool = db && typeof db.getPool === "function" ? db.getPool() : null;

  scheduleSafeCronJob({
    name: "outbox-dispatcher",
    cron: "*/30 * * * * *", // alle 30 s
    pool,
    timezone: "Europe/Zurich",
    run: async (ctx) => {
      // Outbox-Dispatcher hat ein EIGENES Flag (`feature.outboxDispatcher`,
      // Default true), getrennt vom globalen feature.backgroundJobs.
      // Outbox-Side-Effects sind Korrektheits-relevant — sie muessen
      // auch in Setups ohne weitere Jobs laufen (Codex P1 #262).
      const flagResult = await getSetting?.("feature.outboxDispatcher");
      const enabled = flagResult ? !!flagResult.value : true; // Default opt-out
      if (!enabled) return;
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
