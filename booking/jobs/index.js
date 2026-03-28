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

async function startJobs(deps) {
  const { getSetting } = deps;

  // Globaler Jobs-Flag
  const flagResult = await getSetting("feature.backgroundJobs");
  const jobsEnabled = !!(flagResult && flagResult.value);

  if (!jobsEnabled) {
    console.log("[jobs] feature.backgroundJobs=false — keine Jobs gestartet (Shadow-Modus)");
    return;
  }

  console.log("[jobs] starte Hintergrund-Jobs ...");

  scheduleProvisionalExpiry(deps);
  scheduleProvisionalReminders(deps);
  scheduleReviewRequests(deps);
  scheduleCalendarRetry(deps);
  scheduleConfirmationPending(deps);
  scheduleWebsizeSync(deps);

  console.log("[jobs] alle Jobs registriert");
}

module.exports = { startJobs };
