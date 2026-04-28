#!/usr/bin/env node
/**
 * Backfill leerer Felder in `booking.orders.billing` aus dem Kundenstamm
 * `core.customers` (Match per E-Mail inkl. `email_aliases`).
 *
 * Ergänzt nur fehlende Felder – bestehende Werte werden nie überschrieben.
 *
 * Felder, die ergänzt werden, falls leer/fehlend:
 *   - billing.street      ← core.customers.street
 *   - billing.zip         ← core.customers.zip   (Fallback: aus zipcity)
 *   - billing.city        ← core.customers.city  (Fallback: aus zipcity)
 *   - billing.first_name  ← core.customers.first_name
 *                         oder: Split aus billing.name (erstes Token)
 *   - billing.salutation  ← core.customers.salutation
 *   - billing.phone       ← core.customers.phone (falls leer)
 *   - billing.company     ← core.customers.company (nur falls leer & vorhanden)
 *
 * Aufruf:
 *   DATABASE_URL=... node scripts/backfill-orders-billing-from-customers.js           # Dry-Run
 *   DATABASE_URL=... node scripts/backfill-orders-billing-from-customers.js --apply   # echte Änderungen
 *   DATABASE_URL=... node scripts/backfill-orders-billing-from-customers.js --apply --order 100091
 *
 * .env-Reihenfolge: --env-file → booking/.env → Repo-Root/.env → app/.env
 */
"use strict";

const fs = require("fs");
const path = require("path");

const _pg = path.join(__dirname, "../booking/node_modules/pg");
const { Pool } = require(fs.existsSync(path.join(_pg, "package.json")) ? _pg : "pg");

function tryRequireDotenv() {
  const d = path.join(__dirname, "../booking/node_modules/dotenv");
  try { return require(d); } catch { try { return require("dotenv"); } catch { return null; } }
}

function loadEnv(args) {
  if (String(process.env.DATABASE_URL || "").trim()) return;
  const dotenv = tryRequireDotenv();
  if (!dotenv) return;
  const list = [
    args.envFile ? path.resolve(args.envFile) : null,
    path.join(__dirname, "../booking/.env"),
    path.join(__dirname, "../.env"),
    path.join(__dirname, "../app/.env"),
  ].filter(Boolean);
  for (const p of list) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      if (process.env.DATABASE_URL) return;
    }
  }
}

function parseArgs(argv) {
  const out = { apply: false, order: null, envFile: null, limit: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--order" || a === "-o") out.order = String(argv[++i] || "").trim() || null;
    else if (a === "--env-file" || a === "-f") out.envFile = String(argv[++i] || "").trim() || null;
    else if (a === "--limit") out.limit = Math.max(1, parseInt(argv[++i], 10) || 0) || null;
  }
  return out;
}

/** Erstes Token als Vorname, Rest als Nachname – nur wenn name >= 2 Tokens. */
function splitFullName(fullName) {
  const last = String(fullName || "").trim();
  if (last.length < 2) return null;
  const parts = last.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** zipcity (z. B. "8001 Zürich") → { zip, city }. */
function splitZipCity(zipcity) {
  const s = String(zipcity || "").trim();
  if (!s) return { zip: "", city: "" };
  const m = s.match(/^\s*(\d{4,6})\s+(.+?)\s*$/);
  if (m) return { zip: m[1], city: m[2] };
  return { zip: "", city: s };
}

function isBlank(v) {
  return v == null || String(v).trim() === "";
}

async function main() {
  const args = parseArgs(process.argv);
  loadEnv(args);
  if (!process.env.DATABASE_URL) {
    console.error("Fehlt: DATABASE_URL (oder --env-file übergeben).");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("SET search_path TO booking, core, public");

    const where = [];
    const params = [];
    if (args.order) {
      params.push(args.order);
      where.push(`o.order_no::text = $${params.length}`);
    }
    const limitSql = args.limit ? `LIMIT ${args.limit}` : "";
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
      SELECT
        o.order_no,
        o.billing,
        c.id            AS customer_id,
        c.email         AS c_email,
        c.first_name    AS c_first_name,
        c.name          AS c_name,
        c.company       AS c_company,
        c.salutation    AS c_salutation,
        c.phone         AS c_phone,
        c.street        AS c_street,
        c.zip           AS c_zip,
        c.city          AS c_city,
        c.zipcity       AS c_zipcity
      FROM booking.orders o
      LEFT JOIN LATERAL (
        SELECT cc.*
        FROM core.customers cc
        WHERE core.customer_email_matches(
          COALESCE(o.billing->>'email',''),
          COALESCE(cc.email,''),
          COALESCE(cc.email_aliases,'{}')
        )
        ORDER BY cc.id ASC
        LIMIT 1
      ) c ON TRUE
      ${whereSql}
      ORDER BY o.order_no ASC
      ${limitSql}
    `;

    const { rows } = await client.query(sql, params);

    let scanned = 0;
    let candidates = 0;
    let updated = 0;
    const changes = [];

    for (const r of rows) {
      scanned++;
      const billing = r.billing && typeof r.billing === "object" ? { ...r.billing } : {};
      const before = { ...billing };

      // Name-Split aus dem Bestelldatensatz selbst (kein Kunde nötig)
      if (isBlank(billing.first_name)) {
        const split = splitFullName(billing.name);
        if (split) {
          billing.first_name = split.first;
          billing.name = split.last;
        }
      }

      // Aus Kunde befüllen, wenn vorhanden
      if (r.customer_id) {
        if (isBlank(billing.first_name) && !isBlank(r.c_first_name)) {
          billing.first_name = String(r.c_first_name).trim();
        }
        if (isBlank(billing.salutation) && !isBlank(r.c_salutation)) {
          billing.salutation = String(r.c_salutation).trim();
        }
        if (isBlank(billing.street) && !isBlank(r.c_street)) {
          billing.street = String(r.c_street).trim();
        }
        // zip/city: erst direkte Felder, dann zipcity-Split als Fallback
        if (isBlank(billing.zip) && !isBlank(r.c_zip)) {
          billing.zip = String(r.c_zip).trim();
        }
        if (isBlank(billing.city) && !isBlank(r.c_city)) {
          billing.city = String(r.c_city).trim();
        }
        if ((isBlank(billing.zip) || isBlank(billing.city)) && !isBlank(r.c_zipcity)) {
          const fallback = splitZipCity(r.c_zipcity);
          if (isBlank(billing.zip) && fallback.zip) billing.zip = fallback.zip;
          if (isBlank(billing.city) && fallback.city) billing.city = fallback.city;
        }
        if (isBlank(billing.phone) && !isBlank(r.c_phone)) {
          billing.phone = String(r.c_phone).trim();
        }
        if (isBlank(billing.company) && !isBlank(r.c_company)) {
          billing.company = String(r.c_company).trim();
        }
      }

      // Diff bestimmen
      const diffKeys = Object.keys(billing).filter(
        (k) => String(before[k] ?? "") !== String(billing[k] ?? "")
      );
      if (diffKeys.length === 0) continue;

      candidates++;
      const diffSummary = diffKeys.map((k) => `${k}: "${before[k] ?? ""}" → "${billing[k] ?? ""}"`).join(", ");
      const customerNote = r.customer_id ? `Kunde #${r.customer_id}` : "ohne Kundenstamm";
      changes.push({ order_no: r.order_no, customer_id: r.customer_id, diffKeys, summary: `#${r.order_no} (${customerNote}): ${diffSummary}` });

      if (args.apply) {
        await client.query("BEGIN");
        try {
          await client.query(
            `UPDATE booking.orders
             SET billing = billing || $1::jsonb,
                 updated_at = NOW()
             WHERE order_no = $2`,
            [JSON.stringify(Object.fromEntries(diffKeys.map((k) => [k, billing[k]]))), r.order_no],
          );
          await client.query(
            `INSERT INTO booking.order_event_log
               (order_no, event_type, actor_user, actor_role, old_value, new_value, metadata)
             VALUES ($1, 'billing_updated', $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)`,
            [
              r.order_no,
              "system:backfill-orders-billing-from-customers",
              "system",
              JSON.stringify({ billing: Object.fromEntries(diffKeys.map((k) => [k, before[k] ?? null])) }),
              JSON.stringify({ billing: Object.fromEntries(diffKeys.map((k) => [k, billing[k] ?? null])) }),
              JSON.stringify({
                source: "scripts/backfill-orders-billing-from-customers.js",
                customer_id: r.customer_id,
                fields: diffKeys,
              }),
            ],
          );
          await client.query("COMMIT");
          updated++;
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`[FEHLER] #${r.order_no}: ${err.message}`);
        }
      }
    }

    console.log(`Geprüft: ${scanned} Bestellungen`);
    console.log(`Kandidaten (mit fehlenden Feldern): ${candidates}`);
    if (args.apply) {
      console.log(`Aktualisiert: ${updated}`);
    } else {
      console.log("Modus: DRY-RUN (keine Änderungen). Mit --apply ausführen, um zu schreiben.");
    }
    if (changes.length > 0) {
      console.log("\nDetails:");
      for (const c of changes) console.log(`  ${c.summary}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
