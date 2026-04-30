const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const ncShare = require("./nextcloud-share");

const CUSTOMER_UPLOAD_ROOT = process.env.BOOKING_UPLOAD_CUSTOMER_ROOT || process.env.BOOKING_UPLOAD_ROOT || path.join(__dirname, "uploads");
const RAW_MATERIAL_ROOT = process.env.BOOKING_UPLOAD_RAW_ROOT || path.join(__dirname, "uploads-raw");
const DEFAULT_LOCAL_STAGING_ROOT = path.join(os.tmpdir(), "buchungstool-upload-staging");
const CONFIGURED_LOCAL_STAGING_ROOT = String(process.env.BOOKING_UPLOAD_STAGING_ROOT || "").trim();
const LOCAL_STAGING_ROOT = CONFIGURED_LOCAL_STAGING_ROOT || DEFAULT_LOCAL_STAGING_ROOT;
const CUSTOMER_ARCHIVE_ROOT = process.env.BOOKING_UPLOAD_CUSTOMER_ARCHIVE_ROOT || path.join(CUSTOMER_UPLOAD_ROOT, "_ARCHIV");
const RAW_ARCHIVE_ROOT = process.env.BOOKING_UPLOAD_RAW_ARCHIVE_ROOT || path.join(RAW_MATERIAL_ROOT, "_ARCHIV");
const REQUIRE_MOUNT = String(process.env.BOOKING_UPLOAD_REQUIRE_MOUNT || "false").toLowerCase() === "true";

const CUSTOMER_UPLOAD_STRUCTURE = [
  "Unbearbeitete/Bilder",
  "Unbearbeitete/Grundrisse",
  "Unbearbeitete/Video",
  "Unbearbeitete/Sonstiges",
  "Zur Auswahl",
  "Finale/Staging/fullsize",
  "Finale/Staging/websize",
  "Finale/Bilder/websize",
  "Finale/Bilder/fullsize",
  "Finale/Bilder/edits",
  "Finale/Grundrisse",
  "Finale/Video",
];

const RAW_MATERIAL_STRUCTURE = [
  "Unbearbeitete/Bilder",
  "Unbearbeitete/Video",
];

const UPLOAD_CATEGORY_MAP = {
  staging_websize: "Finale/Staging/websize",
  staging_fullsize: "Finale/Staging/fullsize",
  final_websize: "Finale/Bilder/websize",
  final_fullsize: "Finale/Bilder/fullsize",
  final_edits: "Finale/Bilder/edits",
  final_video: "Finale/Video",
  final_grundrisse: "Finale/Grundrisse",
  raw_bilder: "Unbearbeitete/Bilder",
  raw_grundrisse: "Unbearbeitete/Grundrisse",
  raw_video: "Unbearbeitete/Video",
  raw_sonstiges: "Unbearbeitete/Sonstiges",
  zur_auswahl: "Zur Auswahl",
};

const CATEGORY_PATH_SEGMENT_ALIASES = {
  staging_websize: [
    "Finale/Staging/websize",
    "Finale/Staging/Web Size",
    "Finale/Staging/Websize",
    "Finale/Staging/Bilder/websize",
    "Finale/Staging/Bilder/Web Size",
    "Finale/Staging/Bilder/Websize",
  ],
  staging_fullsize: [
    "Finale/Staging/fullsize",
    "Finale/Staging/Full Size",
    "Finale/Staging/Fullsize",
    "Finale/Staging/Bilder/fullsize",
    "Finale/Staging/Bilder/Full Size",
    "Finale/Staging/Bilder/Fullsize",
  ],
  final_websize: [
    "Finale/Bilder/websize",
    "Finale/Bilder/Websize",
    "Finale/Bilder/WEB SIZE",
    "Finale/Bilder/Web Size",
    "Finale/Web Size",
    "Finale/Websize",
    "Finale/websize",
  ],
  final_fullsize: [
    "Finale/Bilder/fullsize",
    "Finale/Bilder/Fullsize",
    "Finale/Bilder/JPEG",
    "Finale/Bilder/jpeg",
    "Finale Bilder",
    "Finale/Full Size",
    "Finale/Fullsize",
    "Finale/fullsize",
  ],
  final_edits: [
    "Finale/Bilder/edits",
    "Finale/Bilder/Edits",
    "Finale/Edits",
    "Finale/edits",
    "Edits",
  ],
  final_video: [
    "Finale/Video",
  ],
  final_grundrisse: [
    "Finale/Grundrisse",
  ],
  raw_bilder: [
    "Unbearbeitete/Bilder",
    "Unbearbeitet/Bilder",
    "unbearbeitet/Bilder",
  ],
  raw_grundrisse: [
    "Unbearbeitete/Grundrisse",
    "Unbearbeitet/Grundrisse",
    "unbearbeitet/Grundrisse",
  ],
  raw_video: [
    "Unbearbeitete/Video",
    "Unbearbeitet/Video",
    "unbearbeitet/Video",
  ],
  raw_sonstiges: [
    "Unbearbeitete/Sonstiges",
    "Unbearbeitet/Sonstiges",
    "unbearbeitet/Sonstiges",
  ],
  zur_auswahl: [
    "Zur Auswahl",
    "Zur auswahl",
  ],
};

const UPLOAD_ALLOWED_EXT = {
  raw_bilder: new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".heif", ".dng", ".raw", ".cr2", ".cr3", ".nef", ".arw", ".orf", ".rw2", ".psd", ".psb", ".bmp", ".webp", ".gif"]),
  staging_websize: new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif"]),
  staging_fullsize: new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".heif", ".psd", ".psb"]),
  final_websize: new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif"]),
  final_fullsize: new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".heif", ".psd", ".psb"]),
  final_edits: new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".heic", ".heif", ".psd", ".psb"]),
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

function normalizeLooseFolderName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function normalizeCategoryAliasGroup(aliases) {
  return Array.from(
    new Set(
      (Array.isArray(aliases) ? aliases : [aliases])
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .map((entry) => normalizeLooseFolderName(entry))
    )
  );
}

function replaceGermanChars(value) {
  return String(value || "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss");
}

function slugifyFilenameStem(fileName, fallback = "datei") {
  const ext = path.extname(String(fileName || ""));
  const base = path.basename(String(fileName || ""), ext);
  const normalized = replaceGermanChars(base)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || fallback;
}

function stripKnownPrefixes(stem, prefixes = []) {
  let current = String(stem || "");
  for (const prefix of prefixes) {
    const normalizedPrefix = slugifyFilenameStem(prefix, "").replace(/^-+|-+$/g, "");
    if (!normalizedPrefix) continue;
    if (current === normalizedPrefix) {
      current = "";
      continue;
    }
    if (current.startsWith(`${normalizedPrefix}-`)) {
      current = current.slice(normalizedPrefix.length + 1);
    }
  }
  return current.replace(/^-+|-+$/g, "");
}

function extractNormalizedZip(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits || "";
}

function buildPrefixedUploadName({ prefix, originalName, zip, extOverride = null, fallbackStem = "datei" }) {
  const stem = slugifyFilenameStem(originalName, fallbackStem);
  const suffixZip = extractNormalizedZip(zip);
  const parts = [String(prefix || "").trim(), stem].filter(Boolean);
  if (suffixZip) parts.push(suffixZip);
  let ext = extOverride == null ? path.extname(String(originalName || "")).toLowerCase() : String(extOverride || "");
  if (ext && !ext.startsWith(".")) ext = `.${ext}`;
  return `${parts.join("-")}${ext}`;
}

function normalizeDerivedStem(originalName, zip, prefixesToStrip = []) {
  let stem = slugifyFilenameStem(originalName, "datei");
  stem = stripKnownPrefixes(stem, prefixesToStrip);
  const normalizedZip = extractNormalizedZip(zip);
  if (normalizedZip && stem.endsWith(`-${normalizedZip}`)) {
    stem = stem.slice(0, -(`-${normalizedZip}`).length);
  }
  return stem || "datei";
}

function buildCanonicalFullsizeName(order, originalName) {
  const naming = deriveOrderNaming(order);
  const originalExt = path.extname(String(originalName || "")).toLowerCase();
  return buildPrefixedUploadName({
    prefix: "hd-datei",
    originalName: normalizeDerivedStem(originalName, naming.zip, ["hd-datei", "web-datei", "web"]),
    zip: naming.zip,
    extOverride: originalExt || null,
  });
}

function buildStoredUploadName(order, categoryKey, originalName, addOrderSuffix) {
  let name;
  if (categoryKey === "staging_fullsize" || categoryKey === "final_fullsize") {
    name = buildCanonicalFullsizeName(order, originalName);
  } else if (categoryKey === "staging_websize" || categoryKey === "final_websize") {
    name = buildDerivedWebsizeName(order, originalName);
  } else {
    name = sanitizeUploadFilename(originalName);
  }
  if (addOrderSuffix && order && order.orderNo != null) {
    const ext = path.extname(name);
    const stem = ext ? name.slice(0, -ext.length) : name;
    name = `${stem}_#${order.orderNo}${ext}`;
  }
  return name;
}

function buildDerivedWebsizeName(order, originalName) {
  const naming = deriveOrderNaming(order);
  return buildPrefixedUploadName({
    prefix: "web-datei",
    originalName: normalizeDerivedStem(originalName, naming.zip, ["hd-datei", "web-datei", "web"]),
    zip: naming.zip,
    extOverride: ".jpg",
  });
}

function buildDerivedFloorplanJpgName(order, originalName) {
  const naming = deriveOrderNaming(order);
  return buildPrefixedUploadName({
    prefix: "web",
    originalName: normalizeDerivedStem(originalName, naming.zip, ["web-datei", "hd-datei", "web"]),
    zip: naming.zip,
    extOverride: ".jpg",
  });
}

function normalizeCategoryAliasPath(aliasPath) {
  return String(aliasPath || "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function tryResolveCategoryPath(orderFolderAbsolutePath, aliasPath) {
  let currentDir = path.resolve(orderFolderAbsolutePath);
  const segments = normalizeCategoryAliasPath(aliasPath);
  for (const segment of segments) {
    const entries = fs.existsSync(currentDir) && fs.statSync(currentDir).isDirectory()
      ? fs.readdirSync(currentDir, { withFileTypes: true })
      : [];
    const normalizedAliases = normalizeCategoryAliasGroup(segment);
    const match = entries.find((entry) => entry.isDirectory() && normalizedAliases.includes(normalizeLooseFolderName(entry.name)));
    if (!match) return null;
    currentDir = path.join(currentDir, match.name);
  }
  return currentDir;
}

function resolveCategoryPath(orderFolderAbsolutePath, categoryKey, { createMissing = false } = {}) {
  const aliases = CATEGORY_PATH_SEGMENT_ALIASES[String(categoryKey || "")] || [];
  for (const aliasPath of aliases) {
    const resolved = tryResolveCategoryPath(orderFolderAbsolutePath, aliasPath);
    if (resolved) return resolved;
  }
  const canonicalPath = String(UPLOAD_CATEGORY_MAP[String(categoryKey || "")] || "");
  let currentDir = path.resolve(orderFolderAbsolutePath);
  for (const segment of normalizeCategoryAliasPath(canonicalPath)) {
    currentDir = path.join(currentDir, segment);
    if (createMissing) fs.mkdirSync(currentDir, { recursive: true });
  }
  return currentDir;
}

function getCanonicalCategoryAbsolutePath(orderFolderAbsolutePath, categoryKey) {
  const canonicalPath = String(UPLOAD_CATEGORY_MAP[String(categoryKey || "")] || "");
  return path.resolve(orderFolderAbsolutePath, ...normalizeCategoryAliasPath(canonicalPath));
}

function resolveExistingCategoryPaths(orderFolderAbsolutePath, categoryKey) {
  const aliases = [
    String(UPLOAD_CATEGORY_MAP[String(categoryKey || "")] || ""),
    ...(CATEGORY_PATH_SEGMENT_ALIASES[String(categoryKey || "")] || []),
  ].filter(Boolean);
  const seen = new Set();
  const results = [];
  for (const aliasPath of aliases) {
    const resolved = tryResolveCategoryPath(orderFolderAbsolutePath, aliasPath);
    if (!resolved) continue;
    const key = path.resolve(resolved).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(path.resolve(resolved));
  }
  return results;
}

function buildUniqueFilenameInDirectory(targetDir, desiredName) {
  const ext = path.extname(String(desiredName || ""));
  const base = path.basename(String(desiredName || ""), ext);
  let candidate = desiredName;
  let index = 2;
  while (fs.existsSync(path.join(targetDir, candidate))) {
    candidate = `${base}-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

function moveFileWithFallback(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (_) {
    copyFileVerified(sourcePath, targetPath);
    fs.unlinkSync(sourcePath);
  }
}

function mergeDirectoryIntoTarget(sourceDir, targetDir, logger = console) {
  const stats = { movedFiles: 0, skippedIdentical: 0, renamedConflicts: 0 };
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) return stats;
  fs.mkdirSync(targetDir, { recursive: true });
  const files = walkFilesRecursive(sourceDir);
  for (const sourcePath of files) {
    const relativePath = path.relative(sourceDir, sourcePath);
    if (!relativePath || relativePath.startsWith("..")) continue;
    const destinationDir = path.join(targetDir, path.dirname(relativePath));
    fs.mkdirSync(destinationDir, { recursive: true });
    let destinationPath = path.join(destinationDir, path.basename(relativePath));
    if (fs.existsSync(destinationPath) && fs.statSync(destinationPath).isFile()) {
      const sourceHash = sha256File(sourcePath);
      const destinationHash = sha256File(destinationPath);
      if (sourceHash === destinationHash) {
        try { fs.unlinkSync(sourcePath); } catch (_) {}
        stats.skippedIdentical += 1;
        continue;
      }
      const uniqueName = buildUniqueFilenameInDirectory(destinationDir, path.basename(relativePath));
      destinationPath = path.join(destinationDir, uniqueName);
      stats.renamedConflicts += 1;
      logger.warn?.("[order-storage] Dateikonflikt bei Migration - verwende Suffix", {
        sourcePath,
        destinationPath,
      });
    }
    moveFileWithFallback(sourcePath, destinationPath);
    stats.movedFiles += 1;
  }
  removeEmptyDirsRecursive(sourceDir, { keepRoot: false });
  if (fs.existsSync(sourceDir) && fs.statSync(sourceDir).isDirectory() && fs.readdirSync(sourceDir).length === 0) {
    try { fs.rmdirSync(sourceDir); } catch (_) {}
  }
  return stats;
}

function mergeLooseFinalImagesFromOrderRoot(orderFolderAbsolutePath, logger = console) {
  const stats = { movedFiles: 0, skippedIdentical: 0, renamedConflicts: 0 };
  const resolvedOrderRoot = path.resolve(orderFolderAbsolutePath);
  const fullsizeRoot = getCanonicalCategoryAbsolutePath(resolvedOrderRoot, "final_fullsize");
  if (!fs.existsSync(resolvedOrderRoot) || !fs.statSync(resolvedOrderRoot).isDirectory()) return stats;
  const entries = fs.readdirSync(resolvedOrderRoot, { withFileTypes: true });
  const toMove = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const name = ent.name;
    if (name.toLowerCase() === "thumbs.db") continue;
    const extCheck = checkUploadExtension("final_fullsize", name);
    if (!extCheck.ok) continue;
    toMove.push(path.join(resolvedOrderRoot, name));
  }
  if (!toMove.length) return stats;
  fs.mkdirSync(fullsizeRoot, { recursive: true });
  for (const sourcePath of toMove) {
    const baseName = path.basename(sourcePath);
    let destinationPath = path.join(fullsizeRoot, baseName);
    if (fs.existsSync(destinationPath) && fs.statSync(destinationPath).isFile()) {
      const sourceHash = sha256File(sourcePath);
      const destinationHash = sha256File(destinationPath);
      if (sourceHash === destinationHash) {
        try {
          fs.unlinkSync(sourcePath);
        } catch (_) {}
        stats.skippedIdentical += 1;
        continue;
      }
      const uniqueName = buildUniqueFilenameInDirectory(fullsizeRoot, baseName);
      destinationPath = path.join(fullsizeRoot, uniqueName);
      stats.renamedConflicts += 1;
      logger.warn?.("[order-storage] Dateikonflikt Root-Bild nach fullsize - verwende Suffix", {
        sourcePath,
        destinationPath,
      });
    }
    moveFileWithFallback(sourcePath, destinationPath);
    stats.movedFiles += 1;
  }
  return stats;
}

function migrateLegacyFinaleImageStructure(orderFolderAbsolutePath, logger = console) {
  const resolvedOrderRoot = path.resolve(orderFolderAbsolutePath);
  const stats = {
    migratedDirs: 0,
    movedFiles: 0,
    skippedIdentical: 0,
    renamedConflicts: 0,
  };
  for (const categoryKey of ["staging_fullsize", "staging_websize", "final_fullsize", "final_websize", "final_edits"]) {
    const canonicalPath = getCanonicalCategoryAbsolutePath(resolvedOrderRoot, categoryKey);
    const existingPaths = resolveExistingCategoryPaths(resolvedOrderRoot, categoryKey);
    for (const sourcePath of existingPaths) {
      const resolvedSource = path.resolve(sourcePath);
      if (resolvedSource.toLowerCase() === canonicalPath.toLowerCase()) continue;
      fs.mkdirSync(canonicalPath, { recursive: true });
      const mergeStats = mergeDirectoryIntoTarget(resolvedSource, canonicalPath, logger);
      stats.migratedDirs += 1;
      stats.movedFiles += mergeStats.movedFiles;
      stats.skippedIdentical += mergeStats.skippedIdentical;
      stats.renamedConflicts += mergeStats.renamedConflicts;
      removeEmptyParentsUntil(path.dirname(resolvedSource), resolvedOrderRoot);
    }
  }
  const rootLoose = mergeLooseFinalImagesFromOrderRoot(resolvedOrderRoot, logger);
  stats.movedFiles += rootLoose.movedFiles;
  stats.skippedIdentical += rootLoose.skippedIdentical;
  stats.renamedConflicts += rootLoose.renamedConflicts;
  return stats;
}

function renameExistingFilesForCategory(orderFolderAbsolutePath, order, categoryKey, logger = console) {
  const fullsizeRoot = getCanonicalCategoryAbsolutePath(orderFolderAbsolutePath, categoryKey);
  const stats = {
    scanned: 0,
    renamed: 0,
    removedIdentical: 0,
    renamedConflicts: 0,
  };
  if (!fs.existsSync(fullsizeRoot) || !fs.statSync(fullsizeRoot).isDirectory()) {
    return stats;
  }
  const files = walkFilesRecursive(fullsizeRoot);
  for (const sourcePath of files) {
    const fileName = path.basename(sourcePath);
    if (fileName.toLowerCase() === "thumbs.db") continue;
    const extCheck = checkUploadExtension(categoryKey, fileName);
    if (!extCheck.ok) continue;
    stats.scanned += 1;
    const desiredName = buildCanonicalFullsizeName(order, fileName);
    if (fileName === desiredName) continue;
    const targetDir = path.dirname(sourcePath);
    let targetPath = path.join(targetDir, desiredName);
    if (path.resolve(targetPath).toLowerCase() === path.resolve(sourcePath).toLowerCase()) continue;
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      const sourceHash = sha256File(sourcePath);
      const targetHash = sha256File(targetPath);
      if (sourceHash === targetHash) {
        try { fs.unlinkSync(sourcePath); } catch (_) {}
        stats.removedIdentical += 1;
        continue;
      }
      const uniqueName = buildUniqueFilenameInDirectory(targetDir, desiredName);
      targetPath = path.join(targetDir, uniqueName);
      stats.renamedConflicts += 1;
      logger.warn?.("[order-storage] Dateikonflikt bei Fullsize-Umbenennung - verwende Suffix", {
        sourcePath,
        targetPath,
      });
    }
    moveFileWithFallback(sourcePath, targetPath);
    stats.renamed += 1;
  }
  return stats;
}

function renameExistingFullsizeFiles(orderFolderAbsolutePath, order, logger = console) {
  return renameExistingFilesForCategory(orderFolderAbsolutePath, order, "final_fullsize", logger);
}

function renameExistingStagingFiles(orderFolderAbsolutePath, order, logger = console) {
  return renameExistingFilesForCategory(orderFolderAbsolutePath, order, "staging_fullsize", logger);
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

function normalizeFolderId(value, fallback = "") {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return String(Math.trunc(num));
  const text = String(value || "").trim();
  if (!text) return fallback;
  return sanitizePathSegment(text, fallback || "", 40);
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
  const orderNo = normalizeFolderId(order?.orderNo, "Buchung");
  const customerId = normalizeFolderId(order?.customerId, orderNo);
  const rawDisplayName = `${zipCity}, ${street} #${orderNo}`;
  const companyName = sanitizePathSegment(
    order?.customerCompany || billing.company || order?.customerName || order?.billing?.name || `Auftrag ${orderNo}`,
    `Auftrag ${orderNo}`,
  );
  const customerCompanyName = sanitizePathSegment(`${companyName} #${customerId}`, companyName, 200);
  return {
    orderNo,
    customerId,
    companyName,
    customerCompanyName,
    street,
    zip,
    zipCity,
    rawDisplayName: sanitizePathSegment(rawDisplayName, `Auftrag ${orderNo}`, 200),
    customerDisplayName: sanitizePathSegment(rawDisplayName, `Auftrag ${orderNo}`, 200),
  };
}

/**
 * Gibt den categoryKey zurück wenn rel dem kanonischen Pfad dieser Kategorie entspricht.
 * Ermöglicht in ensureDirStructure alle Aliases (z. B. "WEB SIZE", "Websize") zu prüfen,
 * statt nur den exakten kanonischen String — damit kein zweiter Ordner angelegt wird.
 */
function findCategoryKeyForStructurePath(rel) {
  for (const [key, canonicalPath] of Object.entries(UPLOAD_CATEGORY_MAP)) {
    if (canonicalPath === rel) return key;
  }
  return null;
}

function ensureDirStructure(baseDir, structure) {
  fs.mkdirSync(baseDir, { recursive: true });
  for (const rel of structure) {
    // Für Pfade die einer bekannten Kategorie entsprechen (z.B. "Finale/Bilder/websize")
    // werden ALLE definierten Aliases berücksichtigt — so wird z.B. "WEB SIZE" als
    // bestehender websize-Ordner erkannt und kein zweiter Ordner angelegt.
    const categoryKey = findCategoryKeyForStructurePath(rel);
    const alreadyExists = categoryKey
      ? resolveExistingCategoryPaths(baseDir, categoryKey).length > 0
      : tryResolveCategoryPath(baseDir, rel);
    if (alreadyExists) continue;
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

function getSafeStagingRootForDisplay() {
  try {
    return getEffectiveLocalStagingRoot();
  } catch (_) {
    return LOCAL_STAGING_ROOT;
  }
}

function getStorageRoots() {
  return {
    customerRoot: CUSTOMER_UPLOAD_ROOT,
    rawRoot: RAW_MATERIAL_ROOT,
    stagingRoot: getSafeStagingRootForDisplay(),
    customerArchiveRoot: CUSTOMER_ARCHIVE_ROOT,
    rawArchiveRoot: RAW_ARCHIVE_ROOT,
  };
}

function getStorageHealth() {
  const checks = [
    { key: "customerRoot", path: CUSTOMER_UPLOAD_ROOT, label: "Kunden-Root", allowCreate: false },
    { key: "rawRoot", path: RAW_MATERIAL_ROOT, label: "Raw-Root", allowCreate: false },
    { key: "stagingRoot", path: getSafeStagingRootForDisplay(), label: "Staging-Root", allowCreate: true },
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
    ? joinPortableRelative(custBase, naming.customerCompanyName, naming.customerDisplayName)
    : joinPortableRelative(naming.customerCompanyName, naming.customerDisplayName);
  const rawRel = rawBase ? joinPortableRelative(rawBase, naming.rawDisplayName) : naming.rawDisplayName;
  const customerAbs = path.join(CUSTOMER_UPLOAD_ROOT, ...customerRel.split("/").filter(Boolean));
  const rawAbs = path.join(RAW_MATERIAL_ROOT, ...rawRel.split("/").filter(Boolean));
  return {
    raw_material: {
      folderType: "raw_material",
      rootKind: "raw",
      rootPath: RAW_MATERIAL_ROOT,
      relativePath: rawRel,
      absolutePath: rawAbs,
      displayName: naming.rawDisplayName,
      companyName: naming.companyName,
      structure: RAW_MATERIAL_STRUCTURE,
    },
    customer_folder: {
      folderType: "customer_folder",
      rootKind: "customer",
      rootPath: CUSTOMER_UPLOAD_ROOT,
      relativePath: customerRel,
      absolutePath: customerAbs,
      displayName: naming.customerDisplayName,
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
 * @param {string} relativePath - relativer Pfad ab Customer-Root, inkl. `.../Finale` (Wunsch-Share-Root)
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

/** @returns {boolean} true wenn beide Pfade auf denselben absoluten Pfad zeigen */
function isSameOrderFolderPath(p1, p2) {
  if (p1 == null || p2 == null) return false;
  try {
    return path.resolve(String(p1)) === path.resolve(String(p2));
  } catch {
    return false;
  }
}

async function provisionOrderFolders(order, db, { folderTypes = ["raw_material", "customer_folder"], createMissing = true } = {}) {
  const defs = buildFolderDefinitions(order);
  const links = {};
  for (const folderType of folderTypes) {
    const def = defs[folderType];
    if (!def) continue;
    assertRootReady(def.rootPath, { label: folderType === "raw_material" ? "Raw-Root" : "Kunden-Root" });
    if (createMissing) {
      const existingLink = await db.getOrderFolderLink(order.orderNo, def.folderType);
      if (
        existingLink &&
        String(existingLink.status || "") === "linked" &&
        existingLink.absolute_path &&
        !isSameOrderFolderPath(existingLink.absolute_path, def.absolutePath)
      ) {
        // Bereits an anderer Stelle verknüpft: kein zweiter Platzhalter am kanonischen Pfad,
        // kein DB-Update (würde den verknüpften Pfad überschreiben), kein neuer Nextcloud-Share.
        console.warn(
          "[order-storage] provisionOrderFolders: Anlage/Update übersprungen für " +
            def.folderType +
            " (bereits verknüpft, nicht am kanonischen Ziel: " +
            String(existingLink.absolute_path) +
            " ; kanonisch: " +
            def.absolutePath +
            ")"
        );
        links[folderType] = existingLink;
        continue;
      }
    }
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
      const finaleRel = toPortablePath(joinPortableRelative(toPortablePath(def.relativePath), "Finale"));
      await tryCreateNextcloudShare(order.orderNo, finaleRel, db);
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
      nextcloudShareUrl: row?.nextcloud_share_url || null,
      exists,
      archivedAt: row?.archived_at || null,
      lastError: row?.last_error || null,
    };
  });
}

async function linkExistingOrderFolder(order, db, { folderType, relativePath, rename = true }) {
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
  let nextAbsolutePath = absolutePath;
  let nextRelativePath = toPortablePath(path.relative(rootPath, absolutePath));
  let renameInfo = null;
  let renameWarning = null;

  if (folderType === "customer_folder" && rename !== false) {
    const expectedRelativePath = toPortablePath(def.relativePath);
    const expectedAbsolutePath = path.resolve(def.absolutePath);
    const currentAbsolutePath = path.resolve(absolutePath);
    if (currentAbsolutePath !== expectedAbsolutePath) {
      // Nach Provisioning existiert der kanonische Pfad oft schon (nur leere Unterordner).
      // Dann waere rename blockiert — leeren Platzhalter entfernen, damit der gewaehlte Ordner umbenannt werden kann.
      if (fs.existsSync(expectedAbsolutePath)) {
        const hasFiles = walkFilesRecursive(expectedAbsolutePath).length > 0;
        if (!hasFiles) {
          try {
            fs.rmSync(expectedAbsolutePath, { recursive: true, force: true });
          } catch (err) {
            renameWarning = `Leerer Zielordner (Provisioning) konnte nicht entfernt werden: ${err.message}`;
          }
        }
      }
      if (fs.existsSync(expectedAbsolutePath)) {
        if (!renameWarning) {
          renameWarning = `Zielordner existiert bereits: ${expectedAbsolutePath} – Ordner nicht umbenannt.`;
        }
      } else if (!renameWarning) {
        try {
          renameWarning = moveDirectoryWithFallback(currentAbsolutePath, expectedAbsolutePath, rootPath);
          nextAbsolutePath = expectedAbsolutePath;
          nextRelativePath = expectedRelativePath;
          removeEmptyParentsUntil(path.dirname(currentAbsolutePath), rootPath);
          renameInfo = {
            fromRelativePath: toPortablePath(normalizedRelative),
            toRelativePath: expectedRelativePath,
          };
        } catch (err) {
          renameWarning = `Umbenennung fehlgeschlagen: ${err.message} – Ordner unter originalem Pfad verknüpft.`;
        }
      }
    }
  }

  const link = await db.upsertOrderFolderLink({
    orderNo: order.orderNo,
    folderType,
    rootKind: folderType === "raw_material" ? "raw" : "customer",
    relativePath: nextRelativePath,
    absolutePath: nextAbsolutePath,
    displayName: def.displayName,
    companyName: def.companyName,
    status: "linked",
    lastError: null,
  });
  if (folderType === "customer_folder") {
    await tryCreateNextcloudShare(order.orderNo, nextRelativePath, db);
  }
  return { link, renameInfo, renameWarning };
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

function removeEmptyParentsUntil(startDir, stopDir) {
  let current = path.resolve(startDir);
  const stop = path.resolve(stopDir);
  while (current.startsWith(stop + path.sep)) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) break;
    if (fs.readdirSync(current).length > 0) break;
    try {
      fs.rmdirSync(current);
    } catch (_) {
      break;
    }
    current = path.dirname(current);
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

    moveFileWithFallback(sourcePath, targetPath);
    stats.moved += 1;
  }

  removeEmptyDirsRecursive(rawLink.absolute_path, { keepRoot: true });
  return stats;
}

function ensureLocalStagingRoot() {
  return getEffectiveLocalStagingRoot();
}

function getEffectiveLocalStagingRoot() {
  const candidates = [];
  if (CONFIGURED_LOCAL_STAGING_ROOT) {
    candidates.push({
      path: CONFIGURED_LOCAL_STAGING_ROOT,
      source: "configured",
    });
  }
  if (!candidates.some((entry) => path.resolve(entry.path) === path.resolve(DEFAULT_LOCAL_STAGING_ROOT))) {
    candidates.push({
      path: DEFAULT_LOCAL_STAGING_ROOT,
      source: "default",
    });
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return assertRootReady(candidate.path, { label: "Staging-Root", allowCreate: true });
    } catch (err) {
      lastError = err;
      if (candidate.source === "configured") {
        console.warn(
          `[order-storage] configured staging root unavailable (${candidate.path}), falling back to ${DEFAULT_LOCAL_STAGING_ROOT}: ${err.message || err}`
        );
      }
    }
  }

  throw lastError || new Error("Staging-Root nicht verfuegbar");
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
  normalizeLooseFolderName,
  slugifyFilenameStem,
  buildPrefixedUploadName,
  buildCanonicalFullsizeName,
  buildStoredUploadName,
  buildDerivedWebsizeName,
  buildDerivedFloorplanJpgName,
  toPortablePath,
  sha256Buffer,
  sha256File,
  checkUploadExtension,
  getCanonicalCategoryAbsolutePath,
  resolveCategoryPath,
  resolveExistingCategoryPaths,
  migrateLegacyFinaleImageStructure,
  renameExistingFullsizeFiles,
  renameExistingStagingFiles,
  sanitizeNasFolderBase,
  readMountInfo,
  isMountedPath,
  assertRootReady,
  deriveOrderNaming,
  buildFolderDefinitions,
  provisionOrderFolders,
  getOrderFolderSummary,
  findCategoryKeyForStructurePath,
  ensureDirStructure,
  isSameOrderFolderPath,
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
