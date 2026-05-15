/**
 * state-machine.js
 * Workflow-State-Machine fuer das Buchungstool.
 *
 * Status-SSOT: order-status.js (Backend)
 * Feature-Flags steuern Side Effects -- Uebergangspruefung ist immer aktiv.
 */

"use strict";

const {
  ORDER_STATUS,
  VALID_STATUSES,
  ALLOWED_TRANSITIONS,
  isTransitionAllowed,
  getStatusLabel,
} = require("./order-status");

/**
 * Prueft ob ein Statusuebergang erlaubt ist.
 * Gibt null zurueck wenn OK, sonst einen Fehlerstring.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {object} order - vollstaendiges Order-Objekt fuer Bedingungspruefungen
 * @param {object} [context] - { source?: "api"|"expiry_job"|"confirmation_job" }
 * @returns {string|null} Fehlermeldung oder null
 */
function getTransitionError(fromStatus, toStatus, order, context) {
  const ord = order || {};
  const from = String(fromStatus || "").toLowerCase();
  const to = String(toStatus || "").toLowerCase();

  if (!VALID_STATUSES.includes(to)) {
    return "Ungueltiger Status: \"" + to + "\". Erlaubt: " + VALID_STATUSES.join(", ");
  }

  if (!isTransitionAllowed(from, to, context)) {
    // Spezieller Hinweis fuer provisional->pending (nur via Job)
    if (from === ORDER_STATUS.PROVISIONAL && to === ORDER_STATUS.PENDING) {
      return "Statusuebergang von \"provisional\" zu \"pending\" ist nur via Ablauf-Job erlaubt (nicht manuell).";
    }
    return "Statusuebergang von \"" + from + "\" zu \"" + to + "\" ist nicht erlaubt.";
  }

  // INV-SM-04 + INV-SM-05: confirmed und provisional erfordern Fotograf + Termin
  if (to === ORDER_STATUS.CONFIRMED || to === ORDER_STATUS.PROVISIONAL) {
    const photographerKey = (ord.photographer && ord.photographer.key) || ord.photographerKey || "";
    if (!photographerKey) {
      return "Status \"" + to + "\" erfordert einen zugewiesenen Fotografen.";
    }
    const scheduleDate = (ord.schedule && ord.schedule.date) || "";
    const scheduleTime = (ord.schedule && ord.schedule.time) || "";
    if (!scheduleDate || !scheduleTime) {
      return "Status \"" + to + "\" erfordert einen gueltigen Termin (Datum + Uhrzeit).";
    }
  }

  return null; // OK
}

/**
 * Gibt die Side Effects zurueck, die bei einem Statusuebergang ausgeloest werden sollen.
 * Die tatsaechliche Ausfuehrung liegt beim Aufrufer (hinter Feature Flags).
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @returns {string[]} Liste von Side-Effect-Keys
 */
function getSideEffects(fromStatus, toStatus) {
  const from = String(fromStatus || "").toLowerCase();
  const to = String(toStatus || "").toLowerCase();

  const effects = [];

  if (to === ORDER_STATUS.PROVISIONAL) {
    effects.push("calendar.create_provisional");
    effects.push("email.provisional_created");
  }

  if (to === ORDER_STATUS.CONFIRMED) {
    if (from === ORDER_STATUS.PROVISIONAL) {
      effects.push("calendar.upgrade_to_final");
    } else {
      effects.push("calendar.create_final");
    }
    if (from === ORDER_STATUS.DISPOSITION_OFFEN) {
      // Flexible Buchung: Kunde erhält Disposition-Mail mit Hinweisblock,
      // Office/Fotograf werden wie üblich informiert.
      effects.push("email.flex_booking_disposition");
      effects.push("email.confirmed_photographer");
      effects.push("email.confirmed_office");
    } else {
      effects.push("email.confirmed_customer");
      effects.push("email.confirmed_photographer");
      effects.push("email.confirmed_office");
    }
  }

  if (to === ORDER_STATUS.DISPOSITION_OFFEN) {
    // Bei direkter Anlage einer Flex-Buchung: Bestätigungs-Mail an Kunden.
    // (Der eigentliche Trigger geschieht im POST /api/booking direkt; dieses
    // Side-Effect-Mapping deckt manuelle Statuswechsel im Admin ab.)
    effects.push("email.flex_booking_confirmation");
  }

  if (to === ORDER_STATUS.PAUSED) {
    effects.push("calendar.delete");
    if (from !== ORDER_STATUS.PENDING) {
      effects.push("email.paused_customer");
      effects.push("email.paused_photographer");
      effects.push("email.paused_office");
    }
  }

  if (to === ORDER_STATUS.CANCELLED) {
    effects.push("calendar.delete");
    effects.push("calendar.send_ics_cancel");
    effects.push("email.cancelled_all");
    if (from === ORDER_STATUS.PROVISIONAL) {
      effects.push("provisional.clear");
    }
  }

  // Provisorium-Ablauf (nur via Expiry-Job, nicht manuell waehlbar)
  if (to === ORDER_STATUS.PENDING && from === ORDER_STATUS.PROVISIONAL) {
    effects.push("calendar.delete_provisional");
    effects.push("provisional.clear");
  }

  // Ausstehend-Cleanup: wenn ein Event (provisional/final) noch existiert, loeschen.
  // Gilt fuer: archived->pending (Reaktivierung), paused->pending, und anderen Uebergaengen zu pending.
  // calendar.delete_if_exists ist idempotent: loescht nur wenn photographerEventId/officeEventId gesetzt.
  if (to === ORDER_STATUS.PENDING && from !== ORDER_STATUS.PROVISIONAL) {
    effects.push("calendar.delete_if_exists");
  }

  if (to === ORDER_STATUS.DONE) {
    effects.push("review.schedule");
    effects.push("timestamp.set_done_at");
    effects.push("timestamp.set_closed_at");
  }

  if (to === ORDER_STATUS.ARCHIVED) {
    effects.push("chat.close_permanently");
  }

  return effects;
}

/**
 * Berechnet das Ablaufdatum eines Provisoriums.
 * Gemaess Spezifikation: Beginn des 4. Tages (00:00 Zuerich-Zeit).
 *
 * @param {Date|string} bookedAt
 * @returns {Date}
 */
function calcProvisionalExpiresAt(bookedAt) {
  const d = new Date(bookedAt);
  if (isNaN(d.getTime())) throw new Error("Ungueltiges bookedAt-Datum");

  // +3 Kalendertage
  d.setDate(d.getDate() + 3);

  // Datum in Zuerich-Zeitzone ermitteln
  const zurichDateStr = d.toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" });

  // Offset ermitteln (Sommer +02:00, Winter +01:00)
  const isDST = d.toLocaleTimeString("en-US", {
    timeZone: "Europe/Zurich",
    hour12: false,
    timeZoneName: "short",
  }).includes("GMT+2");
  const offset = isDST ? "+02:00" : "+01:00";

  return new Date(zurichDateStr + "T00:00:00" + offset);
}

/**
 * Prueft ob ein Provisorium abgelaufen ist.
 * @param {Date|string} bookedAt
 * @returns {boolean}
 */
function isProvisionalExpired(bookedAt) {
  try {
    const expiresAt = calcProvisionalExpiresAt(bookedAt);
    return new Date() >= expiresAt;
  } catch (_) {
    return false;
  }
}

module.exports = {
  // Re-exports aus order-status.js fuer Abwaertskompatibilitaet
  VALID_STATUSES,
  ALLOWED_TRANSITIONS,
  ORDER_STATUS,
  getStatusLabel,
  // State-Machine Funktionen
  getTransitionError,
  getSideEffects,
  calcProvisionalExpiresAt,
  isProvisionalExpired,
};
