#!/usr/bin/env node
/**
 * Upload-Diagnose: Fehlgeschlagene Batches und Dateien aus der DB auslesen.
 * Nutzung: node backend/scripts/check-upload-logs.js
 *
 * Zeigt:
 * - Fehlgeschlagene Upload-Batches (Status failed)
 * - Einzelne fehlgeschlagene Dateien mit error_message
 * - Lang laufende/steckengebliebene Transfers (transferring/retrying > 1h)
 * - Letzte N Batches pro Ordnertyp
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../../.env.local") });

const { Pool } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL nicht gesetzt (.env/.env.local).");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Upload-Diagnose (Kundenordner / Rohmaterial) ===\n");

    // 1) Fehlgeschlagene Batches
    const { rows: failedBatches } = await client.query(
      `SELECT id, order_no, folder_type, category, status, error_message,
              file_count, total_bytes, created_at, started_at, completed_at,
              target_absolute_path
       FROM upload_batches
       WHERE status = 'failed'
       ORDER BY created_at DESC
       LIMIT 30`
    );

    if (failedBatches.length > 0) {
      console.log("--- Fehlgeschlagene Upload-Batches ---");
      for (const b of failedBatches) {
        const folderLabel = b.folder_type === "raw_material" ? "Rohmaterial" : "Kundenordner";
        console.log(`  Batch ${b.id}`);
        console.log(`    Auftrag: ${b.order_no} | ${folderLabel} | ${b.category}`);
        console.log(`    Fehler: ${b.error_message || "(kein Text)"}`);
        console.log(`    Erstellt: ${b.created_at} | Gestartet: ${b.started_at}`);
        if (b.target_absolute_path) console.log(`    Ziel: ${b.target_absolute_path}`);
        console.log("");
      }
    } else {
      console.log("--- Keine fehlgeschlagenen Batches gefunden ---\n");
    }

    // 2) Einzelne fehlgeschlagene Dateien (auch in teilweise erfolgreichen Batches)
    const { rows: failedFiles } = await client.query(
      `SELECT f.id, f.batch_id, f.original_name, f.size_bytes, f.status, f.error_message,
              b.order_no, b.folder_type, b.category, b.created_at
       FROM upload_batch_files f
       JOIN upload_batches b ON f.batch_id = b.id
       WHERE f.status = 'failed'
       ORDER BY b.created_at DESC, f.id
       LIMIT 50`
    );

    if (failedFiles.length > 0) {
      console.log("--- Fehlgeschlagene Einzeldateien ---");
      for (const f of failedFiles) {
        const folderLabel = f.folder_type === "raw_material" ? "Rohmaterial" : "Kundenordner";
        const sizeMB = (f.size_bytes / (1024 * 1024)).toFixed(2);
        console.log(`  ${f.original_name} (${sizeMB} MB)`);
        console.log(`    Batch: ${f.batch_id} | Auftrag: ${f.order_no} | ${folderLabel}`);
        console.log(`    Fehler: ${f.error_message || "(kein Text)"}`);
        console.log(`    Erstellt: ${f.created_at}`);
        console.log("");
      }
    } else {
      console.log("--- Keine fehlgeschlagenen Einzeldateien ---\n");
    }

    // 3) Steckengebliebene Transfers (transferring/retrying seit > 1 Stunde)
    const { rows: stuck } = await client.query(
      `SELECT id, order_no, folder_type, status, started_at, created_at
       FROM upload_batches
       WHERE status IN ('transferring','retrying')
         AND (started_at IS NULL OR started_at < NOW() - INTERVAL '1 hour')
       ORDER BY created_at ASC`
    );

    if (stuck.length > 0) {
      console.log("--- Steckengebliebene Transfers (> 1h) ---");
      for (const s of stuck) {
        const folderLabel = s.folder_type === "raw_material" ? "Rohmaterial" : "Kundenordner";
        console.log(`  ${s.id} | Auftrag ${s.order_no} | ${folderLabel} | Status: ${s.status}`);
        console.log(`    Gestartet: ${s.started_at || "(kein)"} | Erstellt: ${s.created_at}`);
        console.log("");
      }
    } else {
      console.log("--- Keine steckengebliebenen Transfers ---\n");
    }

    // 4) Letzte Batches (Erfolg + Laufzeit)
    const { rows: recent } = await client.query(
      `SELECT id, order_no, folder_type, category, status, file_count, total_bytes,
              created_at, started_at, completed_at,
              EXTRACT(EPOCH FROM (completed_at::timestamptz - started_at::timestamptz)) AS duration_seconds
       FROM upload_batches
       WHERE status IN ('completed','failed')
       ORDER BY created_at DESC
       LIMIT 15`
    );

    console.log("--- Letzte Batches (mit Dauer) ---");
    for (const r of recent) {
      const folderLabel = r.folder_type === "raw_material" ? "Rohmaterial" : "Kundenordner";
      const sizeMB = (Number(r.total_bytes) / (1024 * 1024)).toFixed(1);
      const dur = r.duration_seconds != null ? `${Math.round(r.duration_seconds)}s` : "-";
      const statusIcon = r.status === "completed" ? "✓" : "✗";
      console.log(
        `  ${statusIcon} ${r.id} | #${r.order_no} | ${folderLabel} | ${r.file_count} Dateien, ${sizeMB} MB | Dauer: ${dur}`
      );
    }

    console.log("\n=== Ende Diagnose ===");
  } catch (err) {
    console.error("Fehler:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
