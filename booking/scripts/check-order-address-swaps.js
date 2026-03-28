#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config({ path: path.join(__dirname, "..", ".env.local") });
dotenv.config({ path: path.join(__dirname, "..", ".env") });

async function run() {
  const connectionString = process.env.DATABASE_URL || "";
  if (!connectionString) {
    console.error("DATABASE_URL nicht gesetzt (.env.local/.env).");
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  const { rows } = await client.query(
    `SELECT o.order_no,
            o.address,
            o.billing->>'street'  AS billing_street,
            o.billing->>'zipcity' AS billing_zipcity,
            c.street              AS customer_street,
            c.zipcity             AS customer_zipcity
       FROM orders o
       LEFT JOIN customers c ON c.id = o.customer_id
      WHERE COALESCE(o.address, '') <> ''
        AND (
          -- billing entspricht exakt customer-street + customer-zipcity (normalerweise ok)
          -- oder wirkt wie vertauscht: Objektadresse im billing und Kundenadresse in address
          (COALESCE(o.billing->>'street','') <> '' AND COALESCE(o.billing->>'zipcity','') <> '')
        )
      ORDER BY o.order_no DESC`
  );

  const suspicious = rows.filter((r) => {
    const addr = String(r.address || "").toLowerCase();
    const bStreet = String(r.billing_street || "").toLowerCase();
    const bZipCity = String(r.billing_zipcity || "").toLowerCase();
    const cStreet = String(r.customer_street || "").toLowerCase();
    const cZipCity = String(r.customer_zipcity || "").toLowerCase();
    if (!addr || !bStreet) return false;
    const billingFull = `${bStreet} ${bZipCity}`.trim();
    const customerFull = `${cStreet} ${cZipCity}`.trim();
    // Verdacht: address entspricht eher Kundenstammadresse, billing eher Objektadresse
    return customerFull && addr.includes(cStreet) && billingFull !== customerFull;
  });

  console.log(JSON.stringify({ total: rows.length, suspiciousCount: suspicious.length, suspicious }, null, 2));
  await client.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

