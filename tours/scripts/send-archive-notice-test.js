#!/usr/bin/env node
/**
 * Test-Versand der Archivierungs-Mitteilung.
 * Verwendung: node scripts/send-archive-notice-test.js <tour-id>
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../docker/.env') });
require('dotenv').config();

const tourActions = require('../lib/tour-actions');

const tourId = process.argv[2];
if (!tourId) {
  console.error('Verwendung: node scripts/send-archive-notice-test.js <tour-id>');
  process.exit(1);
}

async function main() {
  try {
    const result = await tourActions.sendArchiveNoticeEmail(tourId, 'system', 'test-script');
    if (result.success) {
      console.log('OK: Archivierungs-Mail gesendet an', result.recipientEmail);
    } else {
      console.error('Fehler:', result.error);
      process.exit(1);
    }
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();
