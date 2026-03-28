#!/usr/bin/env node
/**
 * Sendet eine einfache Test-Mail.
 * Verwendung: node scripts/send-test-email.js [empfaenger@email.ch]
 * Ohne Argument: Empfänger = ADMIN_EMAIL oder erste M365-Mailbox
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../docker/.env') });
require('dotenv').config();

const { getGraphConfig, sendMailDirect } = require('../lib/microsoft-graph');

async function main() {
  const to = process.argv[2] || process.env.ADMIN_EMAIL || getGraphConfig().mailboxUpn;
  if (!to || !to.includes('@')) {
    console.error('Verwendung: node scripts/send-test-email.js [empfaenger@email.ch]');
    process.exit(1);
  }

  const subject = 'Test-Mail – Propus Tour Manager';
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">
      <p>Hallo,</p>
      <p>dies ist eine automatisch generierte Test-Mail.</p>
      <p>Der Tour-Manager-E-Mail-Versand funktioniert.</p>
      <p>Freundliche Grüsse<br>Propus Tour Manager</p>
      <p style="font-size:11px;color:#666;">Gesendet am ${new Date().toLocaleString('de-CH')}</p>
    </div>
  `;

  try {
    const result = await sendMailDirect({
      to: to.trim(),
      subject,
      htmlBody: html.trim(),
    });
    if (!result.success) {
      console.error('Fehler:', result.error);
      if (String(result.error || '').includes('Access is denied')) {
        console.error('\nHinweis: Azure App braucht Mail.Send + ggf. ApplicationAccessPolicy.');
        console.error('Siehe: docker/M365-MAIL-SETUP.md');
      }
      process.exit(1);
    }
    console.log('OK: Test-Mail gesendet an', to);
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
}

main();
