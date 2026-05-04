/**
 * jobs/index.js
 * Registriert alle Cron-Jobs.
 * Wird in startServer() von server.js aufgerufen.
 *
 * Alle Jobs starten nur wenn "feature.backgroundJobs"=true (oder jobspezifisches Flag).
 *
 * @param {object} deps - { db, getSetting, graphClient, OFFICE_EMAIL, PHOTOG_PHONES }
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

  console.log("[jobs] alle Jobs registriert");
}

module.exports = { startJobs };
