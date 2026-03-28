const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { UPLOAD_CATEGORY_MAP } = require("./order-storage");

const WEBSIZE_MAX_EDGE = Math.max(320, Number(process.env.BOOKING_WEB_SIZE_MAX_EDGE || 1920));
const WEBSIZE_QUALITY = Math.max(50, Math.min(95, Number(process.env.BOOKING_WEB_SIZE_QUALITY || 84)));
const ELIGIBLE_EXTENSIONS = new Set([".jpg", ".jpeg"]);

function isEligibleForWebsize(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  return ELIGIBLE_EXTENSIONS.has(ext);
}

async function writeWebsizeVariant(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const sourceStat = fs.statSync(sourcePath);
  await sharp(sourcePath)
    .rotate()
    .resize({
      width: WEBSIZE_MAX_EDGE,
      height: WEBSIZE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({
      quality: WEBSIZE_QUALITY,
      mozjpeg: true,
    })
    .toFile(targetPath);
  if (sourceStat.atime && sourceStat.mtime) {
    try { fs.utimesSync(targetPath, sourceStat.atime, sourceStat.mtime); } catch (_) {}
  }
}

function walkFilesRecursive(baseDir) {
  if (!fs.existsSync(baseDir)) return [];
  const out = [];
  const stack = [baseDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  return out;
}

function removeEmptyDirsRecursive(baseDir) {
  if (!fs.existsSync(baseDir)) return;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(baseDir, entry.name);
    removeEmptyDirsRecursive(child);
    try {
      const childEntries = fs.readdirSync(child);
      if (childEntries.length === 0) fs.rmdirSync(child);
    } catch (_) {}
  }
}

async function syncWebsizeForFile({ fullsizeRoot, websizeRoot, fullsizeFilePath }) {
  const relativePath = path.relative(fullsizeRoot, fullsizeFilePath);
  if (!relativePath || relativePath.startsWith("..")) {
    return { action: "skipped", reason: "outside_fullsize" };
  }
  if (!isEligibleForWebsize(relativePath)) {
    return { action: "skipped", reason: "unsupported_ext", relativePath };
  }
  const websizeFilePath = path.join(websizeRoot, relativePath);
  const sourceStat = fs.statSync(fullsizeFilePath);
  const targetExists = fs.existsSync(websizeFilePath);
  let shouldRegenerate = !targetExists;
  if (targetExists) {
    const targetStat = fs.statSync(websizeFilePath);
    shouldRegenerate = sourceStat.mtimeMs - targetStat.mtimeMs > 1000;
  }
  if (!shouldRegenerate) {
    return { action: "skipped", reason: "up_to_date", relativePath };
  }
  await writeWebsizeVariant(fullsizeFilePath, websizeFilePath);
  return { action: targetExists ? "updated" : "created", relativePath };
}

async function syncWebsizeForOrderFolder(orderFolderAbsolutePath, logger = console) {
  const fullsizeRoot = path.join(orderFolderAbsolutePath, UPLOAD_CATEGORY_MAP.final_fullsize);
  const websizeRoot = path.join(orderFolderAbsolutePath, UPLOAD_CATEGORY_MAP.final_websize);
  if (!fs.existsSync(fullsizeRoot) || !fs.statSync(fullsizeRoot).isDirectory()) {
    return { created: 0, updated: 0, deleted: 0, scanned: 0 };
  }
  fs.mkdirSync(websizeRoot, { recursive: true });

  const sourceFiles = walkFilesRecursive(fullsizeRoot);
  const expected = new Set();
  let created = 0;
  let updated = 0;
  let scanned = 0;

  for (const sourcePath of sourceFiles) {
    const rel = path.relative(fullsizeRoot, sourcePath);
    if (!isEligibleForWebsize(rel)) continue;
    expected.add(path.normalize(rel).toLowerCase());
    scanned += 1;
    try {
      const result = await syncWebsizeForFile({
        fullsizeRoot,
        websizeRoot,
        fullsizeFilePath: sourcePath,
      });
      if (result.action === "created") created += 1;
      if (result.action === "updated") updated += 1;
    } catch (error) {
      logger.warn("[websize-sync] Datei konnte nicht verarbeitet werden", {
        sourcePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let deleted = 0;
  const websizeFiles = walkFilesRecursive(websizeRoot);
  for (const targetPath of websizeFiles) {
    const rel = path.relative(websizeRoot, targetPath);
    if (!isEligibleForWebsize(rel)) continue;
    const key = path.normalize(rel).toLowerCase();
    if (expected.has(key)) continue;
    try {
      fs.unlinkSync(targetPath);
      deleted += 1;
    } catch (_) {}
  }
  removeEmptyDirsRecursive(websizeRoot);
  return { created, updated, deleted, scanned };
}

async function syncWebsizeForAllCustomerFolders(db, logger = console) {
  if (!db || typeof db.listOrderFolderLinksByType !== "function") {
    return { folders: 0, created: 0, updated: 0, deleted: 0, scanned: 0 };
  }
  const rows = await db.listOrderFolderLinksByType("customer_folder");
  const uniquePaths = Array.from(
    new Set(
      rows
        .map((row) => String(row.absolute_path || "").trim())
        .filter(Boolean)
    )
  );
  const totals = { folders: 0, created: 0, updated: 0, deleted: 0, scanned: 0 };
  for (const folderPath of uniquePaths) {
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) continue;
    const stats = await syncWebsizeForOrderFolder(folderPath, logger);
    totals.folders += 1;
    totals.created += stats.created;
    totals.updated += stats.updated;
    totals.deleted += stats.deleted;
    totals.scanned += stats.scanned;
  }
  return totals;
}

module.exports = {
  syncWebsizeForFile,
  syncWebsizeForOrderFolder,
  syncWebsizeForAllCustomerFolders,
  isEligibleForWebsize,
};
