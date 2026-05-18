#!/usr/bin/env node
/**
 * PRO-81: PDF-Re-Render der betroffenen Renewal-Rechnungen mit korrigiertem
 * MwSt-Ausweis. **Versendet KEINE E-Mails.**
 *
 * Hintergrund: Bis 2026-05-17 wurden Renewal-Rechnungen (portal_extension /
 * portal_reactivation) ohne MwSt-Aufschlüsselung versendet. Nach dem Code-Fix
 * rendert der PDF-Generator den MwSt-Block korrekt — bestehende DB-Records
 * bekommen also automatisch ein korrektes PDF beim nächsten Render.
 *
 * Dieses Skript regeneriert die PDFs lokal nach `./out/pro-81/` zur Sichtprüfung
 * (Vergleich mit dem alten PDF, Beleg für den Kunden, manuelles Resending durch
 * Janez via Admin-UI).
 *
 * Usage:
 *   node scripts/resend-renewal-invoices-vat-fix.js              # alle offenen
 *   node scripts/resend-renewal-invoices-vat-fix.js --only-id=46 # nur #46 (Mia)
 *
 * Filter:
 *   - invoice_kind IN ('portal_extension','portal_reactivation')
 *   - invoice_status IN ('sent','pending','overdue')   (nicht 'paid', nicht 'cancelled')
 */

'use strict';

const path = require('path');
const fs = require('fs');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* dotenv optional */
}

const onlyArg = process.argv.find((a) => a.startsWith('--only-id='));
const ONLY_ID = onlyArg ? Number(onlyArg.split('=')[1]) : null;

const OUT_DIR = path.join(__dirname, '..', 'out', 'pro-81');

async function main() {
  const { pool } = require('../tours/lib/db');
  const { generateInvoicePdfBuffer } = require('../tours/lib/renewal-invoice-pdf');

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const params = [];
  let whereExtra = '';
  if (ONLY_ID) {
    params.push(ONLY_ID);
    whereExtra = `AND ri.id = $${params.length}`;
  }

  const sql = `
    SELECT ri.*,
           t.object_label, t.bezeichnung, t.canonical_object_label,
           COALESCE(ri.customer_email, t.customer_email) AS recipient_email
    FROM tour_manager.renewal_invoices ri
    JOIN tour_manager.tours t ON t.id = ri.tour_id
    WHERE ri.invoice_kind IN ('portal_extension','portal_reactivation')
      AND ri.invoice_status IN ('sent','pending','overdue')
      ${whereExtra}
    ORDER BY ri.id ASC
  `;

  const { rows } = await pool.query(sql, params);

  console.log(`\n[PRO-81 PDF Re-Render] ${rows.length} Rechnung(en) gefunden${ONLY_ID ? ` (gefiltert auf #${ONLY_ID})` : ''}.`);
  console.log(`Output: ${OUT_DIR}`);
  console.log(`Versand: NEIN — nur PDF-Export für Sichtprüfung.`);
  console.log('─'.repeat(80));

  const results = [];
  for (const inv of rows) {
    const tourRes = await pool.query('SELECT * FROM tour_manager.tours WHERE id = $1', [inv.tour_id]);
    const tour = tourRes.rows[0];

    const invLabel = (inv.invoice_number || `R${inv.id}`).replace(/[^a-zA-Z0-9-_]/g, '-');
    const fname = `${String(inv.id).padStart(4, '0')}_${invLabel}_${inv.invoice_kind}.pdf`;
    const outPath = path.join(OUT_DIR, fname);

    try {
      const buf = await generateInvoicePdfBuffer(inv, tour);
      fs.writeFileSync(outPath, buf);
      const sizeKb = (buf.length / 1024).toFixed(1);
      console.log(`  ✓ #${String(inv.id).padStart(3)} ${invLabel.padEnd(18)} CHF ${String(Number(inv.amount_chf).toFixed(2)).padStart(7)} → ${fname} (${sizeKb} KB)  [${inv.recipient_email}]`);
      results.push({ id: inv.id, file: fname, ok: true });
    } catch (err) {
      console.warn(`  ✗ #${inv.id} FAIL: ${err.message}`);
      results.push({ id: inv.id, ok: false, error: err.message });
    }
  }

  const ok = results.filter((x) => x.ok).length;
  console.log(`\n[PRO-81 PDF Re-Render] Done. ${ok}/${rows.length} ok. Verzeichnis: ${OUT_DIR}`);
  console.log(`Versand bleibt manuell — Admin-UI nutzen.`);

  await pool.end();
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
