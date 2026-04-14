/**
 * Cron-Script: Faellige Verlaeengerungsrechnungen senden.
 * Taeglich 07:00 via: docker exec propus-platform-platform-1 node /app/tours/cron-trigger-renewals.js
 */
'use strict';

const { triggerDueRenewalInvoices } = require('./lib/subscriptions');

console.log('[cron] triggerDueRenewalInvoices gestartet', new Date().toISOString());

triggerDueRenewalInvoices()
  .then(results => {
    console.log('[cron] Ergebnis:', JSON.stringify(results));
    process.exit(0);
  })
  .catch(err => {
    console.error('[cron] FEHLER:', err.message);
    process.exit(1);
  });
