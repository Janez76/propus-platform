/**
 * jobs/websize-sync.js
 *
 * Alle 10 Minuten: Prüft alle Kundenordner auf neue/aktualisierte Dateien in
 * "Finale/Bilder/FULLSIZE" und erzeugt fehlende oder veraltete Kopien in
 * "Finale/Bilder/WEB SIZE" (max. lange Seite 1920 px, JPEG 90 %).
 *
 * Unterstützte Eingabeformate: .jpg .jpeg .png .tif .tiff .webp .heic .heif
 * Ausgabe: immer <name>.jpg (Kleinbuchstaben, Endung normiert)
 */

"use strict";

const { activeTransfers } = require("../upload-batch-service");
const fs    = require("fs");
const path  = require("path");
const cron  = require("node-cron");
const sharp = require("sharp");

const FULLSIZE_SUBPATH = "Finale/Bilder/FULLSIZE";
const WEBSIZE_SUBPATH  = "Finale/Bilder/WEB SIZE";
const MAX_LONG_EDGE    = 1920;
const JPEG_QUALITY     = 90;
const SUPPORTED_EXT    = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".heic", ".heif"]);

/**
 * Gibt alle Dateien (rekursiv) in einem Verzeichnis zurück.
 * @param {string} dir
 * @returns {string[]} absolute Pfade
 */
function listFilesRecursive(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(abs));
    } else if (entry.isFile()) {
      results.push(abs);
    }
  }
  return results;
}

/**
 * Erzeugt (oder aktualisiert) die Websize-Kopie einer Fullsize-Datei.
 * @param {string} srcAbs   absoluter Pfad der FULLSIZE-Datei
 * @param {string} srcRoot  FULLSIZE-Wurzel (für relative Pfad-Berechnung)
 * @param {string} dstRoot  WEBSIZE-Wurzel
 * @returns {Promise<"created"|"skipped"|"error">}
 */
async function ensureWebsizeCopy(srcAbs, srcRoot, dstRoot) {
  const ext = path.extname(srcAbs).toLowerCase();
  if (!SUPPORTED_EXT.has(ext)) return "skipped";

  const relativeSrc = path.relative(srcRoot, srcAbs);
  const baseName    = path.basename(relativeSrc, ext);
  const relativeDir = path.dirname(relativeSrc);
  const dstDir      = path.join(dstRoot, relativeDir === "." ? "" : relativeDir);
  const dstAbs      = path.join(dstDir, baseName + ".jpg");

  const srcStat = fs.statSync(srcAbs);

  if (fs.existsSync(dstAbs)) {
    const dstStat = fs.statSync(dstAbs);
    // Überspringen, wenn Websize neuer als Fullsize
    if (dstStat.mtimeMs >= srcStat.mtimeMs) return "skipped";
  }

  try {
    fs.mkdirSync(dstDir, { recursive: true });
    await sharp(srcAbs)
      .rotate()                          // EXIF-Rotation korrigieren
      .resize({
        width:  MAX_LONG_EDGE,
        height: MAX_LONG_EDGE,
        fit:    "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY, progressive: true })
      .toFile(dstAbs);
    if (srcStat.atime && srcStat.mtime) {
      try { fs.utimesSync(dstAbs, srcStat.atime, srcStat.mtime); } catch (_) {}
    }
    return "created";
  } catch (err) {
    console.error("[job:websizeSync] Fehler bei", srcAbs, "->", dstAbs, err && err.message);
    return "error";
  }
}

/**
 * Führt die Synchronisation für alle Aufträge durch, die einen Kundenordner haben.
 * @param {object} deps - { db }  db muss eine getPool()-Methode besitzen
 */
async function runWebsizeSync(deps) {
  const { db } = deps;
  if (!db) return;

  // Kein websizeSync waehrend aktivem Batch-Transfer (CPU/SMB-Konkurrenz)
  if (activeTransfers && activeTransfers.size > 0) {
    console.log("[job:websizeSync] uebersprungen -- " + activeTransfers.size + " Transfer(s) aktiv");
    return;
  }

  // Alle aktiven Kundenordner aus order_folder_links laden
  let folderLinks;
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) {
      console.warn("[job:websizeSync] Kein DB-Pool verfügbar, übersprungen");
      return;
    }
    const { rows } = await pool.query(
      `SELECT absolute_path
       FROM order_folder_links
       WHERE folder_type = 'customer_folder'
         AND archived_at IS NULL
         AND absolute_path IS NOT NULL
       ORDER BY order_no`,
    );
    folderLinks = rows;
  } catch (err) {
    console.error("[job:websizeSync] Kann Ordnerliste nicht laden:", err && err.message);
    return;
  }

  if (!folderLinks || !folderLinks.length) return;

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors  = 0;

  for (const link of folderLinks) {
    const customerRoot = link.absolute_path;
    if (!customerRoot || !fs.existsSync(customerRoot)) continue;

    const fullsizeDir = path.join(customerRoot, FULLSIZE_SUBPATH);
    if (!fs.existsSync(fullsizeDir)) continue;

    const websizeDir = path.join(customerRoot, WEBSIZE_SUBPATH);
    const srcFiles   = listFilesRecursive(fullsizeDir);

    for (const srcAbs of srcFiles) {
      const result = await ensureWebsizeCopy(srcAbs, fullsizeDir, websizeDir);
      if (result === "created")  totalCreated++;
      if (result === "skipped")  totalSkipped++;
      if (result === "error")    totalErrors++;
    }
  }

  if (totalCreated > 0 || totalErrors > 0) {
    console.log(
      `[job:websizeSync] Fertig — erzeugt: ${totalCreated}, übersprungen: ${totalSkipped}, Fehler: ${totalErrors}`,
    );
  }
}

/**
 * Registriert den Websize-Sync-Cron-Job.
 * Läuft alle 10 Minuten.
 * @param {object} deps - { db }
 */
function scheduleWebsizeSync(deps) {
  cron.schedule("*/10 * * * *", async function runJob() {
    try {
      await runWebsizeSync(deps);
    } catch (err) {
      console.error("[job:websizeSync] Unerwarteter Fehler:", err && err.message);
    }
  }, {
    timezone: process.env.TIMEZONE || "Europe/Zurich",
  });

  console.log("[job:websizeSync] Websize-Sync registriert (alle 10 Minuten)");
}

module.exports = { scheduleWebsizeSync, runWebsizeSync, ensureWebsizeCopy };
