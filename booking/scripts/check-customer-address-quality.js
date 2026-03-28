#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

function parseTrailingZipCity(street) {
  const value = String(street || "").trim();
  const match = value.match(/,\s*(\d{4})\s+(.+)$/);
  if (!match) return null;
  return {
    zip: String(match[1] || "").trim(),
    city: String(match[2] || "").trim(),
    streetWithoutZipCity: value.replace(/,\s*\d{4}\s+.+$/, "").trim(),
  };
}

function needsReview(row) {
  const street = String(row.street || "");
  if (!street) return false;
  return /c\/o/i.test(street) || street.includes(",") || /\d{4}\s+\p{L}/u.test(street);
}

async function run() {
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) {
    console.error("DATABASE_URL nicht gesetzt (.env.local/.env).");
    process.exit(1);
  }

  const applySafeZipcity = process.argv.includes("--apply-safe-zipcity");
  const client = new Client({ connectionString });
  await client.connect();

  const rows = await client.query(
    `SELECT id, name, company, street, zip, city, zipcity, address_addon_1
     FROM customers
     ORDER BY id DESC`
  );

  const suspects = rows.rows.filter(needsReview);
  const safeUpdates = [];

  for (const row of suspects) {
    const parsed = parseTrailingZipCity(row.street);
    if (!parsed) continue;
    const zipMissing = !String(row.zip || "").trim();
    const cityMissing = !String(row.city || "").trim();
    const zipcityMissing = !String(row.zipcity || "").trim();
    if (!(zipMissing || cityMissing || zipcityMissing)) continue;

    safeUpdates.push({
      id: row.id,
      zip: zipMissing ? parsed.zip : String(row.zip || "").trim(),
      city: cityMissing ? parsed.city : String(row.city || "").trim(),
      zipcity: zipcityMissing
        ? `${parsed.zip} ${parsed.city}`.trim()
        : String(row.zipcity || "").trim(),
    });
  }

  console.log(`Suspects: ${suspects.length}`);
  console.log(`Safe zip/city updates possible: ${safeUpdates.length}`);
  for (const row of suspects.slice(0, 20)) {
    console.log(
      JSON.stringify({
        id: row.id,
        name: row.name,
        company: row.company,
        street: row.street,
        zip: row.zip,
        city: row.city,
        zipcity: row.zipcity,
        address_addon_1: row.address_addon_1,
      })
    );
  }

  if (applySafeZipcity && safeUpdates.length > 0) {
    for (const u of safeUpdates) {
      await client.query(
        `UPDATE customers
         SET zip = $1, city = $2, zipcity = $3
         WHERE id = $4`,
        [u.zip, u.city, u.zipcity, u.id]
      );
    }
    console.log(`Applied safe updates: ${safeUpdates.length}`);
  } else if (applySafeZipcity) {
    console.log("No safe updates to apply.");
  } else {
    console.log("Dry-run only. Use --apply-safe-zipcity to update missing zip/city fields.");
  }

  await client.end();
}

run().catch((err) => {
  console.error("Check failed:", err.message);
  process.exit(1);
});
