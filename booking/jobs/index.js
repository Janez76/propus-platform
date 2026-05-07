/**
 * jobs/index.js
 * Registriert alle Cron-Jobs.
 * Wird in startServer() von server.js aufgerufen.
 *
 * Aufteilung:
 *   - `scheduleOutboxDispatcher(deps)` laeuft UNABHAENGIG vom Flag
 *     `feature.backgroundJobs` (eigener Setting-Key
 *     `feature.outboxDispatcher` mit Default `true` — siehe
 *     settings-defaults.js). Begruendung: Outbox dispatcht persistierte
 *     Side-Effects (Workflow-Mails, Calendar-Reschedule) und ist
 *     korrektheits-relevant — sonst entstehen Drifts zwischen DB-State
 *     (z. B. Termin-Aenderung in saveLeistungen) und Outlook/Mail-State.
 *   - Alle uebrigen Jobs (Provisional-Expiry/Reminder, Review-Anfragen,
 *     Calendar-Retry, Confirmation-Pending, Websize-Sync, Duplicate-
 *     Customers) starten nur bei `feature.backgroundJobs=true`.
 *
 * @param {object} deps - { db, getSetting, graphClient, OFFICE_EMAIL,
 *   PHOTOG_PHONES, sendMail, sendMailWithFallback, performAdminReschedule,
 *   createPortalMagicLink }
 */

"use strict";

const { scheduleProvisionalExpiry }     = require("./provisional-expiry");
const { scheduleProvisionalReminders }  = require("./provisional-reminders");
const { scheduleReviewRequests }        = require("./review-requests");
const { scheduleCalendarRetry }         = require("./calendar-retry");
const { scheduleConfirmationPending }   = require("./confirmation-pending");
const { scheduleWebsizeSync }           = require("./websize-sync");
const { scheduleDuplicateCandidatesNightly } = require("./duplicate-customers-nightly");
const { scheduleOutboxDispatcher }      = require("./outbox-dispatcher");
const { scheduleCalendarStaleIdAudit }  = require("./calendar-stale-id-audit");

async function startJobs(deps) {
  const { getSetting } = deps;

  // Outbox-Dispatcher ist ein Korrektheits-Mechanismus (Side-Effects
  // duerfen nach DB-Commit nicht verloren gehen) und laeuft daher
  // UNABHAENGIG vom feature.backgroundJobs-Gate. Eigener Setting-Key,
  // Default opt-out (siehe settings-defaults.js).
  // Codex P1 #262: Sonst lief in Default-Setups (jobs=false) der
  // Calendar-Reschedule nie, weil seine Outbox-Rows nie dispatcht
  // wurden.
  scheduleOutboxDispatcher(deps);

  // Globaler Jobs-Flag fuer alle anderen Hintergrund-Jobs (Provisional-
  // Expiry, Reviews, Calendar-Retry, Websize-Sync, ...).
  const flagResult = await getSetting("feature.backgroundJobs");
  const jobsEnabled = !!(flagResult && flagResult.value);

  if (!jobsEnabled) {
    console.log("[jobs] feature.backgroundJobs=false — uebrige Jobs nicht gestartet (Shadow-Modus)");
    return;
  }

  console.log("[jobs] starte Hintergrund-Jobs ...");

  scheduleProvisionalExpiry(deps);
  scheduleProvisionalReminders(deps);
  scheduleReviewRequests(deps);
  scheduleCalendarRetry(deps);
  scheduleConfirmationPending(deps);
  scheduleWebsizeSync(deps);
  scheduleDuplicateCandidatesNightly(deps);
  scheduleCalendarStaleIdAudit(deps);

  console.log("[jobs] alle Jobs registriert");
}

module.exports = { startJobs };
