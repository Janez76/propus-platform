const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ncShare = require("./nextcloud-share");

const CUSTOMER_UPLOAD_ROOT = process.env.BOOKING_UPLOAD_CUSTOMER_ROOT || process.env.BOOKING_UPLOAD_ROOT || path.join(__dirname, "uploads");
const RAW_MATERIAL_ROOT = process.env.BOOKING_UPLOAD_RAW_ROOT || path.join(__dirname, "uploads-raw");
const LOCAL_STAGING_ROOT = process.env.BOOKING_UPLOAD_STAGING_ROOT || path.join(require("os").tmpdir(), "buchungstool-upload-staging");
const CUSTOMER_ARCHIVE_ROOT = process.env.BOOKING_UPLOAD_CUSTOMER_ARCHIVE_ROOT || path.join(CUSTOMER_UPLOAD_ROOT, "_ARCHIV");
const RAW_ARCHIVE_ROOT = process.env.BOOKING_UPLOAD_RAW_ARCHIVE_ROOT || path.join(RAW_MATERIAL_ROOT, "_ARCHIV");
const REQUIRE_MOUNT = String(process.env.BOOKING_UPLOAD_REQUIRE_MOUNT || "false").toLowerCase() === "true";

const CUSTOMER_UPLOAD_STRUCTURE = [
  "Unbearbeitete/Bilder",
  "Unbearbeitete/Grundrisse",
  "Unbearbeitete/Video",
  "Unbearbeitete/Sonstiges",
  "Zur Auswahl",
  "Finale/Bilder/WEB SIZE",
  "Finale/Bilder/FULLSIZE",
  "Finale/Grundrisse",
  "Finale/Video",
];

const RAW_MATERIAL_STRUCTURE = [
  "Unbearbeitete/Bilder",
  "Unbearbeitete/Video",
];

const UPLOAD_CATEGORY_MAP = {
  final_websize: "Finale/Bilder/WEB SIZE",
  final_fullsize: "Finale/Bilder/FULLSIZE",
  final_video: "Finale/Video",
  final_grundrisse: "Finale/Grundrisse",
  raw_bilder: "Unbearbeitete/Bilder",
  raw_grundrisse: "Unbearbeitete/Grundrisse",
  raw_video: "Unbearbeitete/Video",
  raw_sonstiges: "Unbearbeitete/Sonstiges",
  zur_auswahl: "Zur Auswahl",
};

const UPLOAD_ALLOWED_EXT = {
  raw_bilder: new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".heif", ".dng", ".raw", ".cr2", ".cr3", ".nef", ".arw", ".orf", ".rw2", ".psd", ".psb", ".bmp", ".webp", ".gif"]),
  final_websize: new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif"]),
  final_fullsize: new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".heif", ".psd", ".psb"]),
  raw_grundrisse: new Set([".pdf", ".jpg", ".jpeg", ".png", ".svg", ".tif", ".tiff", ".dwg", ".dxf"]),
  final_grundrisse: new Set([".pdf", ".jpg", ".jpeg", ".png", ".svg", ".tif", ".tiff"]),
  raw_video: new Set([".mp4", ".mov", ".avi", ".mxf", ".mts", ".m2ts", ".mkv", ".wmv", ".webm", ".r3d", ".braw", ".dng", ".mpg", ".mpeg", ".m4v", ".3gp"]),
  final_video: new Set([".mp4", ".mov", ".mkv", ".webm", ".m4v"]),
  raw_sonstiges: null,
  zur_auswahl: new Set([".jpg", ".jpeg"]),
};

function sanitizePathSegment(value, fallback = "Unbekannt", maxLen = 120) {
  const cleaned = String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, maxLen).trim();
}

function sanitizeUploadFilename(value) {
  const raw = path.basename(String(value || ""));
  const cleaned = raw
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || `datei_${Date.now()}`;
}

function normalizeUploadMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "new_batch" ? "new_batch" : "existing";
}

function sanitizeUploadComment(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function toPortablePath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function checkUploadExtension(categoryKey, filename) {
  const allowed = UPLOAD_ALLOWED_EXT[categoryKey];
  if (!allowed) return { ok: true };
  const ext = path.extname(filename || "").toLowerCase();
  if (!ext) return { ok: false, ext: "(keine Endung)" };
  if (!allowed.has(ext)) return { ok: false, ext };
  return { ok: true };
}

function parseZipCity(zipcity) {
  const cleaned = String(zipcity || "").trim();
  const match = cleaned.match(/^(\d{4})\s+(.+)$/);
  if (!match) return { zip: "", city: cleaned };
  return { zip: String(match[1] || ""), city: String(match[2] || "") };
}

function parseAddressLine(value) {
  const input = String(value || "").trim();
  if (!input) return { street: "", zip: "", city: "" };
  const commaMatch = input.match(/^(.*?),(?:\s*)(\d{4})\s+(.+)$/);
  if (commaMatch) {
    return {
      street: String(commaMatch[1] || "").trim(),
      zip: String(commaMatch[2] || "").trim(),
      city: String(commaMatch[3] || "").trim(),
    };
  }
  const tailMatch = input.match(/^(.*?)(?:\s*,?\s*)(\d{4})\s+(.+)$/);
  if (tailMatch) {
    return {
      street: String(tailMatch[1] || "").trim().replace(/,\s*$/, ""),
      zip: String(tailMatch[2] || "").trim(),
      city: String(tailMatch[3] || "").trim(),
    };
  }
  return { street: input, zip: "", city: "" };
}

/** Relativer NAS-Basis-Pfad (mehrere Segmente mit /); null wenn leer/ungültig */
function sanitizeNasFolderBase(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parts = trimmed
    .split(/[/\\]+/)
    .map((p) => sanitizePathSegment(p.trim(), null, 120))
    .filter(Boolean);
  return parts.length ? parts.join("/") : null;
}

function joinPortableRelative(...segments) {
  return segments
    .filter(Boolean)
    .join("/")
    .replace(/\/{2,}/g, "/");
}

function deriveOrderNaming(order) {
  const parsedAddress = parseAddressLine(order?.address || "");
  const billing = order?.billing || {};
  const fallbackZipCity = parseZipCity(order?.customerZipcity || billing?.zipcity || "");
  const street = sanitizePathSegment(
    parsedAddress.street || order?.customerStreet || billing?.street || order?.address || "Objekt",
    "Objekt",
  );
  const zip = sanitizePathSegment(parsedAddress.zip || fallbackZipCity.zip, "", 10);
  const city = sanitizePathSegment(parsedAddress.city || fallbackZipCity.city, "Ort", 80);
  const zipCity = [zip, city].filter(Boolean).join(" ").trim() || city || "Ort";
  const orderNo = sanitizePathSegment(order?.orderNo, "Buchung", 40);
  const displayName = `${zipCity}, ${street} #${orderNo}`;
  const companyName = sanitizePathSegment(
    billing.company || order?.customerName || order?.billing?.name || `Auftrag ${orderNo}`,
    `Auftrag ${orderNo}`,
  );
  return {
    orderNo,
    companyName,
    street,
    zipCity,
    displayName: sanitizePathSegment(displayName, `Auftrag ${orderNo}`, 200),
  };
}

function ensureDirStructure(baseDir, structure) {
  fs.mkdirSync(baseDir, { recursive: true });
  for (const rel of structure) {
    fs.mkdirSync(path.join(baseDir, rel), { recursive: true });
  }
}

function readMountInfo() {
  try {
    return fs.readFileSync("/proc/self/mountinfo", "utf8").split("\n").filter(Boolean);
  } catch (_) {
    return [];
  }
}

function isMountedPath(targetPath) {
  const resolved = path.resolve(targetPath);
  return readMountInfo().some((line) => {
    const parts = line.split(" ");
    return parts[4] === resolved;
  });
}

function assertRootReady(rootPath, { label, allowCreate = false } = {}) {
  const resolved = path.resolve(rootPath);
  if (!fs.existsSync(resolved)) {
    if (allowCreate) {
      fs.mkdirSync(resolved, { recursive: true });
    } else {
      throw new Error(`${label || "Pfad"} nicht gefunden: ${resolved}`);
    }
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`${label || "Pfad"} ist kein Verzeichnis: ${resolved}`);
  }
  if (REQUIRE_MOUNT && !isMountedPath(resolved)) {
    throw new Error(`${label || "Pfad"} ist nicht als Mount verfügbar: ${resolved}`);
  }
  fs.accessSync(resolved, fs.constants.R_OK | fs.constants.W_OK);
  return resolved;
}

function getStorageRoots() {
  return {
    customerRoot: CUSTOMER_UPLOAD_ROOT,
    rawRoot: RAW_MATERIAL_ROOT,
    stagingRoot: LOCAL_STAGING_ROOT,
    customerArchiveRoot: CUSTOMER_ARCHIVE_ROOT,
    rawArchiveRoot: RAW_ARCHIVE_ROOT,
  };
}

function getStorageHealth() {
  const checks = [
    { key: "customerRoot", path: CUSTOMER_UPLOAD_ROOT, label: "Kunden-Root", allowCreate: false },
    { key: "rawRoot", path: RAW_MATERIAL_ROOT, label: "Raw-Root", allowCreate: false },
    { key: "stagingRoot", path: LOCAL_STAGING_ROOT, label: "Staging-Root", allowCreate: true },
  ];
  return checks.map((entry) => {
    try {
      const resolved = assertRootReady(entry.path, { label: entry.label, allowCreate: entry.allowCreate });
      return {
        key: entry.key,
        path: resolved,
        ok: true,
        mounted: entry.allowCreate ? null : isMountedPath(resolved),
      };
    } catch (error) {
      return {
        key: entry.key,
        path: path.resolve(entry.path),
        ok: false,
        mounted: entry.allowCreate ? null : false,
        error: error instanceof Error ? error.message : "Unbekannter Fehler",
      };
    }
  });
}

function getFolderRoot(folderType) {
  return folderType === "raw_material" ? RAW_MATERIAL_ROOT : CUSTOMER_UPLOAD_ROOT;
}

function getArchiveRoot(folderType) {
  return folderType === "raw_material" ? RAW_ARCHIVE_ROOT : CUSTOMER_ARCHIVE_ROOT;
}

function getFolderStructure(folderType) {
  return folderType === "raw_material" ? RAW_MATERIAL_STRUCTURE : CUSTOMER_UPLOAD_STRUCTURE;
}

function buildFolderDefinitions(order) {
  const naming = deriveOrderNaming(order);
  const custBase = sanitizeNasFolderBase(order?.customerNasCustomerFolderBase);
  const rawBase = sanitizeNasFolderBase(order?.customerNasRawFolderBase);
  const customerRel = custBase
    ? joinPortableRelative(custBase, naming.displayName)
    : joinPortableRelative(naming.companyName, naming.displayName);
  const rawRel = rawBase ? joinPortableRelative(rawBase, naming.displayName) : naming.displayName;
  const customerAbs = path.join(CUSTOMER_UPLOAD_ROOT, ...customerRel.split("/").filter(Boolean));
  const rawAbs = path.join(RAW_MATERIAL_ROOT, ...rawRel.split("/").filter(Boolean));
  return {
    raw_material: {
      folderType: "raw_material",
      rootKind: "raw",
      rootPath: RAW_MATERIAL_ROOT,
      relativePath: rawRel,
      absolutePath: rawAbs,
      displayName: naming.displayName,
      companyName: naming.companyName,
      structure: RAW_MATERIAL_STRUCTURE,
    },
    customer_folder: {
      folderType: "customer_folder",
      rootKind: "customer",
      rootPath: CUSTOMER_UPLOAD_ROOT,
      relativePath: customerRel,
      absolutePath: customerAbs,
      displayName: naming.displayName,
      companyName: naming.companyName,
      structure: CUSTOMER_UPLOAD_STRUCTURE,
    },
  };
}

/**
 * Versucht einen Nextcloud-Freigabelink zu erstellen und in der DB zu speichern.
 * Schlägt lautlos fehl wenn Nextcloud nicht konfiguriert oder der API-Call scheitert.
 *
 * @param {number} orderNo
 * @param {string} relativePath - relativer Pfad ab Customer-Root
 * @param {object} db
 * @returns {Promise<string|null>} share URL oder null
 */
async function tryCreateNextcloudShare(orderNo, relativePath, db) {
  if (!ncShare.isNextcloudConfigured()) return null;
  try {
    const ncPath = ncShare.buildNextcloudPath(relativePath);
    const { shareUrl } = await ncShare.createNextcloudShare(ncPath);
    await db.setOrderFolderNextcloudShare(orderNo, "customer_folder", shareUrl);
    return shareUrl;
  } catch (err) {
    // Kein harter Fehler — Ordner ist trotzdem angelegt
    console.warn("[nextcloud-share] Share konnte nicht erstellt werden:", err.message);
    return null;
  }
}

async function provisionOrderFolders(order, db, { folderTypes = ["raw_material", "customer_folder"], createMissing = true } = {}) {
  const defs = buildFolderDefinitions(order);
  const links = {};
  for (const folderType of folderTypes) {
    const def = defs[folderType];
    if (!def) continue;
    assertRootReady(def.rootPath, { label: folderType === "raw_material" ? "Raw-Root" : "Kunden-Root" });
    if (createMissing) ensureDirStructure(def.absolutePath, def.structure);
    const link = await db.upsertOrderFolderLink({
      orderNo: order.orderNo,
      folderType: def.folderType,
      rootKind: def.rootKind,
      relativePath: toPortablePath(def.relativePath),
      absolutePath: def.absolutePath,
      displayName: def.displayName,
      companyName: def.companyName,
      status: "ready",
      lastError: null,
    });
    links[folderType] = link;
    if (folderType === "customer_folder") {
      await tryCreateNextcloudShare(order.orderNo, toPortablePath(def.relativePath), db);
    }
  }
  return links;
}

async function getOrderFolderSummary(order, db, { createMissing = false } = {}) {
  const defs = buildFolderDefinitions(order);
  const existing = await db.listOrderFolderLinks(order.orderNo);
  const byType = existing.reduce((acc, row) => {
    if (!acc[row.folder_type] && !row.archived_at) acc[row.folder_type] = row;
    return acc;
  }, {});
  if (createMissing) {
    await provisionOrderFolders(order, db, { createMissing: true });
    return getOrderFolderSummary(order, db, { createMissing: false });
  }
  return ["raw_material", "customer_folder"].map((folderType) => {
    const row = byType[folderType];
    const expected = defs[folderType];
    const absolutePath = row?.absolute_path || expected.absolutePath;
    const exists = fs.existsSync(absolutePath);
    return {
      folderType,
      status: row?.status || (exists ? "ready" : "pending"),
      displayName: row?.display_name || expected.displayName,
      companyName: row?.company_name || expected.companyName,
      relativePath: row?.relative_path || toPortablePath(expected.relativePath),
      absolutePath,
      exists,
      archivedAt: row?.archived_at || null,
      lastError: row?.last_error || null,
      nextcloudShareUrl: row?.nextcloud_share_url || null,
    };
  });
}

async function linkExistingOrderFolder(order, db, { folderType, relativePath, rename = false }) {
  const defs = buildFolderDefinitions(order);
  const def = defs[folderType];
  if (!def) throw new Error("Ungültiger Ordnertyp");
  const rootPath = assertRootReady(def.rootPath, { label: folderType === "raw_material" ? "Raw-Root" : "Kunden-Root" });
  const normalizedRelative = path.normalize(String(relativePath || "")).replace(/^([/\\])+/, "");
  if (!normalizedRelative) throw new Error("Pfad fehlt");
  let absolutePath = path.resolve(rootPath, normalizedRelative);
  if (!(absolutePath === rootPath || absolutePath.startsWith(rootPath + path.sep))) {
    throw new Error("Pfad liegt ausserhalb des erlaubten Root-Verzeichnisses");
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error("Zielordner nicht gefunden");
  }

  // Optional: Ordner auf NAS nach Benennungskonvention umbenennen
  let renameWarning = null;
  if (rename) {
    const expectedAbs = def.absolutePath;
    if (absolutePath !== expectedAbs) {
      if (fs.existsSync(expectedAbs)) {
        renameWarning = `Zielordner existiert bereits: ${expectedAbs} – Ordner nicht umbenannt.`;
      } else {
        try {
          renameWarning = moveDirectoryWithFallback(absolutePath, expectedAbs, rootPath);
          absolutePath = expectedAbs;
        } catch (err) {
          renameWarning = `Umbenennung fehlgeschlagen: ${err.message} – Ordner unter originalem Pfad verknüpft.`;
        }
      }
    }
  }

  const finalRelative = toPortablePath(path.relative(rootPath, absolutePath));
  const result = await db.upsertOrderFolderLink({
    orderNo: order.orderNo,
    folderType,
    rootKind: folderType === "raw_material" ? "raw" : "customer",
    relativePath: finalRelative,
    absolutePath,
    displayName: def.displayName,
    companyName: def.companyName,
    status: "linked",
    lastError: null,
  });
  if (folderType === "customer_folder") {
    await tryCreateNextcloudShare(order.orderNo, finalRelative, db);
  }
  return { ...result, renameWarning };
}

async function archiveOrderFolder(order, db, folderType) {
  const current = await db.getOrderFolderLink(order.orderNo, folderType);
  if (!current) throw new Error("Kein aktiver Ordnerlink gefunden");
  if (!fs.existsSync(current.absolute_path) || !fs.statSync(current.absolute_path).isDirectory()) {
    return db.archiveOrderFolderLink(order.orderNo, folderType, current.absolute_path, "archived");
  }
  const archiveRoot = assertRootReady(getArchiveRoot(folderType), {
    label: folderType === "raw_material" ? "Raw-Archiv" : "Kunden-Archiv",
    allowCreate: true,
  });
  const timeStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archivedName = `${path.basename(current.absolute_path)}__archiv_${timeStamp}`;
  const archivedPath = path.join(archiveRoot, archivedName);
  fs.mkdirSync(path.dirname(archivedPath), { recursive: true });
  fs.renameSync(current.absolute_path, archivedPath);
  return db.archiveOrderFolderLink(order.orderNo, folderType, archivedPath, "archived");
}

function walkFilesRecursive(baseDir) {
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) return [];
  const files = [];
  const stack = [baseDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
      } else if (entry.isFile()) {
        files.push(abs);
      }
    }
  }
  return files;
}

function removeEmptyDirsRecursive(baseDir, { keepRoot = true } = {}) {
  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) return;
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    removeEmptyDirsRecursive(path.join(baseDir, entry.name), { keepRoot: false });
  }
  if (!keepRoot && fs.readdirSync(baseDir).length === 0) {
    try { fs.rmdirSync(baseDir); } catch (_) {}
  }
}

function copyFileVerified(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  const sourceStat = fs.statSync(sourcePath);
  const targetStat = fs.statSync(targetPath);
  if (Number(sourceStat.size || 0) !== Number(targetStat.size || 0)) {
    throw new Error("Dateigroesse nach Kopie stimmt nicht ueberein");
  }
  if (sourceStat.atime && sourceStat.mtime) {
    try { fs.utimesSync(targetPath, sourceStat.atime, sourceStat.mtime); } catch (_) {}
  }
  const sourceHash = sha256File(sourcePath);
  const targetHash = sha256File(targetPath);
  if (sourceHash !== targetHash) {
    throw new Error("Dateiinhalt nach Kopie stimmt nicht ueberein");
  }
  return sourceHash;
}

function moveDirectoryWithFallback(sourceDir, targetDir, rootPath) {
  const resolvedSource = path.resolve(sourceDir);
  const resolvedTarget = path.resolve(targetDir);
  if (resolvedSource === resolvedTarget) return null;

  fs.mkdirSync(path.dirname(resolvedTarget), { recursive: true });
  try {
    fs.renameSync(resolvedSource, resolvedTarget);
    return null;
  } catch (renameErr) {
    fs.cpSync(resolvedSource, resolvedTarget, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    fs.rmSync(resolvedSource, { recursive: true, force: false });

    const resolvedRoot = path.resolve(rootPath);
    const sourceParent = path.dirname(resolvedSource);
    if (sourceParent === resolvedRoot || sourceParent.startsWith(resolvedRoot + path.sep)) {
      removeEmptyDirsRecursive(sourceParent, { keepRoot: false });
    }

    const suffix = renameErr?.message ? ` (${renameErr.message})` : "";
    return `Direkte Umbenennung fehlgeschlagen${suffix} – Ordner wurde per Kopie auf den Zielpfad verschoben.`;
  }
}

async function moveRawMaterialToCustomerFolder(order, db) {
  if (!db) throw new Error("DB nicht verfuegbar");
  let rawLink = await db.getOrderFolderLink(order.orderNo, "raw_material");
  let customerLink = await db.getOrderFolderLink(order.orderNo, "customer_folder");
  if (!rawLink || !customerLink) {
    const links = await provisionOrderFolders(order, db, {
      folderTypes: ["raw_material", "customer_folder"],
      createMissing: true,
    });
    rawLink = rawLink || links.raw_material || await db.getOrderFolderLink(order.orderNo, "raw_material");
    customerLink = customerLink || links.customer_folder || await db.getOrderFolderLink(order.orderNo, "customer_folder");
  }
  if (!rawLink || !customerLink) {
    throw new Error("Rohmaterial- oder Kundenordner fehlt");
  }
  if (!fs.existsSync(rawLink.absolute_path) || !fs.statSync(rawLink.absolute_path).isDirectory()) {
    throw new Error("Rohmaterial-Ordner nicht gefunden");
  }
  if (!fs.existsSync(customerLink.absolute_path) || !fs.statSync(customerLink.absolute_path).isDirectory()) {
    throw new Error("Kundenordner nicht gefunden");
  }

  const files = walkFilesRecursive(rawLink.absolute_path);
  const stats = {
    scanned: 0,
    moved: 0,
    skippedExisting: 0,
    removedIdentical: 0,
  };

  for (const sourcePath of files) {
    const relativePath = path.relative(rawLink.absolute_path, sourcePath);
    if (!relativePath || relativePath.startsWith("..")) continue;
    stats.scanned += 1;

    // Behalte innerhalb von "Unbearbeitete" denselben Unterordnerpfad bei.
    const targetPath = path.join(customerLink.absolute_path, relativePath);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      const sourceHash = sha256File(sourcePath);
      const targetHash = sha256File(targetPath);
      if (sourceHash === targetHash) {
        try { fs.unlinkSync(sourcePath); } catch (_) {}
        stats.removedIdentical += 1;
      } else {
        stats.skippedExisting += 1;
      }
      continue;
    }

    copyFileVerified(sourcePath, targetPath);
    try { fs.unlinkSync(sourcePath); } catch (_) {}
    stats.moved += 1;
  }

  removeEmptyDirsRecursive(rawLink.absolute_path, { keepRoot: true });
  return stats;
}

function ensureLocalStagingRoot() {
  return assertRootReady(LOCAL_STAGING_ROOT, { label: "Staging-Root", allowCreate: true });
}

function createStagingBatchDir(batchId) {
  const root = ensureLocalStagingRoot();
  const batchDir = path.join(root, sanitizePathSegment(batchId, "batch", 120));
  fs.mkdirSync(batchDir, { recursive: true });
  return batchDir;
}

function createUniqueBatchDir(targetDir) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const HH = String(now.getHours()).padStart(2, "0");
  const MM = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");
  const base = `Nachlieferung_${yyyy}-${mm}-${dd}_${HH}${MM}${SS}`;
  let name = base;
  let index = 2;
  while (fs.existsSync(path.join(targetDir, name))) {
    name = `${base}_${index}`;
    index += 1;
  }
  const abs = path.join(targetDir, name);
  fs.mkdirSync(abs, { recursive: true });
  return { name, abs };
}

function findDuplicateInTarget(targetDir, fileName, incomingHash) {
  const sameNamePath = path.join(targetDir, fileName);
  if (fs.existsSync(sameNamePath) && fs.statSync(sameNamePath).isFile()) {
    return { duplicate: true, reason: "name", existingFile: fileName };
  }
  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(targetDir, entry.name);
      const existingHash = sha256File(fullPath);
      if (existingHash === incomingHash) {
        return { duplicate: true, reason: "content", existingFile: entry.name };
      }
    }
  } catch (_) {}
  return { duplicate: false };
}

function writeCommentFile(targetDir, commentText) {
  const baseName = "Kommentar";
  const ext = ".txt";
  let fileName = `${baseName}${ext}`;
  let fullPath = path.join(targetDir, fileName);
  if (fs.existsSync(fullPath)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fileName = `${baseName}-${stamp}${ext}`;
    fullPath = path.join(targetDir, fileName);
  }
  fs.writeFileSync(fullPath, `${String(commentText || "").trim()}\n`, "utf8");
  return { fileName, fullPath };
}

function isPathInside(parentDir, childPath) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(parent + path.sep);
}

function listUploadTree(baseDir, baseRelative = "") {
  if (!fs.existsSync(baseDir)) return [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  return entries
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name, "de");
    })
    .map((entry) => {
      const abs = path.join(baseDir, entry.name);
      const rel = toPortablePath(path.join(baseRelative, entry.name));
      if (entry.isDirectory()) {
        return {
          type: "dir",
          name: entry.name,
          relativePath: rel,
          children: listUploadTree(abs, rel),
        };
      }
      const stat = fs.statSync(abs);
      return {
        type: "file",
        name: entry.name,
        relativePath: rel,
        size: Number(stat.size || 0),
        modifiedAt: stat.mtime.toISOString(),
      };
    });
}

module.exports = {
  CUSTOMER_UPLOAD_ROOT,
  RAW_MATERIAL_ROOT,
  LOCAL_STAGING_ROOT,
  CUSTOMER_ARCHIVE_ROOT,
  RAW_ARCHIVE_ROOT,
  CUSTOMER_UPLOAD_STRUCTURE,
  RAW_MATERIAL_STRUCTURE,
  UPLOAD_CATEGORY_MAP,
  sanitizePathSegment,
  sanitizeUploadFilename,
  normalizeUploadMode,
  sanitizeUploadComment,
  toPortablePath,
  sha256Buffer,
  sha256File,
  checkUploadExtension,
  sanitizeNasFolderBase,
  readMountInfo,
  isMountedPath,
  assertRootReady,
  deriveOrderNaming,
  buildFolderDefinitions,
  provisionOrderFolders,
  getOrderFolderSummary,
  linkExistingOrderFolder,
  archiveOrderFolder,
  getStorageRoots,
  getStorageHealth,
  ensureLocalStagingRoot,
  createStagingBatchDir,
  createUniqueBatchDir,
  findDuplicateInTarget,
  writeCommentFile,
  isPathInside,
  listUploadTree,
  walkFilesRecursive,
  removeEmptyDirsRecursive,
  copyFileVerified,
  moveRawMaterialToCustomerFolder,
};
