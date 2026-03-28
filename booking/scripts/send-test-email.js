#!/usr/bin/env node
/**
 * Sendet eine Test-Mail per SMTP (office@propus.ch).
 * Verwendung: node scripts/send-test-email.js [empfaenger@email.ch]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config();

const nodemailer = require('nodemailer');

async function main() {
  const to = process.argv[2] || process.env.OFFICE_EMAIL || process.env.ADMIN_EMAIL || 'office@propus.ch';
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'office@propus.ch';

  if (!host || !user || !pass) {
    console.error('Fehler: SMTP_HOST, SMTP_USER, SMTP_PASS in .env setzen.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const subject = 'Test-Mail – Buchungstool (SMTP)';
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;">
      <p>Hallo,</p>
      <p>dies ist eine Test-Mail vom Buchungstool.</p>
      <p>SMTP-Versand (office@propus.ch) funktioniert.</p>
      <p>Freundliche Grüsse<br>Propus Buchungstool</p>
      <p style="font-size:11px;color:#666;">Gesendet am ${new Date().toLocaleString('de-CH')}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Propus" <${from}>`,
      to: to.trim(),
      subject,
      html: html.trim(),
      text: 'Test-Mail vom Buchungstool. SMTP-Versand funktioniert.',
    });
    console.log('OK: Test-Mail gesendet an', to);
  } catch (err) {
    console.error('Fehler:', err.message);
    process.exit(1);
  }
}

main();
