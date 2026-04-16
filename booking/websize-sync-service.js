const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { pdfToPng } = require("pdf-to-png-converter");
const {
  buildDerivedFloorplanJpgName,
  buildDerivedWebsizeName,
  migrateLegacyFinaleImageStructure,
  renameExistingFullsizeFiles,
  renameExistingStagingFiles,
  resolveCategoryPath,
} = require("./order-storage");

const WEBSIZE_MAX_EDGE = Math.max(320, Number(process.env.BOOKING_WEB_SIZE_MAX_EDGE || 2400));
const WEBSIZE_QUALITY = Math.max(50, Math.min(95, Number(process.env.BOOKING_WEB_SIZE_QUALITY || 85)));
const ELIGIBLE_EXTENSIONS = new Set([".jpg", ".jpeg"]);
const FLOORPLAN_PDF_EXTENSIONS = new Set([".pdf"]);
const GENERATED_WEB_PREFIX = "web-";

function isEligibleForWebsize(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  return ELIGIBLE_EXTENSIONS.has(ext);
}

function isEligibleFloorplanPdf(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  return FLOORPLAN_PDF_EXTENSIONS.has(ext);
}

async function writeWebsizeVariant(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const sourceStat = fs.statSync(sourcePath);
  await sharp(sourcePath)
    .rotate()
    .toColorspace("srgb")
    .resize({
      width: WEBSIZE_MAX_EDGE,
      height: WEBSIZE_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .withMetadata()
    .jpeg({
      quality: WEBSIZE_QUALITY,
      mozjpeg: true,
    })
    .toFile(targetPath);
  if (sourceStat.atime && sourceStat.mtime) {
    try { fs.utimesSync(targetPath, sourceStat.atime, sourceStat.mtime); } catch (_) {}
  }
}

async function writeFloorplanJpgVariant(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const sourceStat = fs.statSync(sourcePath);
  try {
    await sharp(sourcePath, { density: 200, page: 0 })
      .rotate()
      .flatten({ background: "#ffffff" })
      .toColorspace("srgb")
      .jpeg({
        quality: WEBSIZE_QUALITY,
        mozjpeg: true,
      })
      .toFile(targetPath);
  } catch (sharpError) {
    const pngPages = await pdfToPng(sourcePath, {
      disableFontFace: true,
      useSystemFonts: true,
      viewportScale: 2.5,
      pagesToProcess: [1],
      outputFolder: undefined,
      outputFileMaskFunc: () => "page",
    });
    const firstPage = Array.isArray(pngPages) ? pngPages[0] : null;
    const pngContent = firstPage?.content;
    if (!pngContent) {
      throw sharpError;
    }
    await sharp(Buffer.from(pngContent))
      .rotate()
      .flatten({ background: "#ffffff" })
      .toColorspace("srgb")
      .jpeg({
        quality: WEBSIZE_QUALITY,
        mozjpeg: true,
      })
      .toFile(targetPath);
  }
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

function createPipelineStats() {
  return { created: 0, updated: 0, deleted: 0, scanned: 0 };
}

function moveFileWithFallback(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (_) {
    fs.copyFileSync(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
}

function getLegacyFloorplanJpgCandidates(sourcePath, targetPath) {
  const sourceDir = path.dirname(sourcePath);
  const sourceDirName = path.basename(sourceDir);
  const siblingJpgDirName = sourceDirName.toLowerCase().startsWith("pdf-")
    ? `jpg-${sourceDirName.slice(4)}`
    : null;
  const siblingJpgDir = siblingJpgDirName ? path.join(path.dirname(sourceDir), siblingJpgDirName) : null;
  const sourceStem = path.basename(sourcePath, path.extname(sourcePath));
  return [sourceDir, siblingJpgDir]
    .filter(Boolean)
    .flatMap((candidateDir) => [".jpg", ".jpeg"].map((ext) => path.join(candidateDir, `${sourceStem}${ext}`)))
    .filter((candidate) => path.resolve(candidate).toLowerCase() !== path.resolve(targetPath).toLowerCase());
}

function adoptLegacyFloorplanJpg(sourcePath, targetPath) {
  for (const candidatePath of getLegacyFloorplanJpgCandidates(sourcePath, targetPath)) {
    if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) continue;
    moveFileWithFallback(candidatePath, targetPath);
    return { adopted: true, legacyPath: candidatePath };
  }
  return { adopted: false, legacyPath: null };
}

function removeLegacyFloorplanJpgCandidates(sourcePath, targetPath) {
  let deleted = 0;
  for (const candidatePath of getLegacyFloorplanJpgCandidates(sourcePath, targetPath)) {
    if (!fs.existsSync(candidatePath) || !fs.statSync(candidatePath).isFile()) continue;
    try {
      fs.unlinkSync(candidatePath);
      deleted += 1;
    } catch (_) {}
  }
  return deleted;
}

async function syncWebsizeForFile({ order, fullsizeRoot, websizeRoot, fullsizeFilePath, forceRebuild = false }) {
  const relativePath = path.relative(fullsizeRoot, fullsizeFilePath);
  if (!relativePath || relativePath.startsWith("..")) {
    return { action: "skipped", reason: "outside_fullsize" };
  }
  if (!isEligibleForWebsize(relativePath)) {
    return { action: "skipped", reason: "unsupported_ext", relativePath };
  }
  const websizeFileName = buildDerivedWebsizeName(order, path.basename(relativePath));
  const websizeFilePath = path.join(path.dirname(path.join(websizeRoot, relativePath)), websizeFileName);
  const sourceStat = fs.statSync(fullsizeFilePath);
  const targetExists = fs.existsSync(websizeFilePath);
  let shouldRegenerate = forceRebuild || !targetExists;
  if (targetExists) {
    const targetStat = fs.statSync(websizeFilePath);
    shouldRegenerate = forceRebuild || sourceStat.mtimeMs - targetStat.mtimeMs > 1000;
  }
  if (!shouldRegenerate) {
    return { action: "skipped", reason: "up_to_date", relativePath, targetRelativePath: path.relative(websizeRoot, websizeFilePath) };
  }
  await writeWebsizeVariant(fullsizeFilePath, websizeFilePath);
  return {
    action: targetExists ? "updated" : "created",
    relativePath,
    targetRelativePath: path.relative(websizeRoot, websizeFilePath),
  };
}

async function syncFloorplanJpgForOrderFolder(orderFolderAbsolutePath, order, logger = console, { forceRebuild = false } = {}) {
  const floorplanRoot = resolveCategoryPath(orderFolderAbsolutePath, "final_grundrisse", { createMissing: true });
  if (!fs.existsSync(floorplanRoot) || !fs.statSync(floorplanRoot).isDirectory()) {
    return { created: 0, updated: 0, deleted: 0, scanned: 0, adoptedLegacy: 0 };
  }
  const sourceFiles = walkFilesRecursive(floorplanRoot);
  const expected = new Set();
  let created = 0;
  let updated = 0;
  let scanned = 0;
  let adoptedLegacy = 0;

  for (const sourcePath of sourceFiles) {
    const rel = path.relative(floorplanRoot, sourcePath);
    if (!isEligibleFloorplanPdf(rel)) continue;
    const targetName = buildDerivedFloorplanJpgName(order, path.basename(rel));
    const targetPath = path.join(path.dirname(path.join(floorplanRoot, rel)), targetName);
    expected.add(path.normalize(path.relative(floorplanRoot, targetPath)).toLowerCase());
    scanned += 1;
    try {
      const sourceStat = fs.statSync(sourcePath);
      const targetExists = fs.existsSync(targetPath);
      if (!targetExists) {
        const adopted = adoptLegacyFloorplanJpg(sourcePath, targetPath);
        if (adopted.adopted) {
          adoptedLegacy += 1;
          removeLegacyFloorplanJpgCandidates(sourcePath, targetPath);
          continue;
        }
      }
      let shouldRegenerate = forceRebuild || !targetExists;
      if (targetExists) {
        const targetStat = fs.statSync(targetPath);
        shouldRegenerate = forceRebuild || sourceStat.mtimeMs - targetStat.mtimeMs > 1000;
      }
      if (!shouldRegenerate) continue;
      await writeFloorplanJpgVariant(sourcePath, targetPath);
      removeLegacyFloorplanJpgCandidates(sourcePath, targetPath);
      if (targetExists) updated += 1;
      else created += 1;
    } catch (error) {
      logger.warn("[websize-sync] Grundriss-PDF konnte nicht verarbeitet werden", {
        sourcePath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let deleted = 0;
  const floorplanFiles = walkFilesRecursive(floorplanRoot);
  for (const targetPath of floorplanFiles) {
    const rel = path.relative(floorplanRoot, targetPath);
    const ext = path.extname(rel).toLowerCase();
    const baseName = path.basename(rel).toLowerCase();
    if (ext !== ".jpg" && ext !== ".jpeg") continue;
    if (!baseName.startsWith(GENERATED_WEB_PREFIX)) continue;
    const key = path.normalize(rel).toLowerCase();
    if (expected.has(key)) continue;
    try {
      fs.unlinkSync(targetPath);
      deleted += 1;
    } catch (_) {}
  }
  removeEmptyDirsRecursive(floorplanRoot);
  return { created, updated, deleted, scanned, adoptedLegacy };
}

async function syncWebsizePipelineForOrderFolder(
  orderFolderAbsolutePath,
  order,
  sourceCategoryKey,
  targetCategoryKey,
  logger = console,
  { forceRebuild = false } = {}
) {
  const fullsizeRoot = resolveCategoryPath(orderFolderAbsolutePath, sourceCategoryKey);
  const websizeRoot = resolveCategoryPath(orderFolderAbsolutePath, targetCategoryKey);
  if (!fs.existsSync(fullsizeRoot) || !fs.statSync(fullsizeRoot).isDirectory()) {
    return createPipelineStats();
  }

  const sourceFiles = walkFilesRecursive(fullsizeRoot);
  const eligibleFiles = sourceFiles.filter((f) => isEligibleForWebsize(path.relative(fullsizeRoot, f)));
  if (eligibleFiles.length === 0) return createPipelineStats();

  fs.mkdirSync(websizeRoot, { recursive: true });

  const expected = new Set();
  let created = 0;
  let updated = 0;
  let scanned = 0;

  for (const sourcePath of eligibleFiles) {
    const rel = path.relative(fullsizeRoot, sourcePath);
    const generatedName = buildDerivedWebsizeName(order, path.basename(rel));
    const generatedRel = path.join(path.dirname(rel), generatedName);
    expected.add(path.normalize(generatedRel).toLowerCase());
    scanned += 1;
    try {
      const result = await syncWebsizeForFile({
        order,
        fullsizeRoot,
        websizeRoot,
        fullsizeFilePath: sourcePath,
        forceRebuild,
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

async function syncWebsizeForOrderFolder(orderFolderAbsolutePath, order, logger = console, { forceRebuild = false } = {}) {
  const migration = migrateLegacyFinaleImageStructure(orderFolderAbsolutePath, logger);
  const renamedStagingFullsize = renameExistingStagingFiles(orderFolderAbsolutePath, order, logger);
  const renamedFinalFullsize = renameExistingFullsizeFiles(orderFolderAbsolutePath, order, logger);
  const staging = await syncWebsizePipelineForOrderFolder(
    orderFolderAbsolutePath,
    order,
    "staging_fullsize",
    "staging_websize",
    logger,
    { forceRebuild }
  );
  const final = await syncWebsizePipelineForOrderFolder(
    orderFolderAbsolutePath,
    order,
    "final_fullsize",
    "final_websize",
    logger,
    { forceRebuild }
  );
  const floorplanStats = await syncFloorplanJpgForOrderFolder(orderFolderAbsolutePath, order, logger, { forceRebuild });
  return {
    created: staging.created + final.created,
    updated: staging.updated + final.updated,
    deleted: staging.deleted + final.deleted,
    scanned: staging.scanned + final.scanned,
    staging,
    final,
    floorplans: floorplanStats,
    migration,
    renamedStagingFullsize,
    renamedFinalFullsize,
  };
}

async function processCustomerFolderSyncJob({ db, folderPath, orderNo, logger, forceRebuild = false }) {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return null;
  let order = null;
  if (typeof db.getOrderByNo === "function") {
    order = await db.getOrderByNo(orderNo);
  }
  if (!order) return null;
  return syncWebsizeForOrderFolder(folderPath, order, logger, { forceRebuild });
}

async function syncWebsizeForAllCustomerFolders(
  db,
  logger = console,
  { forceRebuild = false, onlyOrderNo = null, maxConcurrentJobs = Number(process.env.BOOKING_SYNC_MAX_CONCURRENT_JOBS || 3) } = {}
) {
  if (!db || typeof db.listOrderFolderLinksByType !== "function") {
    return {
      folders: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      scanned: 0,
      maxConcurrentJobs: Math.max(1, Number(maxConcurrentJobs) || 3),
      staging: createPipelineStats(),
      final: createPipelineStats(),
      floorplans: createPipelineStats(),
    };
  }
  const rows = await db.listOrderFolderLinksByType("customer_folder");
  const deduped = new Map();
  for (const row of rows) {
    const orderNo = Number(row.order_no);
    if (onlyOrderNo != null && Number(onlyOrderNo) !== orderNo) continue;
    const folderPath = String(row.absolute_path || "").trim();
    if (!folderPath) continue;
    if (!deduped.has(folderPath)) {
      deduped.set(folderPath, { folderPath, orderNo });
    }
  }
  const totals = {
    folders: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    scanned: 0,
    maxConcurrentJobs: Math.max(1, Number(maxConcurrentJobs) || 3),
    staging: createPipelineStats(),
    final: createPipelineStats(),
    floorplans: createPipelineStats(),
  };

  const queue = Array.from(deduped.values());
  const workerCount = Math.min(totals.maxConcurrentJobs, queue.length || 1);
  const workers = Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) return;
      const stats = await processCustomerFolderSyncJob({
        db,
        folderPath: job.folderPath,
        orderNo: job.orderNo,
        logger,
        forceRebuild,
      });
      if (!stats) continue;
      totals.folders += 1;
      totals.created += stats.created;
      totals.updated += stats.updated;
      totals.deleted += stats.deleted;
      totals.scanned += stats.scanned;
      totals.staging.created += Number(stats.staging?.created || 0);
      totals.staging.updated += Number(stats.staging?.updated || 0);
      totals.staging.deleted += Number(stats.staging?.deleted || 0);
      totals.staging.scanned += Number(stats.staging?.scanned || 0);
      totals.final.created += Number(stats.final?.created || 0);
      totals.final.updated += Number(stats.final?.updated || 0);
      totals.final.deleted += Number(stats.final?.deleted || 0);
      totals.final.scanned += Number(stats.final?.scanned || 0);
      totals.floorplans.created += Number(stats.floorplans?.created || 0);
      totals.floorplans.updated += Number(stats.floorplans?.updated || 0);
      totals.floorplans.deleted += Number(stats.floorplans?.deleted || 0);
      totals.floorplans.scanned += Number(stats.floorplans?.scanned || 0);
    }
  });
  await Promise.all(workers);

  return totals;
}

module.exports = {
  syncWebsizeForFile,
  syncWebsizeForOrderFolder,
  syncWebsizeForAllCustomerFolders,
  syncWebsizePipelineForOrderFolder,
  isEligibleForWebsize,
};
