const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { sanitizeUploadFilename } = require("./order-storage");

const CHUNKED_TMP_ROOT = process.env.BOOKING_UPLOAD_CHUNK_TMP_ROOT
  || path.join(os.tmpdir(), "buchungstool-chunked");
const CHUNKED_SESSION_ROOT = process.env.BOOKING_UPLOAD_CHUNK_SESSION_ROOT
  || path.join(CHUNKED_TMP_ROOT, "sessions");
const CHUNKED_TTL_HOURS = Math.max(1, Number(process.env.BOOKING_UPLOAD_CHUNK_TTL_HOURS || 24));

function ensureRoots() {
  fs.mkdirSync(CHUNKED_TMP_ROOT, { recursive: true });
  fs.mkdirSync(CHUNKED_SESSION_ROOT, { recursive: true });
}

function safeId(value, fallback = "id") {
  const cleaned = String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  return cleaned || fallback;
}

function buildUploadId(orderNo) {
  return `chu_${safeId(orderNo, "order")}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function buildSessionId(orderNo) {
  return `chs_${safeId(orderNo, "order")}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function uploadDir(uploadId) {
  return path.join(CHUNKED_TMP_ROOT, safeId(uploadId, "upload"));
}

function uploadMetaPath(uploadId) {
  return path.join(uploadDir(uploadId), "meta.json");
}

function sessionDir(sessionId) {
  return path.join(CHUNKED_SESSION_ROOT, safeId(sessionId, "session"));
}

function partPath(uploadId, index) {
  return path.join(uploadDir(uploadId), `${Number(index)}.part`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function loadUploadMeta(uploadId) {
  const metaFile = uploadMetaPath(uploadId);
  if (!fs.existsSync(metaFile)) throw new Error("Upload nicht gefunden");
  return readJson(metaFile);
}

function assertUploadOrder(meta, orderNo) {
  if (String(meta.orderNo) !== String(orderNo)) {
    throw new Error("Upload gehoert zu einem anderen Auftrag");
  }
}

function listPartIndices(uploadId) {
  const dir = uploadDir(uploadId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map((entry) => {
      const match = /^(\d+)\.part$/.exec(entry);
      return match ? Number(match[1]) : null;
    })
    .filter((index) => Number.isInteger(index) && index >= 0)
    .sort((a, b) => a - b);
}

function getChunkedUploadStatus({ orderNo, uploadId }) {
  ensureRoots();
  const meta = loadUploadMeta(uploadId);
  assertUploadOrder(meta, orderNo);
  const completed = {};
  for (const idx of listPartIndices(uploadId)) {
    completed[idx] = true;
  }
  return { uploadId: String(uploadId), sessionId: String(meta.sessionId), completed };
}

function cleanupExpiredChunkedUploads() {
  ensureRoots();
  const maxAgeMs = CHUNKED_TTL_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  const cleanDirChildren = (baseDir, skipNames = []) => {
    if (!fs.existsSync(baseDir)) return;
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (skipNames.includes(entry.name)) continue;
      const fullPath = path.join(baseDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (now - Number(stat.mtimeMs || 0) > maxAgeMs) {
          fs.rmSync(fullPath, { recursive: true, force: true });
        }
      } catch (_) {}
    }
  };
  cleanDirChildren(CHUNKED_TMP_ROOT, [path.basename(CHUNKED_SESSION_ROOT)]);
  cleanDirChildren(CHUNKED_SESSION_ROOT);
}

function initChunkedUpload({
  orderNo,
  filename,
  size,
  type,
  lastModified,
  sessionId,
}) {
  ensureRoots();
  cleanupExpiredChunkedUploads();
  const safeName = sanitizeUploadFilename(filename || "datei");
  const safeSize = Number(size || 0);
  if (!safeName) throw new Error("Dateiname fehlt");
  if (!Number.isFinite(safeSize) || safeSize <= 0) throw new Error("Dateigroesse ungueltig");
  const normalizedSessionId = safeId(sessionId, "") || buildSessionId(orderNo);
  const uploadId = buildUploadId(orderNo);
  const dir = uploadDir(uploadId);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(sessionDir(normalizedSessionId), { recursive: true });
  const meta = {
    uploadId,
    orderNo: String(orderNo),
    sessionId: normalizedSessionId,
    filename: String(filename || safeName),
    safeFilename: safeName,
    size: safeSize,
    type: String(type || "application/octet-stream"),
    lastModified: Number(lastModified || 0) || null,
    createdAt: new Date().toISOString(),
  };
  writeJson(uploadMetaPath(uploadId), meta);
  return { uploadId, sessionId: normalizedSessionId };
}

function saveChunkPart({ orderNo, uploadId, index, tempFilePath }) {
  ensureRoots();
  const safeIndex = Number(index);
  if (!Number.isInteger(safeIndex) || safeIndex < 0) {
    throw new Error("Chunk-Index ungueltig");
  }
  if (!tempFilePath || !fs.existsSync(tempFilePath)) {
    throw new Error("Chunk-Datei fehlt");
  }
  const meta = loadUploadMeta(uploadId);
  assertUploadOrder(meta, orderNo);
  const destination = partPath(uploadId, safeIndex);
  fs.renameSync(tempFilePath, destination);
  return { ok: true, uploadId: String(uploadId), index: safeIndex };
}

function ensureNoChunkGaps(partIndices) {
  if (!partIndices.length) throw new Error("Keine Chunks vorhanden");
  const max = partIndices[partIndices.length - 1];
  for (let i = 0; i <= max; i += 1) {
    if (!partIndices.includes(i)) throw new Error(`Chunk ${i} fehlt`);
  }
}

function appendFileToStream(out, sourcePath) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(sourcePath);
    rs.on("error", reject);
    rs.on("end", resolve);
    rs.pipe(out, { end: false });
  });
}

function waitForFinish(stream) {
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
    stream.end();
  });
}

async function completeChunkedUpload({ orderNo, uploadId }) {
  ensureRoots();
  const meta = loadUploadMeta(uploadId);
  assertUploadOrder(meta, orderNo);
  const indices = listPartIndices(uploadId);
  ensureNoChunkGaps(indices);
  const parts = indices.map((index) => ({ index, absPath: partPath(uploadId, index) }));
  const sessionAbs = sessionDir(meta.sessionId);
  fs.mkdirSync(sessionAbs, { recursive: true });

  const uniqueName = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}-${sanitizeUploadFilename(meta.safeFilename)}`;
  const mergedPath = path.join(sessionAbs, uniqueName);
  const out = fs.createWriteStream(mergedPath);
  for (const part of parts) {
    await appendFileToStream(out, part.absPath);
  }
  await waitForFinish(out);

  const stat = fs.statSync(mergedPath);
  if (Number(stat.size || 0) !== Number(meta.size || 0)) {
    try { fs.unlinkSync(mergedPath); } catch (_) {}
    throw new Error("Dateigroesse nach Merge stimmt nicht ueberein");
  }

  if (meta.lastModified && Number.isFinite(Number(meta.lastModified))) {
    const when = new Date(Number(meta.lastModified));
    if (!Number.isNaN(when.getTime())) {
      try { fs.utimesSync(mergedPath, when, when); } catch (_) {}
    }
  }

  const descriptor = {
    uploadId: String(uploadId),
    orderNo: String(orderNo),
    sessionId: String(meta.sessionId),
    originalName: String(meta.filename || meta.safeFilename),
    safeFilename: String(meta.safeFilename),
    mergedPath,
    sizeBytes: Number(meta.size || 0),
    completedAt: new Date().toISOString(),
  };
  writeJson(path.join(sessionAbs, `${safeId(uploadId, "upload")}.json`), descriptor);
  fs.rmSync(uploadDir(uploadId), { recursive: true, force: true });
  return { ok: true, uploadId: String(uploadId), sessionId: String(meta.sessionId), file: descriptor };
}

function listCompletedSessionFiles({ orderNo, sessionId }) {
  ensureRoots();
  cleanupExpiredChunkedUploads();
  const dir = sessionDir(sessionId);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir).filter((entry) => entry.toLowerCase().endsWith(".json"));
  const files = [];
  for (const entry of entries) {
    try {
      const descriptor = readJson(path.join(dir, entry));
      if (String(descriptor.orderNo) !== String(orderNo)) continue;
      if (!descriptor.mergedPath || !fs.existsSync(descriptor.mergedPath)) continue;
      files.push({
        path: String(descriptor.mergedPath),
        originalName: String(descriptor.originalName || descriptor.safeFilename || "datei"),
        size: Number(descriptor.sizeBytes || fs.statSync(descriptor.mergedPath).size || 0),
      });
    } catch (_) {}
  }
  return files;
}

async function finalizeChunkedSession({
  db,
  order,
  orderNo,
  sessionId,
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
}, deps) {
  const files = listCompletedSessionFiles({ orderNo, sessionId });
  if (!files.length && !String(comment || "").trim()) {
    throw new Error("Keine fertiggestellten Dateien in dieser Session gefunden");
  }
  const batch = await deps.stageUploadBatchFromPaths({
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
  });
  deps.enqueueBatchTransfer(db, batch.id, {
    loadOrder: async (targetOrderNo) => deps.loadOrder(targetOrderNo),
  });
  try {
    fs.rmSync(sessionDir(sessionId), { recursive: true, force: true });
  } catch (_) {}
  return batch;
}

module.exports = {
  CHUNKED_TMP_ROOT,
  CHUNKED_SESSION_ROOT,
  initChunkedUpload,
  saveChunkPart,
  getChunkedUploadStatus,
  completeChunkedUpload,
  listCompletedSessionFiles,
  finalizeChunkedSession,
  cleanupExpiredChunkedUploads,
};
