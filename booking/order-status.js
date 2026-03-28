/**
 * order-status.js
 * Single Source of Truth fuer alle Bestellstatus im Backend.
 *
 * Statuswerte sind DB-stabil (englisch, lowercase).
 * Deutsche Labels nur fuer Logging/Fehlermeldungen – niemals in die DB schreiben.
 *
 * WICHTIG: "Termin provisorisch abgelaufen" ist KEIN Status.
 * Es ist ein Job-/Event-Zustand (provisorisches Kalender-Event laeuft ab nach 3 Tagen)
 * und setzt den Status automatisch zurueck auf "pending".
 */

"use strict";

/**
 * Alle gueltigen Bestellstatus.
 * Reihenfolge entspricht dem typischen Workflow-Ablauf.
 */
const ORDER_STATUS = {
  PENDING:     "pending",     // Ausstehend – noch kein Termin blockiert
  PROVISIONAL: "provisional", // Termin provisorisch gebucht – Slot tentativ belegt (max. 3 Tage)
  CONFIRMED:   "confirmed",   // Bestätigt – finaler Kalender-Eintrag erforderlich
  PAUSED:      "paused",      // Pausiert – Slot freigegeben, Kunde wartet auf neues Datum
  COMPLETED:   "completed",   // Erledigt – Shooting abgeschlossen
  DONE:        "done",        // Abgeschlossen – Review nach 5 Tagen
  CANCELLED:   "cancelled",   // Storniert – endgueltig, Slot freigegeben
  ARCHIVED:    "archived",    // Archiviert – read-only; Reaktivierung -> pending (neu planen)
};

/**
 * Alle gueltigen Status-Keys als Array (fuer Validierung, Dropdowns, etc.).
 */
const VALID_STATUSES = Object.values(ORDER_STATUS);

/**
 * Deutsche Labels fuer Logging, Fehlermeldungen und Audit.
 * Nicht fuer DB-Speicherung verwenden.
 */
const STATUS_LABELS_DE = {
  [ORDER_STATUS.PENDING]:     "Ausstehend",
  [ORDER_STATUS.PROVISIONAL]: "Termin provisorisch gebucht",
  [ORDER_STATUS.CONFIRMED]:   "Bestätigt",
  [ORDER_STATUS.PAUSED]:      "Pausiert",
  [ORDER_STATUS.COMPLETED]:   "Erledigt",
  [ORDER_STATUS.DONE]:        "Abgeschlossen",
  [ORDER_STATUS.CANCELLED]:   "Storniert",
  [ORDER_STATUS.ARCHIVED]:    "Archiviert",
};

/**
 * Erlaubte Statusuebergaenge (Transition-Matrix).
 * Schluessel = Ausgangsstatus, Wert = Array erlaubter Zielstatus.
 *
 * Sonderfall provisional -> pending:
 * Manuell NICHT erlaubt. Nur via Ablauf-Job (context.source === "expiry_job").
 * Der context-Check erfolgt in getTransitionError / isTransitionAllowed.
 */
const ALLOWED_TRANSITIONS = {
  [ORDER_STATUS.PENDING]:     [ORDER_STATUS.PROVISIONAL, ORDER_STATUS.CONFIRMED, ORDER_STATUS.PAUSED, ORDER_STATUS.CANCELLED, ORDER_STATUS.ARCHIVED, ORDER_STATUS.DONE, ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.PROVISIONAL]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.PAUSED, ORDER_STATUS.CANCELLED],
  // pending ist hier nicht aufgefuehrt – wird nur via expiry_job erlaubt (siehe isTransitionAllowed)
  [ORDER_STATUS.PAUSED]:      [ORDER_STATUS.PENDING, ORDER_STATUS.PROVISIONAL, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]:   [ORDER_STATUS.COMPLETED, ORDER_STATUS.PAUSED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.COMPLETED]:   [ORDER_STATUS.DONE, ORDER_STATUS.ARCHIVED],
  [ORDER_STATUS.DONE]:        [ORDER_STATUS.ARCHIVED],
  [ORDER_STATUS.CANCELLED]:   [ORDER_STATUS.ARCHIVED],
  [ORDER_STATUS.ARCHIVED]:    [ORDER_STATUS.PENDING],
};

/**
 * Gibt die erlaubten Ziel-Status fuer einen Ausgangsstatus zurueck.
 * Kontext-abhaengige Sonderfaelle (expiry_job) sind NICHT enthalten –
 * verwende isTransitionAllowed fuer vollstaendige Pruefung.
 *
 * @param {string} fromStatus
 * @returns {string[]}
 */
function getAllowedTargets(fromStatus) {
  return ALLOWED_TRANSITIONS[String(fromStatus).toLowerCase()] || [];
}

/**
 * Prueft ob ein Statusuebergang erlaubt ist – inkl. Kontext-abhaengiger Sonderfaelle.
 *
 * @param {string} from
 * @param {string} to
 * @param {object} [context] - { source?: "api"|"expiry_job"|"confirmation_job" }
 * @returns {boolean}
 */
function isTransitionAllowed(from, to, context) {
  const f = String(from || "").toLowerCase();
  const t = String(to || "").toLowerCase();

  if (!VALID_STATUSES.includes(t)) return false;

  const allowed = ALLOWED_TRANSITIONS[f] || [];
  if (allowed.includes(t)) return true;

  // Sonderfall: provisional -> pending nur via Ablauf-Job
  if (f === ORDER_STATUS.PROVISIONAL && t === ORDER_STATUS.PENDING) {
    return !!(context && context.source === "expiry_job");
  }

  return false;
}

/**
 * Gibt deutsches Label fuer einen Status zurueck.
 * Fallback: roher Status-Key.
 *
 * @param {string} statusKey
 * @returns {string}
 */
function getStatusLabel(statusKey) {
  return STATUS_LABELS_DE[String(statusKey).toLowerCase()] || statusKey;
}

/**
 * Validiert ob ein String ein gueltiger Status-Key ist.
 *
 * @param {string} key
 * @returns {boolean}
 */
function isValidStatus(key) {
  return VALID_STATUSES.includes(String(key || "").toLowerCase());
}

module.exports = {
  ORDER_STATUS,
  VALID_STATUSES,
  STATUS_LABELS_DE,
  ALLOWED_TRANSITIONS,
  getAllowedTargets,
  isTransitionAllowed,
  getStatusLabel,
  isValidStatus,
};
