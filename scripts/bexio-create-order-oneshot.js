#!/usr/bin/env node
/**
 * bexio-create-order-oneshot.js
 *
 * Erzeugt einen bexio kb_order (Auftragsbestätigung) für genau einen
 * Propus-Auftrag. Nutzt das Helper-Modul booking/bexio-sales-order.js,
 * holt die Order aus der Prod-DB (DATABASE_URL erforderlich) und ruft
 * danach die bexio-API.
 *
 * KEIN UI, KEINE MIGRATIONEN nötig — denkbar als Brücke, solange das
 * Feature noch nicht in Prod deployed ist. Status wird NICHT in der DB
 * vermerkt (das macht nur der UI-Pfad), Duplikate-Vermeidung also nur
 * über den --dry-run-Lauf.
 *
 * ENV: BEXIO_API_TOKEN, BEXIO_API_BASE, DATABASE_URL
 *      (lädt aus .env, .env.vps, .env.vps.secrets)
 *
 * Nutzung:
 *   node scripts/bexio-create-order-oneshot.js --order=100097 --dry-run
 *   node scripts/bexio-create-order-oneshot.js --order=100097 --execute
 */

const path = require("path");
const fs = require("fs");

function loadEnv(filePath, override = false) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!override && process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, "..", ".env"));
loadEnv(path.resolve(__dirname, "..", ".env.vps"));
loadEnv(path.resolve(__dirname, "..", ".env.vps.secrets"));

// CLI
const args = process.argv.slice(2);
const flags = { dryRun: true };
for (const a of args) {
  if (a === "--execute") { flags.execute = true; flags.dryRun = false; }
  else if (a === "--dry-run") flags.dryRun = true;
  else if (a.startsWith("--order=")) flags.orderNo = Number(a.split("=")[1]);
}
if (!Number.isFinite(flags.orderNo)) {
  console.error("FEHLER: --order=<nummer> erforderlich.");
  process.exit(1);
}

const TOKEN = process.env.BEXIO_API_TOKEN;
const BASE = (process.env.BEXIO_API_BASE || "https://api.bexio.com").replace(/\/$/, "");
const DB_URL = process.env.DATABASE_URL;
if (!TOKEN) { console.error("FEHLER: BEXIO_API_TOKEN fehlt."); process.exit(1); }
if (!DB_URL) { console.error("FEHLER: DATABASE_URL fehlt — Order kann nicht aus DB geholt werden."); process.exit(1); }

const helper = require(path.resolve(__dirname, "..", "booking", "bexio-sales-order.js"));

// Hardcoded Defaults (gleiche IDs wie scripts/bexio-config-apply.sql)
const CONFIG = helper.loadBexioConfig({
  userId: 1, ownerId: 1, currencyId: 1, languageId: 1,
  paymentTypeId: 4, bankAccountId: 1, vatTaxId: 17,
  mwstType: 0, mwstIsNet: true,
  headerTemplate: "{{address}} #{{orderNo}}",
  footerTemplate: "Zahlbar innert 14 Tagen netto, ohne Abzug.",
});

(async () => {
  const cfgErr = helper.validateBexioConfig(CONFIG);
  if (cfgErr) { console.error("FEHLER:", cfgErr); process.exit(1); }

  // Order aus DB holen
  const pgPath = path.resolve(__dirname, "..", "booking", "node_modules", "pg");
  const { Pool } = require(fs.existsSync(path.join(pgPath, "package.json")) ? pgPath : "pg");
  const pool = new Pool({ connectionString: DB_URL });
  const { rows } = await pool.query(
    `SELECT o.*, c.email AS customer_email, c.bexio_contact_id, c.exxas_customer_id
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.order_no = $1`,
    [flags.orderNo]
  );
  await pool.end();
  if (!rows[0]) { console.error(`FEHLER: Order #${flags.orderNo} nicht in DB gefunden.`); process.exit(1); }
  const order = {
    orderNo: rows[0].order_no,
    address: rows[0].address,
    services: rows[0].services,
    pricing: rows[0].pricing,
    billing: rows[0].billing,
    customerId: rows[0].customer_id,
    customerEmail: rows[0].customer_email,
    bexioContactId: rows[0].bexio_contact_id,
    exxasCustomerId: rows[0].exxas_customer_id,
  };
  console.log(`\nOrder #${order.orderNo} — ${order.address}`);
  console.log(`  Customer Email: ${order.customerEmail || "—"}`);
  console.log(`  Services:`, JSON.stringify(order.services, null, 2).slice(0, 800));
  console.log(`  Pricing:`, JSON.stringify(order.pricing));

  // Stub für db: nur was resolveBexioContactId konsumiert
  const dbStub = { getCustomerById: async () => null };

  // Contact lookup (read-only auch im dry-run)
  const contactRes = await helper.resolveBexioContactId({
    order, db: dbStub, bexioBase: BASE, bexioToken: TOKEN,
  });
  console.log(`\nbexio-Contact-Resolution: source=${contactRes.source}  id=${contactRes.value || "—"}`);
  if (!contactRes.value) {
    console.error(`FEHLER: ${contactRes.error}`);
    process.exit(1);
  }
  const contactId = contactRes.value;

  const body = helper.buildBexioOrderBody({ order, contactId, config: CONFIG });
  const positions = helper.buildBexioPositions({ order, config: CONFIG });
  console.log(`\nkb_order Body:\n${JSON.stringify(body, null, 2)}`);
  console.log(`\nPositions (${positions.length}):`);
  for (const p of positions) console.log(`  - ${p.text}  ${p.amount}  qty=${p.quantity}  tax_id=${p.tax_id}`);

  if (flags.dryRun) {
    console.log(`\n[DRY-RUN] Kein API-Call. Mit --execute starten, um wirklich anzulegen.`);
    return;
  }

  // EXECUTE
  console.log(`\n→ POST /2.0/kb_order …`);
  const created = await helper.postBexio({ bexioBase: BASE, bexioToken: TOKEN, path: "/2.0/kb_order", body });
  const id = Number(created.id);
  const nr = String(created.document_nr || created.documentNr || "");
  console.log(`✓ kb_order angelegt: id=${id}  document_nr=${nr}`);

  let pOk = 0, pFail = 0;
  for (const pos of positions) {
    try {
      await helper.postBexio({ bexioBase: BASE, bexioToken: TOKEN, path: `/2.0/kb_order/${id}/kb_position_custom`, body: pos });
      pOk++;
    } catch (e) {
      pFail++;
      console.error(`  ✗ Position "${pos.text}": ${e.message.slice(0, 200)}`);
    }
  }
  console.log(`\n✓ Fertig: ${pOk}/${positions.length} Positionen angelegt${pFail ? ` (${pFail} Fehler)` : ""}`);
  console.log(`bexio: https://office.bexio.com/index.php/kb_order/show/id/${id}`);
})().catch((e) => { console.error("\nABBRUCH:", e.message); process.exit(1); });
