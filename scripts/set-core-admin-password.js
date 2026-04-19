#!/usr/bin/env node
/**
 * Setzt password_hash in core.admin_users (gleicher Hash wie booking/customer-auth.js /scrypt).
 *
 *   DATABASE_URL=... node scripts/set-core-admin-password.js <email> <neuesPasswort>
 *
 * Im Platform-Container (`pg` liegt unter `/app/booking/node_modules`):
 *   docker exec -e NODE_PATH=/app/booking/node_modules propus-staging-platform-1 \\
 *     node /app/scripts/set-core-admin-password.js user@firma.ch '***'
 */
const { Pool } = require("pg");
const path = require("path");

const customerAuth = require(path.join(__dirname, "..", "booking", "customer-auth"));

async function main() {
  const email = String(process.argv[2] || "").trim();
  const password = process.argv[3];
  if (!email || password === undefined) {
    console.error("Usage: node scripts/set-core-admin-password.js <email> <newPassword>");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL fehlt.");
    process.exit(1);
  }

  const hash = await customerAuth.hashPassword(String(password));
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  const r = await pool.query(
    `UPDATE core.admin_users
     SET password_hash = $1, updated_at = NOW()
     WHERE LOWER(email) = LOWER($2)`,
    [hash, email]
  );

  console.log(`[set-core-admin-password] updated rows: ${r.rowCount} (email=${email})`);
  if (r.rowCount === 0) {
    console.error("[set-core-admin-password] Kein Treffer – E-Mail prüfen oder Nutzer in core.admin_users anlegen.");
    process.exit(1);
  }

  await pool.end();
}

main().catch((e) => {
  console.error("[set-core-admin-password]", e.message || e);
  process.exit(1);
});
