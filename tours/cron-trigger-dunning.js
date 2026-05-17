/**
 * Cron-Script: Mahnstufen-Automation (PRO-8).
 *
 * Taeglich z.B. 08:00 via:
 *   docker exec propus-platform-platform-1 node /app/tours/cron-trigger-dunning.js
 *
 * Skippt automatisch wenn `feature.dunningEnabled` in `core.settings` false.
 * Idempotent: doppelte Stufen pro Rechnung werden via UNIQUE-Index abgefangen.
 */
'use strict';

const { processDueDunningStages } = require('./lib/dunning');
const { pool } = require('./lib/db');

(async () => {
  console.log('[cron] processDueDunningStages gestartet', new Date().toISOString());
  try {
    const flagRow = await pool.query(
      `SELECT value FROM core.settings WHERE key = 'feature.dunningEnabled'`,
    ).catch(() => ({ rows: [] }));
    const enabled = flagRow.rows[0]?.value === true || flagRow.rows[0]?.value === 'true';
    if (!enabled) {
      console.log('[cron] feature.dunningEnabled=false, uebersprungen');
      process.exit(0);
    }
    const results = await processDueDunningStages({ batchLimit: 200 });
    console.log('[cron] Ergebnis:', JSON.stringify(results));
    process.exit(0);
  } catch (err) {
    console.error('[cron] FEHLER:', err.message);
    process.exit(1);
  }
})();
