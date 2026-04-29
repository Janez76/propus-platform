const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const crypto = require("crypto");

/**
 * Parst DateTimeOriginal aus einem TIFF-Buffer (funktioniert für JPEG-EXIF-App1-Payload
 * sowie für rohe TIFF/DNG-Dateiheader).
 * base = Startoffset des TIFF-Headers im Buffer (nach "Exif\0\0"-Prefix überspringen).
 */
function parseTiffDateTime(buf, base) {
  base = base || 0;
  if (!Buffer.isBuffer(buf) || buf.length - base < 8) return null;
  const byteOrder = buf.slice(base, base + 2).toString("binary");
  const le = byteOrder === "II";
  if (!le && byteOrder !== "MM") return null;
  const r16 = (o) => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
  const r32 = (o) => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
  if (r16(base + 2) !== 42) return null;

  const readAscii = (off, len) => buf.slice(off, off + len).toString("ascii").replace(/\0.*/, "").trim();

  const scanIFD = (ifdOff, targetTag) => {
    if (ifdOff + 2 > buf.length) return null;
    const count = r16(ifdOff);
    for (let i = 0; i < count; i++) {
      const e = ifdOff + 2 + i * 12;
      if (e + 12 > buf.length) break;
      const tag = r16(e);
      if (tag !== targetTag) continue;
      const type = r16(e + 2);
      const cnt  = r32(e + 4);
      if (type === 2) { // ASCII
        const valOff = cnt <= 4 ? e + 8 : r32(e + 8) + base;
        if (valOff + cnt <= buf.length) return readAscii(valOff, cnt);
      }
      if (type === 4) return r32(e + 8) + base; // LONG (IFD-Zeiger)
    }
    return null;
  };

  const ifd0 = r32(base + 4) + base;
  const exifIFDOff = scanIFD(ifd0, 0x8769);
  if (typeof exifIFDOff === "number") {
    const dto = scanIFD(exifIFDOff, 0x9003);
    if (typeof dto === "string" && dto.length >= 19) { const d = exifStrToDate(dto); if (d) return d; }
  }
  const dt = scanIFD(ifd0, 0x0132);
  if (typeof dt === "string" && dt.length >= 19) return exifStrToDate(dt);
  return null;
}

function exifStrToDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Liest DateTimeOriginal direkt aus Datei-Bytes.
 * Unterstützt JPEG (APP1-EXIF-Segment) und TIFF/DNG (natives TIFF-Header).
 * Liest nur die ersten 64 KB – keine vollständige Dekodierung.
 */
async function readExifShootDate(filePath) {
  const BUF_SIZE = 65536;
  try {
    const fd = await fsPromises.open(filePath, "r");
    let buf;
    try {
      const tmp = Buffer.alloc(BUF_SIZE);
      const { bytesRead } = await fd.read(tmp, 0, BUF_SIZE, 0);
      buf = tmp.slice(0, bytesRead);
    } finally {
      await fd.close();
    }
    if (buf.length < 4) return null;

    // JPEG: SOI-Marker 0xFFD8, dann APP-Segmente scannen
    if (buf[0] === 0xFF && buf[1] === 0xD8) {
      let pos = 2;
      while (pos + 4 <= buf.length) {
        if (buf[pos] !== 0xFF) break;
        const marker = buf[pos + 1];
        const segLen = buf.readUInt16BE(pos + 2);
        if (marker === 0xE1 && segLen > 6 && buf.slice(pos + 4, pos + 10).toString("binary") === "Exif\0\0") {
          return parseTiffDateTime(buf, pos + 10);
        }
        if (marker === 0xDA) break; // SOS: Bilddaten beginnen
        pos += 2 + segLen;
      }
      return null;
    }

    // TIFF/DNG: direkt als TIFF-Header parsen (kein Prefix)
    return parseTiffDateTime(buf, 0);
  } catch (_) { return null; }
}

/**
 * Setzt den Dateisystem-Zeitstempel (mtime) einer Datei auf das EXIF-Aufnahmedatum.
 * Unterstützt JPEG, DNG, TIFF, HEIC und weitere Bildformate.
 * Gibt true zurück wenn der Zeitstempel gesetzt wurde, sonst false.
 */
async function applyExifMtime(filePath) {
  const PHOTO_EXT = new Set([".jpg", ".jpeg", ".dng", ".tif", ".tiff", ".heic", ".heif", ".png", ".webp"]);
  if (!PHOTO_EXT.has(path.extname(filePath).toLowerCase())) return false;
  try {
    const shootDate = await readExifShootDate(filePath);
    if (!shootDate) return false;
    await fsPromises.utimes(filePath, shootDate, shootDate);
    return true;
  } catch (_) { return false; }
}

function sha256FileAsync(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
const {
  UPLOAD_CATEGORY_MAP,
  sanitizeUploadFilename,
  sanitizePathSegment,
  checkUploadExtension,
  buildStoredUploadName,
  normalizeUploadMode,
  sanitizeUploadComment,
  toPortablePath,
  createStagingBatchDir,
  provisionOrderFolders,
  createUniqueBatchDir,
  resolveCategoryPath,
  writeCommentFile,
} = require("./order-storage");

const activeTransfers = new Set();
const MB = 1024 * 1024;
const log = (msg, data = {}) => {
  const prefix = "[upload-batch]";
  if (Object.keys(data).length) {
    console.log(`${prefix} ${msg}`, JSON.stringify(data));
  } else {
    console.log(`${prefix} ${msg}`);
  }
};
const logWarn = (msg, err) => console.warn("[upload-batch]", msg, err?.message || err);

function uploadWorkerEnabled() {
  return String(process.env.UPLOAD_WORKER_ENABLED || "").toLowerCase() === "true";
}

function shouldVerifyTargetHash(sizeBytes) {
  if (String(process.env.UPLOAD_STRICT_HASH_VERIFY || "").toLowerCase() === "true") return true;
  const maxMb = Math.max(0, Number(process.env.UPLOAD_HASH_VERIFY_MAX_MB || 100));
  if (maxMb <= 0) return false;
  return Number(sizeBytes || 0) <= maxMb * MB;
}

function mbPerSec(bytes, ms) {
  const seconds = Number(ms || 0) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const mb = Number(bytes || 0) / MB;
  return Number.isFinite(mb) ? Number((mb / seconds).toFixed(2)) : null;
}

function buildBatchId(orderNo) {
  const random = crypto.randomBytes(4).toString("hex");
  return `upl_${String(orderNo)}_${Date.now()}_${random}`;
}

function makeUniqueFileName(fileName, usedNames) {
  const ext = path.extname(String(fileName || ""));
  const base = path.basename(String(fileName || ""), ext);
  let candidate = fileName;
  let index = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}-${index}${ext}`;
    index += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function normalizeBatchInput({
  category,
  uploadMode,
  folderType,
  comment,
  batchFolderName,
  conflictMode,
  customFolderName,
  uploadGroupId,
  uploadGroupTotalParts,
  uploadGroupPartIndex,
}) {
  const categoryKey = String(category || "").trim().toLowerCase();
  if (!UPLOAD_CATEGORY_MAP[categoryKey]) {
    throw new Error("Ungültige Kategorie");
  }
  const normalizedMode = normalizeUploadMode(uploadMode);
  const normalizedFolderType = ["raw_material", "customer_folder"].includes(String(folderType || ""))
    ? String(folderType)
    : "customer_folder";
  const normalizedComment = sanitizeUploadComment(comment);
  const safeBatchFolderName = batchFolderName
    ? sanitizePathSegment(String(batchFolderName), null, 80)
    : null;
  const normalizedConflictMode = String(conflictMode || "skip").toLowerCase() === "replace" ? "replace" : "skip";
  const safeCustomFolderName = customFolderName
    ? sanitizePathSegment(String(customFolderName), null, 80)
    : null;
  const normalizedUploadGroupId = String(uploadGroupId || "").trim() || null;
  const normalizedUploadGroupTotalParts = Math.max(1, Number(uploadGroupTotalParts || 1));
  const normalizedUploadGroupPartIndex = Math.min(
    normalizedUploadGroupTotalParts,
    Math.max(1, Number(uploadGroupPartIndex || 1))
  );
  return {
    categoryKey,
    normalizedMode,
    normalizedFolderType,
    normalizedComment,
    safeBatchFolderName,
    normalizedConflictMode,
    safeCustomFolderName,
    normalizedUploadGroupId,
    normalizedUploadGroupTotalParts,
    normalizedUploadGroupPartIndex,
  };
}

async function createBatchFromStagedFiles({
  db,
  order,
  batchId,
  stagedFiles,
  totalBytes,
  uploadedBy,
  localPath,
  normalized,
}) {
  const batch = await db.createUploadBatch({
    id: batchId,
    orderNo: order.orderNo,
    folderType: normalized.normalizedFolderType,
    category: normalized.categoryKey,
    uploadMode: normalized.normalizedMode,
    status: "staged",
    localPath,
    batchFolder: normalized.normalizedMode === "new_batch" && normalized.safeBatchFolderName ? normalized.safeBatchFolderName : null,
    comment: normalized.normalizedComment,
    fileCount: stagedFiles.length,
    totalBytes,
    uploadedBy: uploadedBy || "",
    conflictMode: normalized.normalizedConflictMode,
    customFolderName: normalized.safeCustomFolderName,
    uploadGroupId: normalized.normalizedUploadGroupId,
    uploadGroupTotalParts: normalized.normalizedUploadGroupTotalParts,
    uploadGroupPartIndex: normalized.normalizedUploadGroupPartIndex,
  });
  await db.createUploadBatchFiles(batchId, stagedFiles);
  return getBatchWithFiles(db, batch.id);
}

function toBatchDto(batchRow, files) {
  if (!batchRow) return null;
  return {
    id: String(batchRow.id),
    orderNo: Number(batchRow.order_no),
    folderType: String(batchRow.folder_type || "customer_folder"),
    category: String(batchRow.category || ""),
    uploadMode: String(batchRow.upload_mode || "existing"),
    uploadGroupId: batchRow.upload_group_id ? String(batchRow.upload_group_id) : null,
    uploadGroupTotalParts: Math.max(1, Number(batchRow.upload_group_total_parts || 1)),
    uploadGroupPartIndex: Math.max(1, Number(batchRow.upload_group_part_index || 1)),
    status: String(batchRow.status || "staged"),
    localPath: String(batchRow.local_path || ""),
    targetRelativePath: batchRow.target_relative_path ? String(batchRow.target_relative_path) : null,
    targetAbsolutePath: batchRow.target_absolute_path ? String(batchRow.target_absolute_path) : null,
    batchFolder: batchRow.batch_folder ? String(batchRow.batch_folder) : null,
    comment: String(batchRow.comment || ""),
    fileCount: Number(batchRow.file_count || 0),
    totalBytes: Number(batchRow.total_bytes || 0),
    uploadedBy: String(batchRow.uploaded_by || ""),
    errorMessage: batchRow.error_message ? String(batchRow.error_message) : null,
    createdAt: batchRow.created_at || null,
    updatedAt: batchRow.updated_at || null,
    startedAt: batchRow.started_at || null,
    completedAt: batchRow.completed_at || null,
    files: Array.isArray(files)
      ? files.map((fileRow) => ({
          id: Number(fileRow.id),
          originalName: String(fileRow.original_name || ""),
          storedName: String(fileRow.stored_name || ""),
          stagingPath: String(fileRow.staging_path || ""),
          sizeBytes: Number(fileRow.size_bytes || 0),
          sha256: fileRow.sha256 ? String(fileRow.sha256) : null,
          status: String(fileRow.status || "staged"),
          duplicateOf: fileRow.duplicate_of ? String(fileRow.duplicate_of) : null,
          errorMessage: fileRow.error_message ? String(fileRow.error_message) : null,
        }))
      : [],
  };
}

async function getBatchWithFiles(db, batchId) {
  const batch = await db.getUploadBatch(batchId);
  if (!batch) return null;
  const files = await db.listUploadBatchFiles(batchId);
  return toBatchDto(batch, files);
}

async function stageUploadBatch({
  db,
  order,
  files,
  category,
  uploadMode,
  folderType,
  batchFolderName,
  comment,
  uploadedBy,
  conflictMode,
  customFolderName,
  uploadGroupId,
  uploadGroupTotalParts,
  uploadGroupPartIndex,
  addOrderSuffix,
}) {
  const normalized = normalizeBatchInput({
    category,
    uploadMode,
    folderType,
    comment,
    batchFolderName,
    conflictMode,
    customFolderName,
    uploadGroupId,
    uploadGroupTotalParts,
    uploadGroupPartIndex,
  });
  const safeFiles = Array.isArray(files) ? files : [];
  if (!safeFiles.length && !normalized.normalizedComment) {
    throw new Error("Bitte mindestens eine Datei oder einen Kommentar angeben");
  }

  const batchId = buildBatchId(order.orderNo);
  const batchDir = createStagingBatchDir(batchId);
  const stagedFiles = [];
  let totalBytes = 0;
  const usedStoredNames = new Set();

  for (const file of safeFiles) {
    const desiredName = buildStoredUploadName(order, normalized.categoryKey, file?.originalname, addOrderSuffix);
    const safeName = makeUniqueFileName(sanitizeUploadFilename(desiredName), usedStoredNames);
    const sourcePath = file?.path || null;
    const targetPath = path.join(batchDir, safeName);
    if (sourcePath && fs.existsSync(sourcePath)) {
      // copyFileSync + unlinkSync verhindert EXDEV bei Cross-Filesystem-Mounts (tmp -> upload_staging)
      fs.copyFileSync(sourcePath, targetPath);
      try { fs.unlinkSync(sourcePath); } catch (_) {}
    } else {
      fs.writeFileSync(targetPath, file?.buffer || Buffer.alloc(0));
    }
    const hash = await sha256FileAsync(targetPath);
    const sizeBytes = Number(file?.size || fs.statSync(targetPath).size || 0);
    totalBytes += sizeBytes;
    stagedFiles.push({
      originalName: file?.originalname || safeName,
      storedName: safeName,
      stagingPath: targetPath,
      sizeBytes,
      sha256: hash,
      status: "staged",
    });
  }
  return createBatchFromStagedFiles({
    db,
    order,
    batchId,
    stagedFiles,
    totalBytes,
    uploadedBy,
    localPath: batchDir,
    normalized,
  });
}

async function stageUploadBatchFromPaths({
  db,
  order,
  files,
  category,
  uploadMode,
  folderType,
  batchFolderName,
  comment,
  uploadedBy,
  conflictMode,
  customFolderName,
  uploadGroupId,
  uploadGroupTotalParts,
  uploadGroupPartIndex,
  addOrderSuffix,
}) {
  const normalized = normalizeBatchInput({
    category,
    uploadMode,
    folderType,
    comment,
    batchFolderName,
    conflictMode,
    customFolderName,
    uploadGroupId,
    uploadGroupTotalParts,
    uploadGroupPartIndex,
  });
  const safeFiles = Array.isArray(files) ? files : [];
  if (!safeFiles.length && !normalized.normalizedComment) {
    throw new Error("Bitte mindestens eine Datei oder einen Kommentar angeben");
  }

  const batchId = buildBatchId(order.orderNo);
  const batchDir = createStagingBatchDir(batchId);
  const stagedFiles = [];
  let totalBytes = 0;
  const usedStoredNames = new Set();

  for (const file of safeFiles) {
    const sourcePath = String(file?.path || "").trim();
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error(`Staging-Datei fehlt: ${sourcePath || "(leer)"}`);
    }
    const desiredName = buildStoredUploadName(order, normalized.categoryKey, file?.originalName || path.basename(sourcePath), addOrderSuffix);
    const safeName = makeUniqueFileName(sanitizeUploadFilename(desiredName), usedStoredNames);
    const targetPath = path.join(batchDir, safeName);
    // Prefer atomic rename (same filesystem); fall back to copy+delete if cross-device.
    try {
      const srcStat = fs.statSync(sourcePath);
      fs.renameSync(sourcePath, targetPath);
      if (srcStat.atime && srcStat.mtime) {
        try { fs.utimesSync(targetPath, srcStat.atime, srcStat.mtime); } catch (_) {}
      }
    } catch (renameErr) {
      if (renameErr.code === "EXDEV") {
        fs.copyFileSync(sourcePath, targetPath);
        try { fs.unlinkSync(sourcePath); } catch (_) {}
      } else {
        throw renameErr;
      }
    }
    const hash = await sha256FileAsync(targetPath);
    const sizeBytes = Number(file?.size || fs.statSync(targetPath).size || 0);
    totalBytes += sizeBytes;
    stagedFiles.push({
      originalName: file?.originalName || safeName,
      storedName: safeName,
      stagingPath: targetPath,
      sizeBytes,
      sha256: hash,
      status: "staged",
    });
  }

  return createBatchFromStagedFiles({
    db,
    order,
    batchId,
    stagedFiles,
    totalBytes,
    uploadedBy,
    localPath: batchDir,
    normalized,
  });
}

async function transferBatch(db, batchId, deps) {
  if (!batchId || activeTransfers.has(batchId)) return;
  activeTransfers.add(batchId);
  const transferStart = Date.now();
  try {
    let batch = await db.getUploadBatch(batchId);
    if (!batch) return;

    batch = await db.updateUploadBatch(batchId, {
      status: batch.status === "retrying" ? "retrying" : "transferring",
      started_at: batch.started_at || new Date().toISOString(),
      error_message: null,
    });

    const order = await deps.loadOrder(Number(batch.order_no));
    if (!order) throw new Error(`Auftrag ${batch.order_no} nicht gefunden`);

    const links = await provisionOrderFolders(order, db, {
      folderTypes: [String(batch.folder_type || "customer_folder")],
      createMissing: true,
    });
    const folderType = String(batch.folder_type || "customer_folder");
    const folderLink = links[folderType] || await db.getOrderFolderLink(order.orderNo, folderType);
    if (!folderLink) throw new Error(`Kein Zielordner für ${folderType} vorhanden`);

    const categoryPath = UPLOAD_CATEGORY_MAP[String(batch.category || "")];
    if (!categoryPath) throw new Error("Ungültige Upload-Kategorie");
    const categoryDir = resolveCategoryPath(folderLink.absolute_path, String(batch.category || ""), { createMissing: true });
    fs.mkdirSync(categoryDir, { recursive: true });

    let targetDir = categoryDir;
    let batchFolder = batch.batch_folder ? String(batch.batch_folder) : null;
    const mode = String(batch.upload_mode || "existing");
    const customName = String(batch.custom_folder_name || "").trim();

    if (mode === "new_named" && customName) {
      const safeFolderName = sanitizeUploadFilename(customName).replace(/\.[^.]+$/, "");
      batchFolder = safeFolderName || batchFolder;
      targetDir = path.join(categoryDir, safeFolderName);
      fs.mkdirSync(targetDir, { recursive: true });
    } else if (mode === "new_batch") {
      if (batchFolder) {
        targetDir = path.join(categoryDir, batchFolder);
        fs.mkdirSync(targetDir, { recursive: true });
      } else {
        const newBatchDir = createUniqueBatchDir(categoryDir);
        batchFolder = newBatchDir.name;
        targetDir = newBatchDir.abs;
      }
    }

    const conflictMode = String(batch.conflict_mode || "skip");
    const targetRelativePath = toPortablePath(path.relative(folderLink.absolute_path, targetDir));
    const files = await db.listUploadBatchFiles(batchId);
    const totalMB = (Number(batch.total_bytes) / (1024 * 1024)).toFixed(1);
    log("transfer started", {
      batchId,
      orderNo: batch.order_no,
      folderType: batch.folder_type,
      category: batch.category,
      fileCount: files.length,
      totalMB,
      targetDir,
    });
    let failed = 0;
    let fileIndex = 0;

    for (const file of files) {
      fileIndex += 1;
      const currentStatus = String(file.status || "staged");
      if (["stored", "skipped_duplicate", "skipped_invalid_type"].includes(currentStatus)) continue;

      const safeName = sanitizeUploadFilename(file.stored_name || file.original_name);
      const extCheck = checkUploadExtension(String(batch.category || ""), safeName);
      if (!extCheck.ok) {
        await db.updateUploadBatchFile(file.id, {
          status: "skipped_invalid_type",
          error_message: `Dateityp "${extCheck.ext}" ist für diese Kategorie nicht erlaubt`,
        });
        continue;
      }

      if (!fs.existsSync(file.staging_path)) {
        failed += 1;
        await db.updateUploadBatchFile(file.id, {
          status: "failed",
          error_message: "Staging-Datei fehlt",
        });
        continue;
      }

      const destination = path.join(targetDir, safeName);
      const fileStart = Date.now();
      try {
        // Prüfe ob identische Datei bereits auf NAS liegt (Content-Hash-Vergleich).
        // Gleichnamige Dateien werden immer überschrieben – kein name-based skip.
        const incomingHash = file.sha256 || await sha256FileAsync(file.staging_path);
        if (fs.existsSync(destination)) {
          const existingHash = await sha256FileAsync(destination);
          if (existingHash === incomingHash) {
            // Inhalt 1:1 identisch – Staging-File sicher löschen, als stored markieren
            try { await fsPromises.unlink(file.staging_path); } catch (_) {}
            await db.updateUploadBatchFile(file.id, {
              status: "stored",
              error_message: null,
            });
            const fileMs = Date.now() - fileStart;
            log("file already on NAS (identical)", { batchId, fileIndex, total: files.length, lastFileMs: fileMs, lastFile: safeName });
            continue;
          }
          // Anderer Inhalt – überschreiben
        }

        // Kopie auf NAS (fsPromises.copyFile = non-blocking)
        await fsPromises.copyFile(file.staging_path, destination);

        // Zeitstempel: Original vom Browser (Staging-Stat) übernehmen — kein EXIF-Override
        try {
          const srcStat = await fsPromises.stat(file.staging_path);
          if (srcStat.mtime) {
            await fsPromises.utimes(destination, srcStat.atime || srcStat.mtime, srcStat.mtime);
          }
        } catch (_) {}

        // Grössen-Check
        const sourceSize = Number(file.size_bytes || (await fsPromises.stat(file.staging_path)).size || 0);
        const targetSize = Number((await fsPromises.stat(destination)).size || 0);
        if (sourceSize > 0 && sourceSize !== targetSize) {
          throw new Error(`Dateigrösse nach Kopie stimmt nicht überein (${sourceSize} vs ${targetSize})`);
        }

        const verifyTargetHash = shouldVerifyTargetHash(sourceSize);
        if (verifyTargetHash) {
          const verifyStart = Date.now();
          const targetHash = await sha256FileAsync(destination);
          if (incomingHash && targetHash !== incomingHash) {
            throw new Error(`SHA-256 nach Kopie stimmt nicht überein (NAS-Fehler?)`);
          }
          log("verify_target completed", {
            batchId,
            fileIndex,
            total: files.length,
            fileMB: (sourceSize / MB).toFixed(1),
            phaseMs: Date.now() - verifyStart,
          });
        } else {
          log("verify_target skipped", {
            batchId,
            fileIndex,
            total: files.length,
            fileMB: (sourceSize / MB).toFixed(1),
            reason: "large_file",
          });
        }

        // Erst jetzt – nach erfolgreicher Verifikation – Staging-File entfernen
        try { await fsPromises.unlink(file.staging_path); } catch (_) {}

        await db.updateUploadBatchFile(file.id, {
          status: "stored",
          error_message: null,
        });
        const fileMs = Date.now() - fileStart;
        if (fileIndex % 5 === 0 || fileIndex === files.length || fileMs > 10000) {
          log("file progress", {
            batchId,
            fileIndex,
            total: files.length,
            fileMB: (sourceSize / MB).toFixed(1),
            lastFileMs: fileMs,
            mbPerSec: mbPerSec(sourceSize, fileMs),
            lastFile: safeName,
          });
        }
      } catch (error) {
        failed += 1;
        const fileMs = Date.now() - fileStart;
        logWarn(`file failed: ${safeName} (${(Number(file.size_bytes) / (1024 * 1024)).toFixed(2)} MB, ${fileMs}ms)`, error);
        // Unvollständige Zieldatei entfernen; Staging-File bleibt für Wiederholung erhalten
        try {
          if (fs.existsSync(destination)) await fsPromises.unlink(destination);
        } catch (_) {}
        await db.updateUploadBatchFile(file.id, {
          status: "failed",
          error_message: error instanceof Error ? error.message : "Transfer fehlgeschlagen",
        });
      }
    }

    if (String(batch.comment || "").trim()) {
      writeCommentFile(targetDir, batch.comment);
    }

    const completedFiles = await db.listUploadBatchFiles(batchId);
    const storedCount = completedFiles.filter((entry) => entry.status === "stored").length;
    const skippedCount = completedFiles.filter((entry) => entry.status === "skipped_duplicate").length;
    const invalidCount = completedFiles.filter((entry) => entry.status === "skipped_invalid_type").length;
    const failedCount = completedFiles.filter((entry) => entry.status === "failed").length;
    const status = failedCount > 0 ? "failed" : "completed";
    const completedAt = failedCount > 0 ? null : new Date().toISOString();

    batch = await db.updateUploadBatch(batchId, {
      status,
      batch_folder: batchFolder,
      target_relative_path: targetRelativePath,
      target_absolute_path: targetDir,
      error_message: failedCount > 0 ? `${failedCount} Datei(en) konnten nicht übertragen werden` : null,
      completed_at: completedAt,
    });

    const durationMs = Date.now() - transferStart;
    log("transfer completed", {
      batchId,
      status,
      storedCount,
      skippedCount,
      invalidCount,
      failedCount,
      durationMs,
      durationSec: (durationMs / 1000).toFixed(1),
    });

    if (failedCount === 0) {
      try {
        fs.rmSync(batch.local_path, { recursive: true, force: true });
      } catch (_) {}
      if (typeof deps.notifyCompleted === "function") {
        const batchDto = toBatchDto(batch, completedFiles);
        await deps.notifyCompleted({
          order,
          batch: batchDto,
          storedCount,
          skippedCount,
          invalidCount,
        });
      }
    }
  } catch (error) {
    const durationMs = Date.now() - transferStart;
    logWarn(`transfer failed batchId=${batchId} after ${durationMs}ms`, error);
    await db.updateUploadBatch(batchId, {
      status: "failed",
      error_message: error instanceof Error ? error.message : "Transfer fehlgeschlagen",
    }).catch(() => {});
  } finally {
    activeTransfers.delete(batchId);
  }
}

function enqueueBatchTransfer(db, batchId, deps) {
  if (uploadWorkerEnabled()) {
    log("transfer queued for worker", { batchId });
    return;
  }
  setTimeout(() => {
    transferBatch(db, batchId, deps).catch(() => {});
  }, 25);
}

async function runWorkerTransferOnce(db, deps = {}) {
  if (!db || typeof db.claimNextUploadBatch !== "function") {
    throw new Error("Worker benötigt db.claimNextUploadBatch");
  }
  const workerId = String(deps.workerId || process.env.UPLOAD_WORKER_ID || `${process.env.HOSTNAME || "upload-worker"}:${process.pid}`);
  const batch = await db.claimNextUploadBatch(workerId);
  if (!batch?.id) return null;
  await transferBatch(db, batch.id, deps);
  return String(batch.id);
}

async function runUploadWorker(db, deps = {}) {
  const pollMs = Math.max(250, Number(process.env.UPLOAD_WORKER_POLL_MS || 1000));
  const workerId = String(deps.workerId || process.env.UPLOAD_WORKER_ID || `${process.env.HOSTNAME || "upload-worker"}:${process.pid}`);
  log("worker started", { workerId, pollMs });
  while (true) {
    try {
      const batchId = await runWorkerTransferOnce(db, { ...deps, workerId });
      if (!batchId) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    } catch (error) {
      logWarn("worker iteration failed", error);
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}

async function retryBatchTransfer(db, batchId, deps) {
  const batch = await db.getUploadBatch(batchId);
  if (!batch) throw new Error("Upload-Batch nicht gefunden");
  await db.updateUploadBatch(batchId, {
    status: "retrying",
    error_message: null,
    completed_at: null,
  });
  const files = await db.listUploadBatchFiles(batchId);
  for (const file of files) {
    if (String(file.status || "") === "failed") {
      await db.updateUploadBatchFile(file.id, {
        status: "staged",
        error_message: null,
      });
    }
  }
  enqueueBatchTransfer(db, batchId, deps);
  return getBatchWithFiles(db, batchId);
}

async function resumePendingTransfers(db, deps) {
  const pending = await db.listPendingUploadBatches();
  for (const batch of pending) {
    // Bei failed-Batches: nur Dateien mit status=failed zurücksetzen,
    // stored-Dateien bleiben unberührt → Transfer setzt ab dem letzten
    // erfolgreichen File fort. Staging-Files bleiben erhalten (werden erst
    // nach SHA-256-Verifikation auf NAS gelöscht).
    if (String(batch.status) === "failed") {
      try {
        const files = await db.listUploadBatchFiles(batch.id);
        for (const f of files) {
          if (String(f.status) === "failed") {
            await db.updateUploadBatchFile(f.id, { status: "staged", error_message: null });
          }
        }
        await db.updateUploadBatch(batch.id, { status: "retrying", error_message: null });
      } catch (resetErr) {
        logWarn(`resumePendingTransfers: reset failed for batch ${batch.id}`, resetErr);
        continue;
      }
    }
    enqueueBatchTransfer(db, batch.id, deps);
  }
  return pending.length;
}

module.exports = {
  stageUploadBatch,
  stageUploadBatchFromPaths,
  getBatchWithFiles,
  enqueueBatchTransfer,
  retryBatchTransfer,
  resumePendingTransfers,
  runWorkerTransferOnce,
  runUploadWorker,
  shouldVerifyTargetHash,
  toBatchDto,
};
