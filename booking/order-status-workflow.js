/**
 * order-status-workflow.js
 * Zentrale Workflow-Engine fuer Bestellstatus-Uebergaenge.
 *
 * ALLE Statusaenderungen MUESSEN ueber changeOrderStatus laufen.
 * Direkte DB-Status-Updates in Views/Jobs sind verboten.
 *
 * Ablauf (strikt sequenziell):
 *  1. Order laden
 *  2. Transition pruefen (State Machine)
 *  3. Kalender-Side-Effects ausfuehren (calendar.* zuerst)
 *  4. Status persistieren (nur bei Erfolg der Kalender-Ops fuer confirmed/provisional)
 *  5. Audit-Log schreiben
 *
 * Harte Invarianten:
 *  INV-1: confirmed nur bei erfolgreichem FINAL-Write
 *  INV-2: pending/paused/cancelled: Kalender-Cleanup garantiert (mit Retry-Queue)
 *  INV-3: Provisorium max. 3 Tage – via Ablauf-Job (expiry_job)
 *  INV-4: Atomaritaet: Kalender zuerst, Status-Persist danach
 *
 * Admin-Flow:
 *  - Kein Slot-Pre-Check-Reject: Der Admin-Flow darf immer schreiben.
 *  - context.forceSlot=true wird im Audit protokolliert (Transparenz statt Ablehnung).
 *  - INV-1 bleibt: confirmed nur bei erfolgreichem FINAL-Write.
 */

"use strict";

const { getTransitionError, getSideEffects, calcProvisionalExpiresAt } = require("./state-machine");
const { ORDER_STATUS, VALID_STATUSES, getStatusLabel } = require("./order-status");
const {
  CalendarServiceError,
  createProvisional,
  upgradeToFinal,
  createFinal,
  deleteCalendarEvents,
} = require("./calendar-service");
const { provisionOrderFolders } = require("./order-storage");

// ─── Ergebnis-Typen ───────────────────────────────────────────────────────────

function ok(order, calendarResult) {
  return { success: true, order, calendarResult: calendarResult || "ok" };
}

function fail(error, code, extra) {
  return { success: false, error, code: code || "WORKFLOW_ERROR", ...extra };
}

// ─── Audit-Logging ────────────────────────────────────────────────────────────

/**
 * Schreibt einen Eintrag ins order_status_audit.
 * Fehler werden geloggt aber nicht weitergeworfen (Audit darf Hauptprozess nicht blockieren).
 *
 * @param {object} pool
 * @param {object} params
 * @param {number} params.orderNo
 * @param {string} params.fromStatus
 * @param {string} params.toStatus
 * @param {string} params.source
 * @param {string|null} params.actorId
 * @param {string} params.calendarResult
 * @param {string|null} [params.errorMessage]
 * @param {boolean} [params.forceSlot]
 * @param {string|null} [params.overrideReason]
 */
async function writeAuditLog(pool, {
  orderNo, fromStatus, toStatus, source, actorId,
  calendarResult, errorMessage, forceSlot, overrideReason,
}) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO order_status_audit
         (order_no, from_status, to_status, source, actor_id, calendar_result, error_message, force_slot, override_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        Number(orderNo),
        String(fromStatus),
        String(toStatus),
        String(source || "unknown"),
        actorId ? String(actorId) : null,
        String(calendarResult || "not_required"),
        errorMessage ? String(errorMessage).slice(0, 1000) : null,
        forceSlot === true,
        overrideReason ? String(overrideReason).slice(0, 500) : null,
      ]
    );
  } catch (auditErr) {
    console.error("[order-status-workflow] Audit-Log Fehler:", auditErr && auditErr.message);
  }
}

// ─── Kalender-Side-Effects ────────────────────────────────────────────────────

/**
 * Fuehrt Kalender-Side-Effects aus.
 * Gibt { calendarResult, calendarError } zurueck.
 *
 * Bei Create/Upgrade-Fehlern wird GEWORFEN (INV-1/INV-4).
 * Bei Delete-Fehlern: in Retry-Queue via deleteCalendarEvents, non-fatal (INV-2).
 *
 * @param {object} order
 * @param {string[]} effects
 * @param {object} deps - { graphClient, OFFICE_EMAIL, PHOTOG_PHONES, getSetting, db }
 * @param {boolean} [forceSlot]
 * @returns {Promise<{calendarResult: string, calendarError?: string}>}
 */
async function executeCalendarEffects(order, effects, deps, forceSlot) {
  const calEffects = effects.filter(function(e) { return e.startsWith("calendar."); });

  if (!calEffects.length) {
    return { calendarResult: "not_required" };
  }

  const { getSetting } = deps;
  const calFlagResult = getSetting ? await getSetting("feature.calendarOnStatusChange") : { value: false };
  const calEnabled = !!(calFlagResult && calFlagResult.value);

  if (!calEnabled) {
    for (const effect of calEffects) {
      console.log("[order-status-workflow][shadow] Kalender-Effect uebersprungen (Flag off):", effect, { orderNo: order.orderNo });
    }
    return { calendarResult: "skipped" };
  }

  let deleteResult = null;

  for (const effect of calEffects) {
    if (effect === "calendar.create_provisional") {
      // INV-4: Wirft bei Fehler -> Status wird nicht persistiert
      await createProvisional(order, deps);

    } else if (effect === "calendar.upgrade_to_final") {
      // INV-1/INV-4: Wirft bei Fehler -> Status bleibt unveraendert
      await upgradeToFinal(order, deps);

    } else if (effect === "calendar.create_final") {
      // INV-1/INV-4: robust fuer bestehende Event-Zustaende:
      // - wenn bereits Event-IDs vorhanden, auf FINAL updaten/hochziehen
      // - sonst neues FINAL-Event anlegen
      if (order.photographerEventId || order.officeEventId) {
        await upgradeToFinal(order, deps);
      } else {
        await createFinal(order, deps);
      }

    } else if (
      effect === "calendar.delete" ||
      effect === "calendar.delete_provisional" ||
      effect === "calendar.delete_if_exists"
    ) {
      // INV-2: Non-fatal, zentrale idempotente Cleanup-Routine
      // delete_if_exists: nur ausfuehren wenn Event-IDs vorhanden
      if (effect === "calendar.delete_if_exists" && !order.photographerEventId && !order.officeEventId) {
        console.log("[order-status-workflow] calendar.delete_if_exists: keine Event-IDs, uebersprungen", { orderNo: order.orderNo });
        deleteResult = { result: "skipped" };
      } else {
        deleteResult = await deleteCalendarEvents(order, deps);
      }

    } else if (effect === "calendar.send_ics_cancel") {
      // ICS-Cancel wird vom API-Endpunkt direkt verarbeitet (Server-Logik)
      console.log("[order-status-workflow] calendar.send_ics_cancel: wird vom Aufrufer verarbeitet", { orderNo: order.orderNo });

    } else {
      console.log("[order-status-workflow] unbekannter Kalender-Effect:", effect, { orderNo: order.orderNo });
    }
  }

  // calendarResult aus deleteCalendarEvents-Ergebnis ableiten (wenn vorhanden)
  if (deleteResult) {
    const deleteResultValue = deleteResult.result || "ok";
    // Bei forceSlot: result mit _with_force Suffix kennzeichnen
    if (forceSlot) {
      return { calendarResult: deleteResultValue + "_with_force" };
    }
    return { calendarResult: deleteResultValue };
  }

  // Bei Create/Upgrade ohne Delete: "ok" oder "ok_with_force"
  return { calendarResult: forceSlot ? "ok_with_force" : "ok" };
}

// ─── Haupt-Funktion ───────────────────────────────────────────────────────────

/**
 * changeOrderStatus – zentrale Funktion fuer alle Statusaenderungen.
 *
 * @param {number|string} orderId - Auftragsnummer
 * @param {string} targetStatus - Ziel-Status (englisch, lowercase)
 * @param {object} context
 *   - source:         "api" | "expiry_job" | "confirmation_job"  (required)
 *   - actorId:        Admin-User-ID oder Job-Name (optional)
 *   - reason:         Storno/Pause-Grund (optional)
 *   - forceSlot:      true = Admin hat bewusst auf Pre-Check verzichtet (optional, nur fuer Audit)
 *   - overrideReason: Begruendung fuer forceSlot (optional)
 *   - loadOrder:      async function(orderNo) -> order (required)
 * @param {object} deps - { db, getSetting, graphClient, OFFICE_EMAIL, PHOTOG_PHONES }
 * @returns {Promise<{success: boolean, order?, calendarResult?, error?, code?}>}
 */
async function changeOrderStatus(orderId, targetStatus, context, deps) {
  const orderNo = Number(orderId);
  const source = (context && context.source) || "unknown";
  const actorId = (context && context.actorId) || null;
  const forceSlot = !!(context && context.forceSlot);
  const overrideReason = (context && context.overrideReason) || null;
  const loadOrderFn = context && context.loadOrder;

  const { db } = deps;
  const pool = db && db.getPool ? db.getPool() : null;

  console.log("[order-status-workflow] start", { orderNo, targetStatus, source, actorId, forceSlot });

  // ── Schritt 1: Status validieren ──────────────────────────────────────────
  if (!VALID_STATUSES.includes(String(targetStatus || "").toLowerCase())) {
    return fail("Ungueltiger Ziel-Status: \"" + targetStatus + "\"", "INVALID_STATUS");
  }
  const to = String(targetStatus).toLowerCase();

  // ── Schritt 2: Order laden ────────────────────────────────────────────────
  let order;
  try {
    if (!loadOrderFn) {
      throw new Error("loadOrder-Funktion nicht im Kontext bereitgestellt");
    }
    order = await loadOrderFn(orderNo);
    if (!order) {
      return fail("Auftrag nicht gefunden: " + orderNo, "ORDER_NOT_FOUND");
    }
  } catch (loadErr) {
    return fail("Auftrag konnte nicht geladen werden: " + (loadErr && loadErr.message), "ORDER_LOAD_ERROR");
  }

  const from = String(order.status || "pending").toLowerCase();

  // Idempotenz: bereits im Ziel-Status -> no-op
  if (from === to) {
    console.log("[order-status-workflow] bereits im Ziel-Status, kein Update noetig", { orderNo, status: to });
    return ok(order, "not_required");
  }

  // ── Schritt 3: Transition pruefen ─────────────────────────────────────────
  const transitionErr = getTransitionError(from, to, order, context);
  if (transitionErr) {
    console.log("[order-status-workflow] Transition abgelehnt:", { orderNo, from, to, error: transitionErr });
    return fail(transitionErr, "TRANSITION_NOT_ALLOWED", { from, to });
  }

  // ── Schritt 4: Side Effects ermitteln ────────────────────────────────────
  const sideEffects = getSideEffects(from, to);
  console.log("[order-status-workflow] transition", { orderNo, from, to, source, forceSlot, sideEffects });

  // ── Schritt 5: Kalender-Side-Effects ausfuehren (vor Status-Update!) ─────
  let calendarResult = "not_required";
  let calendarError = null;

  try {
    const calResult = await executeCalendarEffects(order, sideEffects, deps, forceSlot);
    calendarResult = calResult.calendarResult;
  } catch (calErr) {
    calendarError = calErr && calErr.message;

    // Bei forceSlot: error-Code mit _with_force kennzeichnen
    calendarResult = forceSlot ? "error_with_force" : "error";

    console.error("[order-status-workflow] Kalender-Fehler:", { orderNo, from, to, forceSlot, error: calendarError });

    // INV-1: confirmed/provisional -> bei Kalender-Fehler kein Status-Update
    if (to === ORDER_STATUS.CONFIRMED || to === ORDER_STATUS.PROVISIONAL) {
      await writeAuditLog(pool, {
        orderNo, fromStatus: from, toStatus: to, source, actorId,
        calendarResult, errorMessage: calendarError, forceSlot, overrideReason,
      });
      return fail(
        calErr instanceof CalendarServiceError
          ? calErr.message
          : "Kalender-Operation fehlgeschlagen. Status bleibt unveraendert.",
        to === ORDER_STATUS.CONFIRMED ? "CALENDAR_CONFIRMED_FAILED" : "CALENDAR_PROVISIONAL_FAILED",
        { from, to, calendarError }
      );
    }

    // Fuer andere Uebergaenge (delete-Operationen): Fehler in Retry-Queue (via deleteCalendarEvents),
    // Status-Update trotzdem durchfuehren (Slot-Freigabe ist idempotent via Queue).
    console.warn("[order-status-workflow] Kalender-Delete-Fehler: Status wird trotzdem aktualisiert (Retry-Queue)", { orderNo, from, to });
    calendarResult = forceSlot ? "partial_with_force" : "partial";
  }

  // ── Schritt 6: Status persistieren ───────────────────────────────────────
  try {
    const nowIso = new Date().toISOString();
    const updateFields = { status: to };

    if (to === ORDER_STATUS.PROVISIONAL) {
      // Provisorium-Felder setzen (wenn nicht schon vom Job gesetzt)
      if (!order.provisionalBookedAt && !order.provisional_booked_at) {
        updateFields.provisional_booked_at = nowIso;
      }
      if (!order.provisionalExpiresAt && !order.provisional_expires_at) {
        updateFields.provisional_expires_at = calcProvisionalExpiresAt(new Date(nowIso)).toISOString();
      }
    }

    if (to === ORDER_STATUS.PENDING && from === ORDER_STATUS.PROVISIONAL) {
      // Provisorium-Felder leeren (Ablauf-Job)
      updateFields.provisional_booked_at = null;
      updateFields.provisional_expires_at = null;
      updateFields.provisional_reminder_1_sent_at = null;
      updateFields.provisional_reminder_2_sent_at = null;
      updateFields.provisional_reminder_3_sent_at = null;
    }

    if (to === ORDER_STATUS.PAUSED) {
      const oldSchedule = order.schedule && typeof order.schedule === "object" ? order.schedule : {};
      const oldDate = String(oldSchedule.date || "").slice(0, 10);
      const oldTime = String(oldSchedule.time || "").slice(0, 5);
      if (oldDate && /^\d{4}-\d{2}-\d{2}$/.test(oldDate)) {
        updateFields.last_reschedule_old_date = oldDate;
        updateFields.last_reschedule_old_time = oldTime || null;
      }
      updateFields.schedule = JSON.stringify({});
      console.log("[order-status-workflow] PAUSED: Schedule geleert (Slot freigegeben)", { orderNo, oldDate, oldTime });
    }

    if (to === ORDER_STATUS.DONE) {
      updateFields.done_at = nowIso;
      updateFields.closed_at = nowIso;
    }

    await db.updateOrderFields(orderNo, updateFields);
    console.log("[order-status-workflow] Status persistiert", { orderNo, from, to, calendarResult });
  } catch (dbErr) {
    const dbError = dbErr && dbErr.message;
    const dbCalResult = forceSlot ? "error_with_force" : "error";
    console.error("[order-status-workflow] DB-Update fehlgeschlagen:", { orderNo, from, to, error: dbError });
    await writeAuditLog(pool, {
      orderNo, fromStatus: from, toStatus: to, source, actorId,
      calendarResult: dbCalResult, errorMessage: "DB-Fehler: " + dbError,
      forceSlot, overrideReason,
    });
    return fail("Status konnte nicht persistiert werden: " + dbError, "DB_UPDATE_FAILED", { from, to });
  }

  if (to === ORDER_STATUS.CONFIRMED && db && typeof db.getOrderByNo === "function") {
    try {
      const refreshedOrder = await db.getOrderByNo(orderNo);
      if (refreshedOrder) {
        await provisionOrderFolders(refreshedOrder, db, { createMissing: true });
      }
    } catch (storageErr) {
      console.error("[order-status-workflow] Storage-Provisioning fehlgeschlagen:", storageErr && storageErr.message);
    }
  }

  // ── Schritt 7: Audit-Log ─────────────────────────────────────────────────
  await writeAuditLog(pool, {
    orderNo, fromStatus: from, toStatus: to, source, actorId,
    calendarResult, forceSlot, overrideReason,
  });
  console.log("[order-status-workflow] abgeschlossen", {
    orderNo, from, to, source, calendarResult, forceSlot,
    fromLabel: getStatusLabel(from),
    toLabel: getStatusLabel(to),
  });

  const provisionalOverrides = {};
  if (to === ORDER_STATUS.PROVISIONAL) {
    if (!order.provisionalExpiresAt && !order.provisional_expires_at) {
      provisionalOverrides.provisionalExpiresAt = calcProvisionalExpiresAt(new Date()).toISOString();
    }
    if (!order.provisionalBookedAt && !order.provisional_booked_at) {
      provisionalOverrides.provisionalBookedAt = new Date().toISOString();
    }
  }
  const updatedOrder = Object.assign({}, order, { status: to }, provisionalOverrides);
  return ok(updatedOrder, calendarResult);
}

module.exports = {
  changeOrderStatus,
  writeAuditLog,
};
