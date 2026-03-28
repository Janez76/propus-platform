#!/usr/bin/env node
/**
 * Migration-Runner für Propus Platform.
 *
 * Liest alle *.sql-Dateien aus migrations/ in alphabetischer Reihenfolge,
 * prüft ob sie bereits in core.applied_migrations eingetragen sind,
 * und führt noch nicht angewendete Migrationen aus.
 *
 * Umgebungsvariable:
 *   DATABASE_URL  – postgres://user:pass@host:port/db
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[migrate] DATABASE_URL nicht gesetzt – Abbruch.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 2,
  connectionTimeoutMillis: 10000,
});

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureTrackingTable() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS core`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS core.applied_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getApplied() {
  const { rows } = await pool.query('SELECT filename FROM core.applied_migrations ORDER BY filename');
  return new Set(rows.map((r) => r.filename));
}

async function run() {
  console.log('[migrate] Verbinde mit Datenbank …');
  await pool.query('SELECT 1');
  console.log('[migrate] Verbunden.');

  await ensureTrackingTable();
  const applied = await getApplied();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  [skip] ${file}`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`  [run]  ${file} …`);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO core.applied_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
        [file]
      );
      await client.query('COMMIT');
      count++;
      console.log(`  [ok]   ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  [FAIL] ${file}: ${err.message}`);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  console.log(`[migrate] ${count} Migration(en) ausgeführt, ${files.length - count} übersprungen.`);
  await pool.end();
}

run().catch((err) => {
  console.error('[migrate] Fataler Fehler:', err);
  process.exit(1);
});
