/**
 * workflow-effects.js
 * Dispatches Kalender-Side-Effects bei Statusuebergaengen.
 *
 * Kalender-Operationen werden an calendar-service.js delegiert.
 * Alle Aktionen laufen hinter dem Feature Flag "feature.calendarOnStatusChange".
 * Ist das Flag false: nur Shadow-Log, kein Graph-API-Aufruf.
 *
 * DEPRECATED fuer neue Kalender-Operationen: Neue Aufrufe sollten ueber
 * order-status-workflow.js -> calendar-service.js laufen.
 * Diese Datei bleibt fuer Abwaertskompatibilitaet (Legacy-Pfade in server.js).
 */

"use strict";

const {
  CalendarServiceError,
  createProvisional,
  upgradeToFinal,
  createFinal,
  deleteBlock,
} = require("./calendar-service");

// Re-exports fuer Abwaertskompatibilitaet (Legacy-Aufrufer)
// calendar-service.js ist jetzt die kanonische Quelle
async function createProvisionalBlock(order, deps) {
  return createProvisional(order, deps);
}

async function upgradeBlockToFinal(order, deps) {
  return upgradeToFinal(order, deps);
}

async function createFinalBlock(order, deps) {
  return createFinal(order, deps);
}

async function deleteCalendarBlock(order, deps) {
  return deleteBlock(order, deps);
}

// ─── Haupt-Dispatcher ─────────────────────────────────────────────────────────

/**
 * Fuehrt Side Effects aus einem getSideEffects()-Array aus.
 * Liest Feature Flag "feature.calendarOnStatusChange" – ist dieser false,
 * wird nur geloggt (Shadow-Mode).
 *
 * @param {object} order - vollstaendiges Order-Objekt
 * @param {string[]} effects - Array von Side-Effect-Keys aus getSideEffects()
 * @param {object} deps - { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, getSetting, db }
 */
async function executeSideEffects(order, effects, deps) {
  if (!Array.isArray(effects) || !effects.length) return;

  const { getSetting } = deps;
  const calFlagResult = getSetting ? await getSetting("feature.calendarOnStatusChange") : { value: false };
  const calEnabled = !!(calFlagResult && calFlagResult.value);

  for (const effect of effects) {
    if (!effect.startsWith("calendar.")) continue;

    if (!calEnabled) {
      console.log("[workflow-effects][shadow] Kalender-Effect uebersprungen (Flag off):", effect, { orderNo: order.orderNo });
      continue;
    }

    try {
      if (effect === "calendar.create_provisional") {
        await createProvisional(order, deps);
      } else if (effect === "calendar.upgrade_to_final") {
        await upgradeToFinal(order, deps);
      } else if (effect === "calendar.create_final") {
        await createFinal(order, deps);
      } else if (effect === "calendar.delete" || effect === "calendar.delete_provisional") {
        await deleteBlock(order, deps);
      } else if (effect === "calendar.delete_if_exists") {
        if (order.photographerEventId || order.officeEventId) {
          await deleteBlock(order, deps);
        } else {
          console.log("[workflow-effects] calendar.delete_if_exists: keine Event-IDs, uebersprungen", { orderNo: order.orderNo });
        }
      } else if (effect === "calendar.send_ics_cancel") {
        console.log("[workflow-effects] calendar.send_ics_cancel: wird vom Status-PATCH verarbeitet", { orderNo: order.orderNo });
      } else {
        console.log("[workflow-effects] unbekannter Kalender-Effect:", effect);
      }
    } catch (err) {
      console.error("[workflow-effects] Fehler bei Effect", effect, err && err.message);
    }
  }
}

module.exports = {
  executeSideEffects,
  // Abwaertskompatible Re-Exports (delegieren an calendar-service.js)
  createProvisionalBlock,
  upgradeBlockToFinal,
  createFinalBlock,
  deleteCalendarBlock,
};
