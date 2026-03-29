const express = require("express");
const compression = require("compression");
const multer = require("multer");
const cors = require("cors");
const pinoHttp = require("pino-http");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const BUILD_ID_FILE_CANDIDATES = [
  process.env.BUILD_ID_FILE,
  "/opt/buchungstool/VERSION",
  path.join(__dirname, "..", "VERSION"),
  path.join(__dirname, "VERSION")
].filter(Boolean);
function getBuildId() {
  for (const candidate of BUILD_ID_FILE_CANDIDATES) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const raw = fs.readFileSync(candidate, "utf8").trim();
      if (raw) return raw;
    } catch (_error) {
      // Fallback auf den naechsten Kandidaten.
    }
  }
  return process.env.BUILD_ID || "dev";
}
const envLocalPath = path.join(__dirname, ".env.local");
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();
const logger = require("./logger");
const console = logger.createModuleConsole();
require("isomorphic-fetch");
const nodemailer = require("nodemailer");
const session = require("express-session");
const mailDeduper = require("./mail_dedupe");
const {
  buildOfficeEmail,
  buildPhotographerEmail,
  buildCustomerEmail,
  buildPricingSummary,
  buildCancellationOfficeEmail,
  buildCancellationPhotographerEmail,
  buildCancellationCustomerEmail,
  buildRescheduleOfficeEmail,
  buildReschedulePhotographerEmail,
  buildRescheduleCustomerEmail,
  buildReassignOfficeEmail,
  buildReassignPhotographerEmail,
  buildReassignCustomerEmail,
  buildCredentialsEmail,
  buildResetPasswordEmail
} = require("./templates/emails");
const { buildCalendarContent, buildCalendarSubject, renderStoredCalendarTemplate } = require("./templates/calendar");
const { computePricing, computeTourDuration } = require("./pricing");
const { resolveEffectiveSqm } = require("./product-meta");
const { markDiscountUsed, validateDiscountCode } = require("./discount-codes");
const { getSetting, listEffectiveDefaults, setSystemSettings: settingsResolverSet } = require("./settings-resolver");
const db = require("./db");
const logtoOrgSync = require("./logto-org-sync");
const {
  UPLOAD_CATEGORY_MAP,
  provisionOrderFolders,
  getOrderFolderSummary,
  linkExistingOrderFolder,
  archiveOrderFolder,
  getStorageHealth,
  moveRawMaterialToCustomerFolder,
} = require("./order-storage");
const {
  stageUploadBatch,
  stageUploadBatchFromPaths,
  getBatchWithFiles,
  enqueueBatchTransfer,
  retryBatchTransfer,
  resumePendingTransfers,
} = require("./upload-batch-service");
const {
  initChunkedUpload,
  saveChunkPart,
  getChunkedUploadStatus,
  completeChunkedUpload,
  finalizeChunkedSession,
} = require("./chunked-upload-service");
const { syncWebsizeForAllCustomerFolders, syncWebsizeForOrderFolder } = require("./websize-sync-service");
const customerAuth = require("./customer-auth");
const travel = require("./travel");
const { resolveAnyPhotographer, buildNeededSkills } = require("./photographer-resolver");
const { isHoliday } = require("./holidays");
const { shadowPricing, shadowAssignment, getShadowLog } = require("./shadow-mode");
const { getTransitionError, getSideEffects, VALID_STATUSES, calcProvisionalExpiresAt } = require("./state-machine");
const { executeSideEffects } = require("./workflow-effects");
const { startJobs } = require("./jobs/index");
const templateRenderer = require("./template-renderer");
const { normalizeTextDeep, repairTextEncoding } = require("./text-normalization");
const { resolveAdminSendEmails, resolveAdminEmailTargets, getEmailSendListForAdminStatus, getResendEmailEffectsForStatus, shouldSendAttendeeNotifications } = require("./admin-status-email");
const crypto = require("crypto");
const { registerCustomerContactsRoutes } = require("./customer-contacts-routes");
const rbac = require("./access-rbac");
const { buildAuthContext } = require("./authz/middleware");
const { registerAccessRoutes } = require("./access-routes");
const { registerAdminUsersRoutes } = require("./admin-users-routes");
const { registerExxasReconcileRoutes } = require("./exxas-reconcile-routes");
const { registerAdminMissingRoutes } = require("./admin-missing-routes");

const { ClientSecretCredential } = require("@azure/identity");
const { Client } = require("@microsoft/microsoft-graph-client");

const {
  MS_GRAPH_TENANT_ID,
  MS_GRAPH_CLIENT_ID,
  MS_GRAPH_CLIENT_SECRET
} = process.env;

const TIMEZONE = process.env.TIMEZONE || "Europe/Zurich";

/** Adress-Autocomplete: EINZIGE Stelle im Projekt - nur Google Places */
const ADDRESS_AUTOCOMPLETE_ENDPOINT = "/api/address-suggest";
const WORK_START = process.env.WORK_START || "08:00";
const WORK_END = process.env.WORK_END || "18:00";
const PORT = parseInt(process.env.PORT || "3001", 10);
function resolveNominatimUrl(value) {
  const fallback = "https://nominatim.openstreetmap.org";
  const raw = String(value || "").trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "null" || raw.toLowerCase() === "undefined") {
    return fallback;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const MAIL_FROM = process.env.MAIL_FROM || "office@propus.ch";
const OFFICE_EMAIL = process.env.OFFICE_EMAIL || "office@propus.ch";
const FRONTEND_LOG_RATE_LIMIT_PER_MIN = Math.max(
  10,
  parseInt(process.env.FRONTEND_LOG_RATE_LIMIT_PER_MIN || "120", 10)
);
const PHOTOGRAPHERS_CONFIG = require("./photographers.config.js");
const PHOTOGRAPHERS = PHOTOGRAPHERS_CONFIG.reduce((acc, p) => {
  if (p && p.key) acc[p.key] = p.email || "";
  return acc;
}, {});
const PHOTOG_PHONES = PHOTOGRAPHERS_CONFIG.reduce((acc, p) => {
  if (p && p.key) acc[p.key] = p.phone || "";
  return acc;
}, {});

const ORDERS_FILE = process.env.ORDERS_FILE || path.join(__dirname, "orders.json");
const ORDER_MESSAGES_FILE = process.env.ORDER_MESSAGES_FILE || path.join(__dirname, "order-messages.json");
const ORDER_CHAT_MESSAGES_FILE = process.env.ORDER_CHAT_MESSAGES_FILE || path.join(__dirname, "order-chat-messages.json");
const EMPLOYEE_ACTIVITY_FILE = process.env.EMPLOYEE_ACTIVITY_FILE || path.join(__dirname, "employee-activity.json");
const BOOKING_UPLOAD_ROOT = process.env.BOOKING_UPLOAD_ROOT || path.join(__dirname, "uploads");
const BOOKING_UPLOAD_MAX_FILE_MB = Math.max(1, Number(process.env.BOOKING_UPLOAD_MAX_FILE_MB || 10240));
const BOOKING_UPLOAD_MAX_FILES = Math.max(1, Number(process.env.BOOKING_UPLOAD_MAX_FILES || 120));
const BOOKING_UPLOAD_STRUCTURE = [
  "Finale/Bilder/Websize",
  "Finale/Bilder/Fullsize",
  "Finale/Video",
  "Finale/Grundrisse",
  "Unbearbeitete/Bilder",
  "Unbearbeitete/Grundrisse",
  "Unbearbeitete/Video",
  "Unbearbeitete/Sonstiges",
  "Zur auswahl"
];
const BOOKING_UPLOAD_CATEGORY_MAP = {
  final_websize: "Finale/Bilder/Websize",
  final_fullsize: "Finale/Bilder/Fullsize",
  final_video: "Finale/Video",
  final_grundrisse: "Finale/Grundrisse",
  raw_bilder: "Unbearbeitete/Bilder",
  raw_grundrisse: "Unbearbeitete/Grundrisse",
  raw_video: "Unbearbeitete/Video",
  raw_sonstiges: "Unbearbeitete/Sonstiges",
  zur_auswahl: "Zur auswahl"
};

// Erlaubte Dateiendungen je Kategorie (lowercase, mit Punkt)
const BOOKING_UPLOAD_ALLOWED_EXT = {
  raw_bilder:     new Set([".jpg",".jpeg",".png",".tif",".tiff",".heic",".heif",".dng",".raw",".cr2",".cr3",".nef",".arw",".orf",".rw2",".psd",".psb",".bmp",".webp",".gif"]),
  final_websize:  new Set([".jpg",".jpeg",".png",".webp",".tif",".tiff",".heic",".heif"]),
  final_fullsize: new Set([".jpg",".jpeg",".png",".tif",".tiff",".heic",".heif",".psd",".psb"]),
  raw_grundrisse: new Set([".pdf",".jpg",".jpeg",".png",".svg",".tif",".tiff",".dwg",".dxf"]),
  final_grundrisse: new Set([".pdf",".jpg",".jpeg",".png",".svg",".tif",".tiff"]),
  raw_video:      new Set([".mp4",".mov",".avi",".mxf",".mts",".m2ts",".mkv",".wmv",".webm",".r3d",".braw",".dng",".mpg",".mpeg",".m4v",".3gp"]),
  final_video:    new Set([".mp4",".mov",".mkv",".webm",".m4v"]),
  raw_sonstiges:  null, // alles erlaubt
  zur_auswahl:    null  // alles erlaubt
};

const frontendLogRateBuckets = new Map();
const chatSseClients = new Map();
const chatUnreadMailTimers = new Map();
const CHAT_ACTIVE_STATUSES = new Set(["pending", "paused", "confirmed", "completed"]);
const CHAT_BLOCKED_STATUSES = new Set(["cancelled", "archived"]);
const CHAT_FEEDBACK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const CHAT_UNREAD_MAIL_DELAY_MS = 5 * 60 * 1000;

function checkUploadExtension(categoryKey, filename) {
  const allowed = BOOKING_UPLOAD_ALLOWED_EXT[categoryKey];
  if (!allowed) return { ok: true }; // null = alles erlaubt
  const ext = require("path").extname(filename || "").toLowerCase();
  if (!ext) return { ok: false, ext: "(keine Endung)" };
  if (!allowed.has(ext)) return { ok: false, ext };
  return { ok: true };
}

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
  return require("crypto").createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  const content = fs.readFileSync(filePath);
  return sha256Buffer(content);
}

function ensureBookingUploadFolders(orderNo, addressText) {
  const folderName = `${sanitizePathSegment(addressText, "Objekt")} - ${sanitizePathSegment(orderNo, "Buchung", 40)}`;
  const baseDir = path.join(BOOKING_UPLOAD_ROOT, folderName);
  fs.mkdirSync(baseDir, { recursive: true });

  const categoryDirs = {};
  for (const rel of BOOKING_UPLOAD_STRUCTURE) {
    const abs = path.join(baseDir, rel);
    fs.mkdirSync(abs, { recursive: true });
    categoryDirs[rel] = abs;
  }
  return { folderName, baseDir, categoryDirs };
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
  let idx = 2;
  while (fs.existsSync(path.join(targetDir, name))) {
    name = `${base}_${idx}`;
    idx += 1;
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
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("") + "-" + [
      String(now.getHours()).padStart(2, "0"),
      String(now.getMinutes()).padStart(2, "0"),
      String(now.getSeconds()).padStart(2, "0")
    ].join("");
    fileName = `${baseName}-${stamp}${ext}`;
    fullPath = path.join(targetDir, fileName);
  }
  fs.writeFileSync(fullPath, `${commentText}\n`, "utf8");
  return { fileName, fullPath };
}

function isPathInside(parentDir, childPath) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(parent + path.sep);
}

function deleteMatchingWebsizeDerivative(orderRootPath, sourcePath) {
  const fullsizeRoot = path.join(orderRootPath, UPLOAD_CATEGORY_MAP.final_fullsize);
  const websizeRoot = path.join(orderRootPath, UPLOAD_CATEGORY_MAP.final_websize);
  if (!isPathInside(fullsizeRoot, sourcePath)) return;
  const relativeToFullsize = path.relative(fullsizeRoot, sourcePath);
  const websizePath = path.join(websizeRoot, relativeToFullsize);
  if (fs.existsSync(websizePath) && fs.statSync(websizePath).isFile()) {
    try {
      fs.unlinkSync(websizePath);
    } catch (_) {}
  }
}

function deleteMatchingWebsizeFolder(orderRootPath, sourceDir) {
  const fullsizeRoot = path.join(orderRootPath, UPLOAD_CATEGORY_MAP.final_fullsize);
  const websizeRoot = path.join(orderRootPath, UPLOAD_CATEGORY_MAP.final_websize);
  if (!isPathInside(fullsizeRoot, sourceDir)) return;
  const relativeToFullsize = path.relative(fullsizeRoot, sourceDir);
  const websizeDir = path.join(websizeRoot, relativeToFullsize);
  if (!fs.existsSync(websizeDir) || !fs.statSync(websizeDir).isDirectory()) return;
  clearDirectoryContentsRecursive(websizeDir);
}

function clearDirectoryContentsRecursive(targetDir) {
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) return 0;
  const entries = fs.readdirSync(targetDir, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    const fullPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      deleted += clearDirectoryContentsRecursive(fullPath);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } catch (_) {}
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      fs.unlinkSync(fullPath);
      deleted += 1;
    } catch (_) {}
  }
  return deleted;
}

async function getOrderForUploadAccess(orderNo, req) {
  const parsedOrderNo = Number(orderNo);
  if (!Number.isFinite(parsedOrderNo)) {
    return { error: { status: 400, message: "Ung-ltige Buchungsnummer" } };
  }
  const order = process.env.DATABASE_URL
    ? await db.getOrderByNo(parsedOrderNo)
    : (await loadOrders()).find(o => Number(o.orderNo) === parsedOrderNo);
  if (!order) {
    return { error: { status: 404, message: "Order not found" } };
  }
  if (req.photographerKey) {
    const orderPhotogKey = String(order.photographer?.key || "").toLowerCase();
    if (!orderPhotogKey || orderPhotogKey !== String(req.photographerKey || "").toLowerCase()) {
      return { error: { status: 403, message: "Nur eigene Auftraege erlaubt" } };
    }
  }
  return { orderNo: parsedOrderNo, order };
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
          children: listUploadTree(abs, rel)
        };
      }
      const stat = fs.statSync(abs);
      return {
        type: "file",
        name: entry.name,
        relativePath: rel,
        size: Number(stat.size || 0),
        modifiedAt: stat.mtime.toISOString()
      };
    });
}

const BOOKING_UPLOAD_TMP = path.join(require("os").tmpdir(), "buchungstool-uploads");
const CHUNK_SIZE_MB = Math.max(1, Number(process.env.CHUNK_SIZE_MB || 32));
const CHUNKED_UPLOAD_TIMEOUT_MS = Math.max(30000, Number(process.env.CHUNKED_UPLOAD_TIMEOUT_MS || 900000));
fs.mkdirSync(BOOKING_UPLOAD_TMP, { recursive: true });
const bookingMaterialUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, BOOKING_UPLOAD_TMP),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(file.originalname || "file")}`;
      cb(null, unique);
    }
  }),
  limits: {
    fileSize: BOOKING_UPLOAD_MAX_FILE_MB * 1024 * 1024,
    files: BOOKING_UPLOAD_MAX_FILES
  }
});

const bookingChunkUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, BOOKING_UPLOAD_TMP),
    filename: (_req, file, cb) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}-${path.basename(file.originalname || "chunk")}`;
      cb(null, unique);
    }
  }),
  limits: {
    fileSize: CHUNK_SIZE_MB * 1024 * 1024,
    files: 1
  }
});

function runBookingMaterialUpload(req, res) {
  return new Promise((resolve, reject) => {
    bookingMaterialUpload.array("files", BOOKING_UPLOAD_MAX_FILES)(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function runChunkPartUpload(req, res) {
  return new Promise((resolve, reject) => {
    bookingChunkUpload.single("chunk")(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// orderCounter wird async initialisiert (DB hat Vorrang, JSON als Fallback)
let orderCounter = 99999;
async function initOrderCounter() {
  try {
    if (process.env.DATABASE_URL) {
      const max = await db.getMaxOrderNo();
      if (max > 0) { orderCounter = max; }
    } else {
      // JSON-Fallback
      if (fs.existsSync(ORDERS_FILE)) {
        const orders = JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
        if (Array.isArray(orders) && orders.length > 0) {
          orderCounter = Math.max(...orders.map(o => Number(o.orderNo) || 0));
        }
      }
    }
  } catch(e){ console.error("[order-counter] init error", e?.message); }
  console.log("[order-counter] initialized at", orderCounter, "-> next will be", orderCounter + 1);
}
function nextOrderNumber(){
  orderCounter += 1;
  return orderCounter;
}

const GRAPH_ENV_KEYS = [
  "MS_GRAPH_TENANT_ID",
  "MS_GRAPH_CLIENT_ID",
  "MS_GRAPH_CLIENT_SECRET"
];

const graphEnvMissing = GRAPH_ENV_KEYS.filter((k) => !process.env[k]);
let credential = null;
let graphClient = null;

if (graphEnvMissing.length) {
  console.warn(`[booking] MS Graph disabled – missing env: ${graphEnvMissing.join(", ")}`);
} else {
  credential = new ClientSecretCredential(
    MS_GRAPH_TENANT_ID,
    MS_GRAPH_CLIENT_ID,
    MS_GRAPH_CLIENT_SECRET
  );

  graphClient = Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken("https://graph.microsoft.com/.default");
        return token.token;
      }
    }
  });
}

function normalizeGraphAttachments(icsAttachment, icsAttachments) {
  const list = Array.isArray(icsAttachments) ? icsAttachments.slice() : [];
  if (icsAttachment) list.push(icsAttachment);
  return list
    .filter(Boolean)
    .map((att) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: att.filename || "event.ics",
      contentType: att.contentType || "text/calendar",
      contentBytes: Buffer.from(String(att.content || ""), "utf8").toString("base64"),
    }));
}

// Graph API E-Mail-Versand (umgeht SMTP-Throttling) mit kurzer Dedupe-Pr-fung
async function sendMailViaGraph(to, subject, htmlBody, textBody, icsAttachment, icsAttachments) {
  if (!graphClient) {
    console.warn("[sendMailViaGraph] MS Graph not configured – skipping");
    return { sent: false, reason: "graph_not_configured", provider: "graph" };
  }
  try {
    const bodyText = String(htmlBody || textBody || "");
    const key = mailDeduper.keyFor(to, subject, bodyText);
    if (!mailDeduper.shouldSend(key)) {
      console.warn("[dedupe] Skipping duplicate mail to", to, "subject:", subject);
      pushMailDiagnostic({
        status: "skipped",
        context: "graph-direct",
        method: "graph",
        to,
        subject,
        reason: "dedupe",
      });
      return { sent: false, reason: "dedupe", provider: "graph" };
    }

    const message = {
      subject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: [{ emailAddress: { address: to } }]
    };
    const attachments = normalizeGraphAttachments(icsAttachment, icsAttachments);
    if (attachments.length > 0) {
      message.attachments = attachments;
    }
    await graphClient.api(`/users/${MAIL_FROM}/sendMail`).post({ message, saveToSentItems: false });
    pushMailDiagnostic({
      status: "ok",
      context: "graph-direct",
      method: "graph",
      to,
      subject,
    });
    return { sent: true, provider: "graph" };
  } catch (err) {
    console.error("[sendMailViaGraph] error:", err?.message || err);
    pushMailDiagnostic({
      status: "failed",
      context: "graph-direct",
      method: "graph",
      to,
      subject,
      attempts: [{ method: "graph", message: String(err?.message || err), code: err?.code || null }],
    });
    return { sent: false, reason: "graph_error", provider: "graph", error: String(err?.message || err) };
  }
}

function assertMailSent(result, context) {
  if (result && result.sent === true) return result;
  const err = new Error((result && (result.error || result.reason)) || "mail_not_sent");
  err.code = (result && result.reason) ? String(result.reason) : "MAIL_NOT_SENT";
  err.context = context || "mail";
  throw err;
}

// ---- Mail diagnostics + fallback sender ----
const MAIL_DIAG_LIMIT = 80;
const _mailDiagnostics = [];

function pushMailDiagnostic(entry) {
  const rec = {
    at: new Date().toISOString(),
    ...entry
  };
  _mailDiagnostics.push(rec);
  if (_mailDiagnostics.length > MAIL_DIAG_LIMIT) _mailDiagnostics.shift();
  return rec;
}

async function sendMailViaGraphStrict(to, subject, htmlBody, textBody, icsAttachment, icsAttachments) {
  if (!graphClient) throw new Error("MS Graph not configured");
  const bodyText = String(htmlBody || textBody || "");
  const key = mailDeduper.keyFor(to, subject, bodyText);
  if (!mailDeduper.shouldSend(key)) {
    const err = new Error("Duplicate mail suppressed by dedupe");
    err.code = "MAIL_DEDUPE";
    throw err;
  }
  const message = {
    subject,
    body: { contentType: "HTML", content: htmlBody },
    toRecipients: [{ emailAddress: { address: to } }]
  };
  const attachments = normalizeGraphAttachments(icsAttachment, icsAttachments);
  if (attachments.length > 0) {
    message.attachments = attachments;
  }
  await graphClient.api(`/users/${MAIL_FROM}/sendMail`).post({ message, saveToSentItems: false });
}

async function sendMailWithFallback({ to, subject, html, text, icsAttachment = null, icsAttachments = null, context = "generic" }) {
  const preferGraph = String(process.env.MAIL_PREFER_GRAPH || "true").toLowerCase() === "true";
  const order = preferGraph ? ["graph", "smtp"] : ["smtp", "graph"];
  const attempts = [];
  const smtpAttachments = []
    .concat(icsAttachment ? [icsAttachment] : [])
    .concat(Array.isArray(icsAttachments) ? icsAttachments : []);

  for (const method of order) {
    try {
      if (method === "smtp") {
        if (!mailer) throw new Error("SMTP not configured");
        await mailer.sendMail({ from: MAIL_FROM, to, subject, html, text, attachments: smtpAttachments.length ? smtpAttachments : undefined });
      } else {
        await sendMailViaGraphStrict(to, subject, html, text, icsAttachment, icsAttachments);
      }
      const okDiag = pushMailDiagnostic({
        status: "ok",
        context,
        method,
        to,
        subject
      });
      return { ok: true, sent: true, method, diagnostic: okDiag };
    } catch (err) {
      attempts.push({ method, message: String(err?.message || err), code: err?.code || null });
    }
  }

  const diag = pushMailDiagnostic({
    status: "failed",
    context,
    to,
    subject,
    attempts
  });
  const fail = new Error("All mail methods failed");
  fail.code = "MAIL_ALL_FAILED";
  fail.attempts = attempts;
  fail.diagnostic = diag;
  throw fail;
}

function parseTimeToMinutes(value){
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function parseAreaToNumber(value){
  const num = Number(String(value || "").replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function getBaseShootDurationMinutes(area){
  if (!Number.isFinite(area) || area <= 0) return 60;
  if (area <= 99) return 60;
  if (area <= 299) return 90;
  return 120;
}

function getLegacyPackageDurationBonus(packageKey) {
  const key = String(packageKey || "").toLowerCase();
  if (key === "cinematic" || key === "fullview") return 30;
  return 0;
}

function pickPrimaryProductRule(product) {
  const rules = Array.isArray(product?.rules) ? product.rules : [];
  const sorted = rules
    .filter((r) => r?.active !== false)
    .sort((a, b) => (Number(a.priority || 0) - Number(b.priority || 0)));
  return sorted[0] || null;
}

async function getDurationBonusFromProducts(effectiveArea, services) {
  try {
    if (!process.env.DATABASE_URL) {
      return getLegacyPackageDurationBonus(services?.package?.key || "");
    }
    const products = await db.listProductsWithRules({ includeInactive: false });
    const byCode = new Map(products.map((p) => [String(p.code || ""), p]));
    let bonus = 0;
    const areaOk = effectiveArea != null && Number.isFinite(Number(effectiveArea)) && Number(effectiveArea) > 0;
    const areaNum = areaOk ? Number(effectiveArea) : null;

    const addProductDuration = (product, qty = 1) => {
      if (!product) return;
      const rule = pickPrimaryProductRule(product);
      if (rule?.rule_type === "area_tier" && areaNum != null) {
        const d = computeTourDuration(areaNum, rule.config_json || {});
        if (d != null) {
          bonus += d * qty;
          return;
        }
      }
      if (product.affects_duration) {
        bonus += Number(product.duration_minutes || 0) * qty;
      }
    };

    const packageCode = String(services?.package?.key || "");
    addProductDuration(byCode.get(packageCode), 1);

    const addons = Array.isArray(services?.addons) ? services.addons : [];
    for (const addon of addons) {
      const code = String(addon?.id || "");
      const qty = Math.max(1, Number(addon?.qty || 1));
      addProductDuration(byCode.get(code), qty);
    }
    return Math.max(0, bonus);
  } catch (_) {
    return getLegacyPackageDurationBonus(services?.package?.key || "");
  }
}

async function getShootDurationMinutes(area, services) {
  let effectiveArea = parseAreaToNumber(area);
  if (effectiveArea == null || effectiveArea <= 0) {
    try {
      if (process.env.DATABASE_URL) {
        const products = await db.listProductsWithRules({ includeInactive: false });
        const byCode = new Map(products.map((p) => [String(p.code || ""), p]));
        effectiveArea = resolveEffectiveSqm(null, services, byCode);
      }
    } catch (_) {
      effectiveArea = null;
    }
  }
  const base = getBaseShootDurationMinutes(effectiveArea ?? 0);
  const bonus = await getDurationBonusFromProducts(effectiveArea, services);
  return base + bonus;
}

async function shouldApplyTravelCalculation(services) {
  try {
    if (!process.env.DATABASE_URL) return true;
    const products = await db.listProductsWithRules({ includeInactive: false });
    const byCode = new Map(products.map((p) => [String(p.code || ""), p]));
    const packageCode = String(services?.package?.key || "");
    const pkg = byCode.get(packageCode);
    if (pkg?.affects_travel) return true;
    const addons = Array.isArray(services?.addons) ? services.addons : [];
    for (const a of addons) {
      const product = byCode.get(String(a?.id || ""));
      if (product?.affects_travel) return true;
    }
    return false;
  } catch (_) {
    return true;
  }
}

function formatMinutes(minutes){
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

function addMinutesToDate(dateStr, minutesToAdd){
  const base = new Date(`${dateStr}T00:00:00Z`);
  const ms = base.getTime() + minutesToAdd * 60000;
  const next = new Date(ms);
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addMinutesLocal(dateStr, timeStr, minutesToAdd){
  const start = new Date(`${dateStr}T${timeStr}:00`);
  const end = new Date(start.getTime() + minutesToAdd * 60000);
  const yyyy = end.getFullYear();
  const mm = String(end.getMonth() + 1).padStart(2, "0");
  const dd = String(end.getDate()).padStart(2, "0");
  const hh = String(end.getHours()).padStart(2, "0");
  const mi = String(end.getMinutes()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

function buildIcsEvent({ title, description, location, date, time, durationMin, uid: existingUid, method }){
  const startMin = parseTimeToMinutes(time) ?? 0;
  const endMinTotal = startMin + durationMin;
  const endDate = addMinutesToDate(date, endMinTotal);
  const endMin = endMinTotal % (24 * 60);
  const startStamp = date.replaceAll("-", "") + "T" + time.replace(":", "") + "00";
  const endStamp = endDate.replaceAll("-", "") + "T" + formatMinutes(endMin).replace(":", "") + "00";
  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const uid = existingUid || `propus-${Date.now()}-${Math.random().toString(36).slice(2)}@propus.ch`;
  const icsMethod = method || "REQUEST";
  const status = icsMethod === "CANCEL" ? "\r\nSTATUS:CANCELLED" : "";

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Propus//Booking//DE",
    "CALSCALE:GREGORIAN",
    `METHOD:${icsMethod}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=${TIMEZONE}:${startStamp}`,
    `DTEND;TZID=${TIMEZONE}:${endStamp}`,
    `SUMMARY:${icsMethod === "CANCEL" ? "ABGESAGT: " : ""}${title}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description.replace(/\r?\n/g, "\\n")}${status}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  return { icsContent, uid };
}

function formatServices(services, withPrice){
  const items = [];
  if (services?.package?.label) {
    items.push(withPrice ? `${services.package.label} - ${services.package.price} CHF` : services.package.label);
  }
  (services?.addons || []).forEach((a) => {
    const label = a.label || a.id || "Service";
    items.push(withPrice ? `${label} - ${a.price} CHF` : label);
  });
  return items.length ? items.join("\n") : "-";
}

const OBJECT_TYPE_DE = {
  apartment: "Wohnung",
  single_house: "Einfamilienhaus",
  multi_house: "Mehrfamilienhaus",
  commercial: "Gewerbe",
  land: "Grundst-ck",
  house: "Haus",
  other: "Anderes"
};
function translateObjectType(type){
  return OBJECT_TYPE_DE[type] || type || "-";
}

function buildObjectInfo(object, addressText){
  const parts = [
    `Adresse: ${addressText || "-"}`,
    `Objektart: ${translateObjectType(object?.type)}`,
    `Wohn-/Nutzflaeche: ${object?.area || "-"} m2`,
    `Etagen/Ebene: ${object?.floors || "-"}`,
    `Zimmer: ${object?.rooms || "-"}`,
    `Besonderheiten: ${object?.specials || "-"}`,
    `Beschreibung: ${object?.desc || "-"}`
  ];
  return parts.join("\n");
}

function getZipCityFromBilling(billing){
  const raw = String(billing?.zipcity || "").trim();
  if (!raw) return "-";
  return raw;
}

function extractPostalCityFromAddress(addressText){
  const raw = String(addressText || "").trim();
  if (!raw) return "";
  const parts = raw.split(",").map(p => p.trim()).filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : raw;
  const hasPostal = /\b\d{4,5}\b/.test(last);
  return hasPostal ? last : raw;
}

function getTitle(addressText, zipCity){
  const place = extractPostalCityFromAddress(addressText) || (zipCity && zipCity !== "-" ? zipCity : addressText || "Ort");
  return `Shooting ${place}`;
}

// Encoding-safe overrides (halten Mail-/Kalendertexte stabil)
function formatServices(services, withPrice){
  const items = [];
  if (services?.package?.label) {
    items.push(withPrice ? `${services.package.label} - ${services.package.price} CHF` : services.package.label);
  }
  (services?.addons || []).forEach((a) => {
    const label = a.label || a.id || "Service";
    items.push(withPrice ? `${label} - ${a.price} CHF` : label);
  });
  return items.length ? items.join("\n") : "-";
}

function translateObjectType(type){
  const map = {
    apartment: "Wohnung",
    single_house: "Einfamilienhaus",
    multi_house: "Mehrfamilienhaus",
    commercial: "Gewerbe",
    land: "Grundstueck",
    house: "Haus",
    other: "Anderes"
  };
  return map[type] || type || "-";
}

function buildObjectInfo(object, addressText){
  const parts = [
    `Adresse: ${addressText || "-"}`,
    `Objektart: ${translateObjectType(object?.type)}`,
    `Wohn-/Nutzflaeche: ${object?.area || "-"} m2`,
    `Etagen/Ebene: ${object?.floors || "-"}`,
    `Zimmer: ${object?.rooms || "-"}`,
    `Besonderheiten: ${object?.specials || "-"}`,
    `Beschreibung: ${object?.desc || "-"}`
  ];
  return parts.join("\n");
}

function getZipCityFromBilling(billing){
  const raw = String(billing?.zipcity || "").trim();
  return raw || "-";
}

function getTitle(addressText, zipCity){
  const place = extractPostalCityFromAddress(addressText) || (zipCity && zipCity !== "-" ? zipCity : addressText || "Ort");
  return `Shooting ${place}`;
}

const OBJECT_TYPE_DE_SAFE = {
  apartment: "Wohnung",
  single_house: "Einfamilienhaus",
  multi_house: "Mehrfamilienhaus",
  commercial: "Gewerbe",
  land: "Grundstueck",
  house: "Haus",
  other: "Anderes"
};

function translateObjectTypeSafe(type) {
  const normalizedType = repairTextEncoding(type);
  return OBJECT_TYPE_DE_SAFE[normalizedType] || normalizedType || "-";
}

function buildObjectInfoSafe(object, addressText) {
  const normalizedObject = normalizeTextDeep(object || {});
  const lines = [
    `Adresse: ${repairTextEncoding(addressText) || "-"}`,
    `Objektart: ${translateObjectTypeSafe(normalizedObject.type)}`,
    `Wohn-/Nutzflaeche: ${normalizedObject.area || "-"} m2`,
    `Etagen/Ebene: ${normalizedObject.floors || "-"}`,
    `Zimmer: ${repairTextEncoding(normalizedObject.rooms) || "-"}`,
    `Besonderheiten: ${repairTextEncoding(normalizedObject.specials) || "-"}`,
    `Beschreibung: ${repairTextEncoding(normalizedObject.desc) || "-"}`
  ];
  return lines.join("\n");
}

function getZipCityFromBillingSafe(billing) {
  return repairTextEncoding(String(billing?.zipcity || "").trim());
}

function getTitleSafe(addressText, zipCity) {
  const safeAddress = repairTextEncoding(addressText);
  const safeZipCity = repairTextEncoding(zipCity);
  const place = extractPostalCityFromAddress(safeAddress) || safeZipCity || safeAddress || "Ort";
  return `Shooting ${place}`;
}

function ensureSmtpConfigured(){
  return !!(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && MAIL_FROM);
}

function buildMapLink(addressText){
  const q = encodeURIComponent(addressText || "");
  return q ? `https://www.google.com/maps/search/?api=1&query=${q}` : "";
}

async function createPhotographerEvent({
  orderNo,
  photographerEmail,
  photographerName,
  subject,
  date,
  time,
  durationMin,
  title,
  addressText,
  description
}){
  if (!graphClient) throw new Error("MS Graph not configured – cannot create calendar event");
  const end = addMinutesLocal(date, time, durationMin);
  const mapLink = buildMapLink(addressText);
  const bodyHtml = description;
  const event = {
    subject: subject || `${title} (#${orderNo})`,
    body: {
      contentType: "HTML",
      content: bodyHtml.replace(/\n/g, "<br/>")
    },
    start: { dateTime: `${date}T${time}:00`, timeZone: TIMEZONE },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone: TIMEZONE },
    location: { displayName: addressText || "-", locationUri: mapLink || undefined },
    responseRequested: false
  };

  return graphClient.api(`/users/${photographerEmail}/events`).post(event);
}

async function createOfficeEvent({
  subject,
  date,
  time,
  durationMin,
  addressText,
  description
}){
  if (!graphClient) throw new Error("MS Graph not configured – cannot create calendar event");
  const end = addMinutesLocal(date, time, durationMin);
  const mapLink = buildMapLink(addressText);
  const event = {
    subject,
    body: {
      contentType: "HTML",
      content: description.replace(/\n/g, "<br/>")
    },
    start: { dateTime: `${date}T${time}:00`, timeZone: TIMEZONE },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone: TIMEZONE },
    location: { displayName: addressText || "-", locationUri: mapLink || undefined },
    responseRequested: false
  };

  return graphClient.api(`/users/${OFFICE_EMAIL}/events`).post(event);
}

function buildWorkSlots(start, end, step = 15){
  const slots = [];
  for (let min = start; min < end; min += step) {
    slots.push({ minutes: min, label: formatMinutes(min) });
  }
  return slots;
}

function toMinutesFromDateTime(dateTime){
  if (!dateTime || typeof dateTime !== "string") return null;

  const hasOffset = /[zZ]|[+-]\d\d:\d\d/.test(dateTime);
  if (hasOffset) {
    const dt = new Date(dateTime);
    if (Number.isNaN(dt.getTime())) return null;
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(dt);
    const hour = Number(parts.find(p => p.type === "hour")?.value);
    const minute = Number(parts.find(p => p.type === "minute")?.value);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  }

  const timePart = (dateTime.split("T")[1] || "").split(".")[0];
  const [h, m] = timePart.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/**
 * Outlook-Mailbox pro Mitarbeiter-Key: photographers.email (DB) hat Vorrang vor photographers.config.js.
 * Fuer Verfuegbarkeit, Graph-Kalender und konsistente Kontakt-E-Mails.
 */
async function resolvePhotographerCalendarEmail(photographerKey) {
  const k = String(photographerKey || "").toLowerCase().trim();
  if (!k) return "";
  try {
    if (typeof db.getPhotographer === "function") {
      const row = await db.getPhotographer(k);
      const dbEmail = String(row?.email || "").trim();
      if (dbEmail) return dbEmail;
    }
  } catch (_) {
    /* DB offline */
  }
  return String(PHOTOGRAPHERS[k] || "").trim();
}

async function fetchCalendarEvents(email, date, photographer){
  if (!graphClient) return [];
  const startDateTime = `${date}T00:00:00`;
  const endDateTime = `${date}T23:59:59`;

  const select = "start,end,showAs,location";
  let requestUrl = `/users/${email}/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$select=${select}`;
  const events = [];

  const emailDomain = String(email || "").split("@")[1] || "unknown";
  let userId = null;
  try {
    const userInfo = await graphClient
      .api(`/users/${email}`)
      .select("id,userType,accountEnabled,onPremisesSyncEnabled")
      .get();
    userId = userInfo?.id || null;
  } catch (err) {
    const innerError = err?.body?.error?.innerError || {};
  }
  try {
    await graphClient
      .api(`/users/${email}/mailboxSettings`)
      .select("timeZone")
      .get();
  } catch (err) {
    const innerError = err?.body?.error?.innerError || {};
  }
  try {
    await graphClient
      .api(`/users/${email}/calendar`)
      .select("id")
      .get();
  } catch (err) {
    const innerError = err?.body?.error?.innerError || {};
  }
  if (userId) {
    try {
      await graphClient
        .api(`/users/${userId}/calendar`)
        .select("id")
        .get();
    } catch (err) {
      const innerError = err?.body?.error?.innerError || {};
    }
  }

  while (requestUrl) {
    const response = await graphClient
      .api(requestUrl)
      .header("Prefer", `outlook.timezone="${TIMEZONE}"`)
      .get();

    if (Array.isArray(response.value)) {
      events.push(...response.value);
    }

    requestUrl = response["@odata.nextLink"] || null;
  }

  return events;
}

function nextDateYMD(ymd) {
  const parts = String(ymd).slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return ymd;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function parseDateFlexible(rawDate) {
  const raw = String(rawDate || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const dd = String(match[1]).padStart(2, "0");
  const mm = String(match[2]).padStart(2, "0");
  const yyyy = String(match[3]);
  return `${yyyy}-${mm}-${dd}`;
}

function padHHMM(t) {
  const s = String(t || "08:00").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "08:00";
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/** Abwesenheiten (blocked_dates) wie Outlook-Events in die Slot-Berechnung einfuegen. */
async function appendBlockedDateBusyEvents(photographerKey, dateYMD, events) {
  const key = String(photographerKey || "").toLowerCase();
  const d = String(dateYMD || "").slice(0, 10);
  const base = Array.isArray(events) ? [...events] : [];
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return base;
  let ps = null;
  try {
    ps = await db.getPhotographerSettings(key);
  } catch (_) {
    return base;
  }
  const blocked = Array.isArray(ps?.blocked_dates) ? ps.blocked_dates : [];
  for (const entry of blocked) {
    if (!entry || typeof entry !== "object") continue;
    const von = String(entry.von || "").slice(0, 10);
    const bis = String(entry.bis || entry.von || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis)) continue;
    if (d < von || d > bis) continue;
    if (entry.ganztaegig !== false) {
      base.push({
        start: { dateTime: `${d}T00:00:00` },
        end: { dateTime: `${d}T23:59:59` },
        showAs: "busy",
      });
    } else {
      const vt = padHHMM(entry.von_time);
      const bt = padHHMM(entry.bis_time || "18:00");
      base.push({
        start: { dateTime: `${d}T${vt}:00` },
        end: { dateTime: `${d}T${bt}:00` },
        showAs: "busy",
      });
    }
  }
  return base;
}

/** Admin-Kalender: Abwesenheiten aus blocked_dates als Events. */
async function loadAbsenceCalendarEvents(colorMap, photographerKeyFilter) {
  const out = [];
  const pool = db.getPool?.();
  if (!pool) return out;
  let rows = [];
  try {
    const r = await pool.query(
      `SELECT ps.photographer_key, ps.blocked_dates,
        COALESCE(NULLIF(TRIM(p.initials), ''), UPPER(LEFT(ps.photographer_key, 2))) AS initials
       FROM photographer_settings ps
       LEFT JOIN photographers p ON p.key = ps.photographer_key
       WHERE ps.blocked_dates IS NOT NULL AND jsonb_typeof(ps.blocked_dates) = 'array'`
    );
    rows = r.rows || [];
  } catch (err) {
    console.warn("[calendar-events] absence load:", err?.message || err);
    return out;
  }
  const filterKey = photographerKeyFilter ? String(photographerKeyFilter).toLowerCase() : "";
  for (const row of rows) {
    const key = row.photographer_key;
    if (filterKey && String(key).toLowerCase() !== filterKey) continue;
    const arr = Array.isArray(row.blocked_dates) ? row.blocked_dates : [];
    const initials = String(row.initials || String(key).slice(0, 2)).toUpperCase();
    const col = colorMap[key] || "#64748b";
    for (const entry of arr) {
      if (!entry || typeof entry !== "object" || !entry.von) continue;
      const von = String(entry.von).slice(0, 10);
      const bis = String(entry.bis || entry.von).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis)) continue;
      const grund = String(entry.grund || "Abwesend").trim() || "Abwesend";
      const sid =
        entry.id != null ? String(entry.id) : `${key}-${von}-${grund}`.replace(/\s/g, "_");
      if (entry.ganztaegig !== false) {
        const bisNext = nextDateYMD(bis);
        out.push({
          id: `absence-${key}-${sid}`,
          title: `${initials} Abwesenheit: ${grund}`,
          start: `${von}T00:00:00`,
          end: `${bisNext}T00:00:00`,
          allDay: true,
          status: "absence",
          type: "absence",
          orderNo: null,
          photographerKey: key,
          photographerName: key,
          photographerColor: col,
          color: "#475569",
        });
      } else if (von === bis) {
        const vt = padHHMM(entry.von_time);
        const bt = padHHMM(entry.bis_time || "18:00");
        out.push({
          id: `absence-${key}-${sid}`,
          title: `${initials} Abwesenheit: ${grund}`,
          start: `${von}T${vt}:00`,
          end: `${von}T${bt}:00`,
          allDay: false,
          status: "absence",
          type: "absence",
          orderNo: null,
          photographerKey: key,
          photographerName: key,
          photographerColor: col,
          color: "#475569",
        });
      } else {
        let d = von;
        while (d <= bis) {
          const vt = padHHMM(entry.von_time);
          const bt = padHHMM(entry.bis_time || "18:00");
          const s = new Date(`${d}T${vt}:00`);
          const e = new Date(`${d}T${bt}:00`);
          out.push({
            id: `absence-${key}-${sid}-${d}`,
            title: `${initials} Abwesenheit: ${grund}`,
            start: s.toISOString(),
            end: e.toISOString(),
            allDay: false,
            status: "absence",
            type: "absence",
            orderNo: null,
            photographerKey: key,
            photographerName: key,
            photographerColor: col,
            color: "#475569",
          });
          d = nextDateYMD(d);
        }
      }
    }
  }
  return out;
}

function normalizeWorkdays(input) {
  const weekdayOrder = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const normalized = Array.isArray(input) ? input : [];
  const out = [];
  for (const item of normalized) {
    const key = String(item || "").trim().toLowerCase();
    if (weekdayOrder.includes(key) && !out.includes(key)) out.push(key);
  }
  return out.length ? out : ["mon", "tue", "wed", "thu", "fri"];
}

function normalizeHolidayDates(input) {
  const arr = Array.isArray(input) ? input : [];
  const out = [];
  for (const raw of arr) {
    const date = String(raw || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (!out.includes(date)) out.push(date);
  }
  return out;
}

function normalizeWorkHoursByDay(input, defaults = {}) {
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const source = input && typeof input === "object" ? input : {};
  const fallbackStart = String(defaults.workStart || "08:00");
  const fallbackEnd = String(defaults.workEnd || "18:00");
  const fallbackWorkdays = normalizeWorkdays(defaults.workdays || ["mon", "tue", "wed", "thu", "fri"]);

  const fallbackStartMin = parseTimeToMinutes(fallbackStart);
  const fallbackEndMin = parseTimeToMinutes(fallbackEnd);
  const safeFallbackStart = fallbackStartMin != null ? fallbackStart : "08:00";
  const safeFallbackEnd =
    fallbackEndMin != null && fallbackStartMin != null && fallbackEndMin > fallbackStartMin ? fallbackEnd : "18:00";

  const out = {};
  for (const dayKey of dayKeys) {
    const row = source && typeof source === "object" ? source[dayKey] : null;
    const enabledFallback = fallbackWorkdays.includes(dayKey);
    const enabled = typeof row?.enabled === "boolean" ? row.enabled : enabledFallback;

    const startRaw = String(row?.start || safeFallbackStart);
    const endRaw = String(row?.end || safeFallbackEnd);
    const startMin = parseTimeToMinutes(startRaw);
    const endMin = parseTimeToMinutes(endRaw);
    const hasValidRange = startMin != null && endMin != null && endMin > startMin;

    out[dayKey] = {
      enabled,
      start: hasValidRange ? startRaw : safeFallbackStart,
      end: hasValidRange ? endRaw : safeFallbackEnd,
    };
  }
  return out;
}

function getWeekdayKeyFromDate(dateStr) {
  const weekdayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dt = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return "mon";
  return weekdayKeys[dt.getDay()] || "mon";
}

function resolveScheduleForDate(dateStr, schedulingSettings = {}) {
  const dayKey = getWeekdayKeyFromDate(dateStr);
  const customHolidays = Array.isArray(schedulingSettings.holidays) ? schedulingSettings.holidays : [];
  const nationalOn = schedulingSettings.nationalHolidaysEnabled !== false;
  if (customHolidays.includes(dateStr) || (nationalOn && isHoliday(dateStr))) {
    return { dayKey, isHoliday: true, enabled: false, workStart: null, workEnd: null };
  }
  const byDay = schedulingSettings.workHoursByDay || {};
  const row = byDay[dayKey] || null;
  if (!row || !row.enabled) {
    return { dayKey, isHoliday: false, enabled: false, workStart: null, workEnd: null };
  }
  return {
    dayKey,
    isHoliday: false,
    enabled: true,
    workStart: String(row.start || schedulingSettings.workStart || "08:00"),
    workEnd: String(row.end || schedulingSettings.workEnd || "18:00"),
  };
}

async function getSchedulingSettings(employeeKey = "") {
  const context = employeeKey ? { employeeKey } : {};
  const [
    workStartResolved,
    workEndResolved,
    slotMinutesResolved,
    bufferMinutesResolved,
    lookaheadDaysResolved,
    minAdvanceHoursResolved,
    workdaysResolved,
    busyShowAsResolved,
    holidaysResolved,
    workHoursByDayResolved,
    nationalHolidaysEnabledResolved,
  ] = await Promise.all([
    getSetting("scheduling.workStart", context),
    getSetting("scheduling.workEnd", context),
    getSetting("scheduling.slotMinutes", context),
    getSetting("scheduling.bufferMinutes", context),
    getSetting("scheduling.lookaheadDays", context),
    getSetting("scheduling.minAdvanceHours", context),
    getSetting("scheduling.workdays", context),
    getSetting("scheduling.busyShowAs", context),
    getSetting("scheduling.holidays", context),
    getSetting("scheduling.workHoursByDay", context),
    getSetting("scheduling.nationalHolidaysEnabled", context),
  ]);

  const workStart = String(workStartResolved.value || WORK_START);
  const workEnd = String(workEndResolved.value || WORK_END);
  const slotMinutes = Math.max(5, Number(slotMinutesResolved.value || 15));
  const bufferMinutes = Math.max(0, Number(bufferMinutesResolved.value || 30));
  const lookaheadDays = Math.max(0, Number(lookaheadDaysResolved.value || 14));
  const minAdvanceHours = Math.max(0, Number(minAdvanceHoursResolved.value || 24));
  const workdays = normalizeWorkdays(workdaysResolved.value);
  const holidays = normalizeHolidayDates(holidaysResolved.value);
  const workHoursByDay = normalizeWorkHoursByDay(workHoursByDayResolved.value, {
    workStart,
    workEnd,
    workdays,
  });
  const busyShowAsRaw = Array.isArray(busyShowAsResolved.value)
    ? busyShowAsResolved.value
    : ["busy", "oof", "tentative"];
  const busyShowAs = busyShowAsRaw.map((x) => String(x || "").toLowerCase()).filter(Boolean);
  const nationalHolidaysEnabled = nationalHolidaysEnabledResolved.value !== false;

  return {
    workStart,
    workEnd,
    slotMinutes,
    bufferMinutes,
    lookaheadDays,
    minAdvanceHours,
    workdays,
    holidays,
    workHoursByDay,
    nationalHolidaysEnabled,
    busyShowAs: busyShowAs.length ? busyShowAs : ["busy", "oof", "tentative"],
  };
}

async function setSystemSettings(settingsMap) {
  const payload = settingsMap && typeof settingsMap === "object" ? settingsMap : {};
  const entries = Object.entries(payload).map(([key, value]) => ({ key, value }));
  await db.upsertAppSettings(entries);
}

function asPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeExxasEndpoint(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Ungueltiger EXXAS-Endpunkt");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("EXXAS-Endpunkt muss mit http:// oder https:// beginnen");
  }
  return parsed.toString();
}

function exxasTypeRefToString(typeRef) {
  const ref = asPlainObject(typeRef);
  const kind = String(ref.kind || "").trim();
  const name = String(ref.name || "").trim();
  if (kind === "NON_NULL") return `${exxasTypeRefToString(ref.ofType)}!`;
  if (kind === "LIST") return `[${exxasTypeRefToString(ref.ofType)}]`;
  return name || kind || "";
}

function normalizeExxasFieldEntry(input, fallbackCategory = "Allgemein") {
  const row = asPlainObject(input);
  const key = String(row.key || row.id || row.field || row.name || "").trim();
  if (!key) return null;
  const label = String(row.label || row.title || row.displayName || row.name || key).trim() || key;
  const category = String(row.category || row.group || row.section || fallbackCategory).trim() || fallbackCategory;
  const type = String(row.type || row.dataType || row.format || "").trim() || undefined;
  const description = String(row.description || row.help || row.summary || "").trim() || undefined;
  let required = undefined;
  if (typeof row.required === "boolean") required = row.required;
  return { key, label, category, type, required, description };
}

function pushNormalizedExxasField(target, seen, field) {
  if (!field || !field.key) return;
  const signature = `${field.category}::${field.key}`;
  if (seen.has(signature)) return;
  seen.add(signature);
  target.push(field);
}

function collectExxasFieldsFromPropertyMap(properties, fallbackCategory, target, seen) {
  const propertyMap = asPlainObject(properties);
  for (const [propertyKey, propertyValue] of Object.entries(propertyMap)) {
    const property = asPlainObject(propertyValue);
    const type = String(property.type || property.dataType || property.format || "").trim() || undefined;
    const description = String(property.description || property.help || "").trim() || undefined;
    const required = typeof property.required === "boolean" ? property.required : undefined;
    pushNormalizedExxasField(target, seen, {
      key: String(propertyKey || "").trim(),
      label: String(property.title || property.label || propertyKey).trim() || String(propertyKey || "").trim(),
      category: String(fallbackCategory || "Allgemein"),
      type,
      required,
      description,
    });
  }
}

function collectExxasFieldsFromGraphqlSchema(schemaRoot) {
  const schema = asPlainObject(schemaRoot);
  const types = Array.isArray(schema.types) ? schema.types : [];
  const fields = [];
  const seen = new Set();
  for (const typeRow of types) {
    const typeObj = asPlainObject(typeRow);
    const typeName = String(typeObj.name || "").trim();
    if (!typeName || typeName.startsWith("__")) continue;
    const category = typeName;
    const typeFields = Array.isArray(typeObj.fields) ? typeObj.fields : [];
    for (const fieldRow of typeFields) {
      const fieldObj = asPlainObject(fieldRow);
      const key = String(fieldObj.name || "").trim();
      if (!key) continue;
      pushNormalizedExxasField(fields, seen, {
        key,
        label: key,
        category,
        type: exxasTypeRefToString(fieldObj.type) || undefined,
        required: String(asPlainObject(fieldObj.type).kind || "").trim() === "NON_NULL",
        description: String(fieldObj.description || "").trim() || undefined,
      });
    }
    const inputFields = Array.isArray(typeObj.inputFields) ? typeObj.inputFields : [];
    for (const fieldRow of inputFields) {
      const fieldObj = asPlainObject(fieldRow);
      const key = String(fieldObj.name || "").trim();
      if (!key) continue;
      pushNormalizedExxasField(fields, seen, {
        key,
        label: key,
        category,
        type: exxasTypeRefToString(fieldObj.type) || undefined,
        required: String(asPlainObject(fieldObj.type).kind || "").trim() === "NON_NULL",
        description: String(fieldObj.description || "").trim() || undefined,
      });
    }
  }
  return fields;
}

function normalizeExxasFieldPayload(payload) {
  const root = asPlainObject(payload);
  const out = [];
  const seen = new Set();

  const graphqlSchema = root.__schema || asPlainObject(root.data).__schema;
  if (graphqlSchema) {
    for (const field of collectExxasFieldsFromGraphqlSchema(graphqlSchema)) {
      pushNormalizedExxasField(out, seen, field);
    }
  }

  const directCandidates = [
    payload,
    root.fields,
    root.data,
    asPlainObject(root.data).fields,
    root.result,
    asPlainObject(root.result).fields,
    root.schema,
    asPlainObject(root.schema).fields,
  ];
  for (const candidate of directCandidates) {
    if (Array.isArray(candidate)) {
      for (const row of candidate) {
        pushNormalizedExxasField(out, seen, normalizeExxasFieldEntry(row));
      }
    }
  }

  const categories = Array.isArray(root.categories) ? root.categories : [];
  for (const categoryRow of categories) {
    const categoryObj = asPlainObject(categoryRow);
    const categoryName = String(categoryObj.name || categoryObj.label || categoryObj.key || "Allgemein").trim() || "Allgemein";
    const categoryFields = Array.isArray(categoryObj.fields) ? categoryObj.fields : [];
    for (const row of categoryFields) {
      pushNormalizedExxasField(out, seen, normalizeExxasFieldEntry(row, categoryName));
    }
  }

  collectExxasFieldsFromPropertyMap(root.properties, "Allgemein", out, seen);

  const componentsSchemas = asPlainObject(asPlainObject(root.components).schemas);
  for (const [schemaName, schemaValue] of Object.entries(componentsSchemas)) {
    collectExxasFieldsFromPropertyMap(asPlainObject(schemaValue).properties, schemaName, out, seen);
  }

  const definitions = asPlainObject(root.definitions);
  for (const [schemaName, schemaValue] of Object.entries(definitions)) {
    collectExxasFieldsFromPropertyMap(asPlainObject(schemaValue).properties, schemaName, out, seen);
  }

  return out.sort((a, b) => {
    const cat = String(a.category || "").localeCompare(String(b.category || ""), "de");
    if (cat !== 0) return cat;
    return String(a.label || "").localeCompare(String(b.label || ""), "de");
  });
}

function buildExxasHeaders(apiKey, appPassword) {
  const token = String(apiKey || "").trim();
  const password = String(appPassword || "").trim();
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-App-Password": password,
    "X-API-Key": token,
    "x-api-key": token,
    "X-Exxas-App-Password": password,
  };
}

function buildExxasHeaderProfiles(apiKey, appPassword) {
  const token = String(apiKey || "").trim();
  const password = String(appPassword || "").trim();
  const basicToken = Buffer.from(`${token}:${password}`).toString("base64");

  return [
    {
      name: "bearer+x-app-password",
      headers: buildExxasHeaders(token, password),
    },
    {
      name: "x-api-key+x-app-password",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": token,
        "x-api-key": token,
        "X-App-Password": password,
        "x-app-password": password,
        "App-Password": password,
      },
    },
    {
      name: "basic-auth",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Basic ${basicToken}`,
      },
    },
    {
      name: "api-key-only",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-Key": token,
        "x-api-key": token,
      },
    },
  ];
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const item = String(value || "").trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function buildExxasRestCandidates(endpoint) {
  const raw = String(endpoint || "").trim();
  if (!raw) {
    return [
      "https://api.exxas.net/api/schema",
      "https://api.exxas.net/api/metadata/fields",
      "https://api.exxas.net/api/fields",
      "https://api.exxas.net/openapi.json",
      "https://api.exxas.net/swagger/v1/swagger.json",
    ];
  }

  const normalized = normalizeExxasEndpoint(raw);
  const parsed = new URL(normalized);
  const isRootPath = parsed.pathname === "/" || parsed.pathname === "";
  const guessedFromRoot = isRootPath
    ? [
        `${parsed.origin}/api/schema`,
        `${parsed.origin}/api/metadata/fields`,
        `${parsed.origin}/api/fields`,
        `${parsed.origin}/openapi.json`,
      ]
    : [];

  return uniqueStrings([normalized, ...guessedFromRoot]);
}

function buildExxasGraphqlCandidates(endpoint) {
  const raw = String(endpoint || "").trim();
  if (!raw) {
    return ["https://api.exxas.net/api/graphql", "https://api.exxas.net/graphql"];
  }
  const normalized = normalizeExxasEndpoint(raw);
  if (normalized.toLowerCase().includes("graphql")) return [normalized];
  const parsed = new URL(normalized);
  return uniqueStrings([`${parsed.origin}/api/graphql`, `${parsed.origin}/graphql`]);
}

async function fetchExxasJson(url, init) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const text = await response.text();
  if (!response.ok) {
    const snippet = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(`${response.status} ${response.statusText}${snippet ? `: ${snippet}` : ""}`);
  }
  if (!contentType.includes("json") && !(text.trim().startsWith("{") || text.trim().startsWith("["))) {
    throw new Error("Antwort ist kein JSON");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON-Antwort konnte nicht gelesen werden");
  }
}

async function loadExxasFieldCatalog(credentials) {
  const apiKey = String(credentials?.apiKey || "").trim();
  const appPassword = String(credentials?.appPassword || "").trim();
  const endpoint = normalizeExxasEndpoint(credentials?.endpoint);
  if (!apiKey || !appPassword) {
    throw new Error("Bitte API Key und App Password angeben");
  }

  const headerProfiles = buildExxasHeaderProfiles(apiKey, appPassword);
  const attempts = [];
  const restCandidates = buildExxasRestCandidates(endpoint);

  for (const url of restCandidates) {
    for (const profile of headerProfiles) {
      for (const method of ["GET", "POST"]) {
        try {
          const payload = await fetchExxasJson(url, {
            method,
            headers: profile.headers,
            ...(method === "POST" ? { body: "{}" } : {}),
          });
          const fields = normalizeExxasFieldPayload(payload);
          if (fields.length > 0) return { source: url, fields };
          attempts.push({ url, profile: profile.name, method, error: "Keine Felder gefunden" });
        } catch (err) {
          attempts.push({ url, profile: profile.name, method, error: err.message || "Abruf fehlgeschlagen" });
        }
      }
    }
  }

  const graphqlCandidates = buildExxasGraphqlCandidates(endpoint);
  const graphqlQuery = {
    query: `
      query ExxasIntrospection {
        __schema {
          types {
            name
            kind
            fields {
              name
              description
              type {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
            inputFields {
              name
              description
              type {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
        }
      }
    `,
  };

  for (const url of graphqlCandidates) {
    for (const profile of headerProfiles) {
      try {
        const payload = await fetchExxasJson(url, {
          method: "POST",
          headers: profile.headers,
          body: JSON.stringify(graphqlQuery),
        });
        const fields = normalizeExxasFieldPayload(payload);
        if (fields.length > 0) return { source: url, fields };
        attempts.push({ url, profile: profile.name, method: "POST", error: "GraphQL lieferte keine Felder" });
      } catch (err) {
        attempts.push({ url, profile: profile.name, method: "POST", error: err.message || "GraphQL-Abruf fehlgeschlagen" });
      }
    }
  }

  const detail = attempts
    .slice(0, 8)
    .map((attempt) => {
      const method = attempt.method ? `${attempt.method} ` : "";
      const profile = attempt.profile ? `[${attempt.profile}] ` : "";
      return `${method}${attempt.url} ${profile}- ${attempt.error}`;
    })
    .join(" | ");
  throw new Error(detail || "EXXAS Felder konnten nicht geladen werden. Bitte Endpoint und Header-Schema pruefen.");
}

function buildAvailability(events, durationMin, options = {}){
  const workStartValue = options.workStart || WORK_START;
  const workEndValue = options.workEnd || WORK_END;
  const slotStep = Number(options.slotMinutes || 15);
  const bufferMinutes = Number(options.bufferMinutes || 30);
  const busyShowAs = Array.isArray(options.busyShowAs)
    ? options.busyShowAs.map((x) => String(x).toLowerCase())
    : ["busy", "oof", "tentative"];
  const workStartMin = parseTimeToMinutes(workStartValue);
  const lastStartMin = parseTimeToMinutes(workEndValue);
  if (workStartMin == null || lastStartMin == null || lastStartMin <= workStartMin) {
    throw new Error("Invalid WORK_START / WORK_END");
  }

  const safeDuration = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 60;
  const availabilityEndMin = lastStartMin + safeDuration;
  const workSlots = buildWorkSlots(workStartMin, availabilityEndMin, slotStep);
  const busy = new Set();
  let skippedFree = 0;
  let skippedInvalid = 0;
  let appliedRanges = 0;
  const requiredSlots = Math.ceil(safeDuration / slotStep);

  for (const ev of events) {
    const showAs = String(ev.showAs || "").toLowerCase();
    if (showAs === "free") {
      skippedFree += 1;
      continue;
    }
    if (showAs && !busyShowAs.includes(showAs)) {
      skippedFree += 1;
      continue;
    }

    const startMin = toMinutesFromDateTime(ev.start?.dateTime);
    const endMin = toMinutesFromDateTime(ev.end?.dateTime);
    if (startMin == null || endMin == null) {
      skippedInvalid += 1;
      continue;
    }
    const bufferedStart = Math.max(workStartMin, startMin - bufferMinutes);
    const bufferedEnd = Math.min(availabilityEndMin, endMin + bufferMinutes);
    if (bufferedEnd <= bufferedStart) {
      skippedInvalid += 1;
      continue;
    }
    appliedRanges += 1;

    for (const slot of workSlots) {
      if (slot.minutes >= bufferedStart && slot.minutes < bufferedEnd) {
        busy.add(slot.label);
      }
    }
  }

  const free = workSlots
    .map(s => s.label)
    .filter(label => !busy.has(label));

  const freeMinutes = new Set(
    workSlots.filter(s => !busy.has(s.label)).map(s => s.minutes)
  );
  const availableStarts = [];
  for (const slot of workSlots) {
    if (slot.minutes > lastStartMin) continue;
    let ok = true;
    for (let i = 0; i < requiredSlots; i += 1) {
      const m = slot.minutes + i * slotStep;
      if (!freeMinutes.has(m)) {
        ok = false;
        break;
      }
    }
    if (ok) availableStarts.push(slot.label);
  }

  const firstStart = availableStarts[0] || null;
  const lastStart = availableStarts.length ? availableStarts[availableStarts.length - 1] : null;
  const has1800 = availableStarts.includes("18:00");

  return {
    free: availableStarts,
    busy: [...busy],
    debug: {
      workStart: workStartValue,
      workEnd: workEndValue,
      slotMinutes: slotStep,
      bufferMinutes,
      skippedFree,
      skippedInvalid,
      appliedRanges,
    },
  };
}

async function filterAvailabilityByTravel({ freeSlots, events, durationMin, date, photographerKey, bookingCoord, bufferMinutes }) {
  if (!Number.isFinite(bookingCoord?.lat) || !Number.isFinite(bookingCoord?.lon) || !Array.isArray(freeSlots) || !freeSlots.length) {
    return { free: Array.isArray(freeSlots) ? freeSlots : [], travelApplied: false, travelFilteredCount: 0 };
  }

  let photographerSettings = null;
  try {
    photographerSettings = await db.getPhotographerSettings(photographerKey);
  } catch (_) {
    photographerSettings = null;
  }

  const weekdayKey = getWeekdayKeyFromDate(date);
  const departTimes = photographerSettings?.depart_times || {};
  const departTimeStr = departTimes[weekdayKey] || "07:00";
  const departMin = parseTimeToMinutes(departTimeStr) ?? 420;

  let homeCoord = null;
  if (photographerSettings?.home_lat && photographerSettings?.home_lon) {
    homeCoord = { lat: Number(photographerSettings.home_lat), lon: Number(photographerSettings.home_lon) };
  } else if (photographerSettings?.home_address) {
    homeCoord = await travel.geocodeSwiss(photographerSettings.home_address);
  }
  if (!homeCoord) {
    homeCoord = await travel.geocodeSwiss("8038 Zuerich");
  }

  const safeDuration = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 60;
  const safeBufferMinutes = Math.max(0, Number(bufferMinutes || 30));
  const locToText = (loc) => {
    if (!loc) return "";
    const parts = [];
    if (loc.displayName) parts.push(String(loc.displayName));
    const address = loc.address || null;
    if (address) {
      const addressParts = [address.street, address.postalCode, address.city, address.countryOrRegion]
        .filter(Boolean)
        .map(String);
      if (addressParts.length) parts.push(addressParts.join(" "));
    }
    return parts.join(", ").trim();
  };

  const busyEvents = (Array.isArray(events) ? events : [])
    .filter((ev) => !(ev.showAs && String(ev.showAs).toLowerCase() === "free"))
    .map((ev) => {
      const startMin = toMinutesFromDateTime(ev.start?.dateTime);
      const endMin = toMinutesFromDateTime(ev.end?.dateTime);
      return {
        startMin,
        endMin,
        locationText: locToText(ev.location),
      };
    })
    .filter((entry) => Number.isFinite(entry.startMin) && Number.isFinite(entry.endMin) && entry.endMin > entry.startMin)
    .sort((a, b) => a.startMin - b.startMin);

  const findPrev = (startMin) => {
    let prev = null;
    for (const entry of busyEvents) {
      if (entry.endMin <= startMin) {
        if (!prev || entry.endMin > prev.endMin) prev = entry;
      }
    }
    return prev;
  };

  const findNext = (endMin) => {
    let next = null;
    for (const entry of busyEvents) {
      if (entry.startMin >= endMin) {
        if (!next || entry.startMin < next.startMin) next = entry;
      }
    }
    return next;
  };

  let travelFilteredCount = 0;
  const filtered = [];
  for (const label of freeSlots) {
    const startMin = parseTimeToMinutes(label);
    if (!Number.isFinite(startMin)) {
      filtered.push(label);
      continue;
    }

    const endMin = startMin + safeDuration;
    const prev = findPrev(startMin);
    const next = findNext(endMin);

    let prevEndMin;
    let prevCoord;
    let previousBuffer;
    if (prev) {
      prevEndMin = prev.endMin;
      previousBuffer = safeBufferMinutes;
      prevCoord = prev.locationText ? await travel.geocodeSwiss(prev.locationText) : null;
    } else {
      prevEndMin = departMin;
      previousBuffer = 0;
      prevCoord = homeCoord;
    }

    if (prevCoord) {
      const minutes = await travel.routeMinutes(prevCoord, bookingCoord);
      if (minutes != null && startMin < prevEndMin + minutes + previousBuffer) {
        travelFilteredCount += 1;
        continue;
      }
    }

    if (next && next.locationText) {
      const nextCoord = await travel.geocodeSwiss(next.locationText);
      if (nextCoord) {
        const minutes = await travel.routeMinutes(bookingCoord, nextCoord);
        if (minutes != null && next.startMin < endMin + minutes + safeBufferMinutes) {
          travelFilteredCount += 1;
          continue;
        }
      }
    }

    filtered.push(label);
  }

  return { free: filtered, travelApplied: true, travelFilteredCount };
}

function isObjectRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeFrontendLogLevel(level) {
  const normalized = String(level || "info").toLowerCase();
  if (normalized === "trace") return "debug";
  if (normalized === "debug" || normalized === "info" || normalized === "warn" || normalized === "error" || normalized === "fatal") {
    return normalized === "fatal" ? "error" : normalized;
  }
  return "info";
}

function allowFrontendLog(ipAddress) {
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  const key = String(ipAddress || "unknown");
  const current = frontendLogRateBuckets.get(key) || [];
  const withinWindow = current.filter((ts) => ts >= windowStart);
  if (withinWindow.length >= FRONTEND_LOG_RATE_LIMIT_PER_MIN) {
    frontendLogRateBuckets.set(key, withinWindow);
    return false;
  }
  withinWindow.push(now);
  frontendLogRateBuckets.set(key, withinWindow);
  return true;
}

const app = express();
const COMPANY_MEMBER_ROLES = new Set(["company_owner", "company_admin", "company_employee"]);
const SUPER_ADMIN_ROLES = new Set(["super_admin", "admin", "employee"]);
app.set("trust proxy", 1);
app.use(
  pinoHttp(logger.httpLoggerOptions)
);
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
const sessionCookieDomain = String(process.env.SESSION_COOKIE_DOMAIN || "").trim();
app.use(session({
  secret: process.env.SESSION_SECRET || "buchungstool_sso_session_secret",
  proxy: true,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: String(process.env.SESSION_COOKIE_SECURE || "false").toLowerCase() === "true",
    sameSite: "lax",
    ...(sessionCookieDomain ? { domain: sessionCookieDomain } : {})
  }
}));
// Admin-Session per Bearer-Token / admin_session-Cookie (admin_sessions)
app.use(async (req, _res, next) => {
  try {
    const token = getRequestToken(req);
    if (!token || !db.getAdminSessionByTokenHash) return next();
    const row = await db.getAdminSessionByTokenHash(customerAuth.hashSha256Hex(token));
    if (!row) return next();
    req.user = {
      id: row.user_key != null ? String(row.user_key) : "local",
      email: row.user_name || "",
      name: row.user_name || "",
      role: String(row.role || "admin"),
    };
  } catch (err) {
    console.warn("[auth] admin token attach failed", err?.message);
  }
  next();
});
app.use((err, req, res, next) => {
  if (err) {
    console.error("[booking] json parse error", err.message || err);
    return res.status(400).json({ error: "Invalid JSON", message: String(err.message || err) });
  }
  next();
});

// ─── Logto OIDC Login (Browser-Flow → admin_session Token Bridge) ────────────
(function registerLogtoRoutes() {
  const LOGTO_APP_ID          = process.env.PROPUS_BOOKING_LOGTO_APP_ID || '';
  const LOGTO_APP_SECRET      = process.env.PROPUS_BOOKING_LOGTO_APP_SECRET || '';
  const LOGTO_PUBLIC_ENDPOINT = process.env.LOGTO_ENDPOINT || 'http://localhost:3301';
  const LOGTO_INTERNAL_ENDPOINT = process.env.LOGTO_INTERNAL_ENDPOINT || LOGTO_PUBLIC_ENDPOINT;
  if (!LOGTO_APP_ID || !LOGTO_APP_SECRET) return;

  const crypto = require('crypto');
  const logtoClient = require('./logto-client');
  let oidcConfigCache = null;

  async function getOidcConfig() {
    if (oidcConfigCache) return oidcConfigCache;
    const r = await fetch(`${LOGTO_INTERNAL_ENDPOINT}/oidc/.well-known/openid-configuration`);
    oidcConfigCache = await r.json();
    return oidcConfigCache;
  }

  // GET /auth/logto/login → startet OIDC-Flow
  app.get('/auth/logto/login', async (req, res) => {
    try {
      const config = await getOidcConfig();
      const state        = crypto.randomBytes(16).toString('hex');
      const verifier     = crypto.randomBytes(32).toString('base64url');
      const challenge    = crypto.createHash('sha256').update(verifier).digest('base64url');
      req.session.logtoState    = state;
      req.session.logtoVerifier = verifier;
      req.session.logtoReturnTo = req.query.returnTo || '/';
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const params = new URLSearchParams({
        client_id: LOGTO_APP_ID,
        redirect_uri: `${baseUrl}/auth/logto/callback`,
        response_type: 'code',
        scope: 'openid profile email urn:logto:scope:roles',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      await req.session.save(() => res.redirect(`${LOGTO_PUBLIC_ENDPOINT}/oidc/auth?${params}`));
    } catch (err) {
      console.error('[logto] login init error:', err.message);
      res.status(503).send('Auth service unavailable');
    }
  });

  // GET /auth/logto/callback → tauscht Code gegen Token, erstellt admin_session
  app.get('/auth/logto/callback', async (req, res) => {
    try {
      const { code, state } = req.query;
      if (!code || state !== req.session.logtoState) {
        return res.status(400).send('Invalid callback (state mismatch)');
      }
      const config  = await getOidcConfig();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      // Code gegen Tokens tauschen
      const tokenRes = await fetch(config.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type:    'authorization_code',
          code,
          client_id:     LOGTO_APP_ID,
          client_secret: LOGTO_APP_SECRET,
          redirect_uri:  `${baseUrl}/auth/logto/callback`,
          code_verifier: req.session.logtoVerifier || '',
        }),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error('[logto] token exchange failed:', err);
        return res.status(500).send('Auth token exchange failed');
      }
      const tokens = await tokenRes.json();

      // User-Info laden
      const userRes = await fetch(config.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userInfo = userRes.ok ? await userRes.json() : {};
      const email    = String(userInfo.email || '').trim().toLowerCase();
      const name     = String(userInfo.name || userInfo.username || email || '');
      const logtoUserId = userInfo.sub || '';

      if (!email) return res.status(400).send('Kein E-Mail-Konto in Logto hinterlegt.');

      // Logto-Rollen bestimmen (aus userinfo oder via Management API)
      let logtoRoles = [];
      if (Array.isArray(userInfo.roles)) {
        logtoRoles = userInfo.roles;
      } else if (logtoClient.isConfigured() && logtoUserId) {
        try {
          logtoRoles = await logtoClient.getUserRoles(logtoUserId);
        } catch (e) {
          console.warn('[logto] Rollen konnten nicht geladen werden:', e.message);
        }
      }

      // Logto-Rollen auf interne Rolle mappen
      const ROLE_PRIORITY = ['super_admin', 'admin', 'photographer', 'customer'];
      let sessionRole = 'photographer';
      for (const rp of ROLE_PRIORITY) {
        if (logtoRoles.includes(rp)) { sessionRole = (rp === 'super_admin') ? 'admin' : rp; break; }
      }

      const pool = db.getPool ? db.getPool() : null;
      if (!pool) return res.status(503).send('DB nicht verfügbar');

      // admin_users Eintrag mit der tatsächlichen Rolle anlegen/aktualisieren
      const dbRole = logtoRoles.includes('super_admin') ? 'super_admin' :
                     logtoRoles.includes('admin') ? 'admin' : sessionRole;
      await pool.query(`
        INSERT INTO booking.admin_users (username, email, role, active, created_at, updated_at)
        VALUES ($1, $2, $3, TRUE, NOW(), NOW())
        ON CONFLICT (username) DO UPDATE
          SET email=EXCLUDED.email, role=$3, active=TRUE, updated_at=NOW()
      `, [email, email, dbRole]).catch(() => null);

      // RBAC sync (Logto → internes System)
      try {
        const rbac = require('./access-rbac');
        await rbac.syncAdminUserRolesFromDb(email);
      } catch (_) {}

      // admin_session Token ausgeben
      const sessionToken = crypto.randomBytes(32).toString('hex');
      let token = sessionToken;
      try {
        const issued = await issueAdminSession(res, {
          role: sessionRole,
          rememberMe: true,
          userKey: email,
          userName: name,
        });
        token = issued?.token || sessionToken;
      } catch (e) {
        const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
        await pool.query(`
          INSERT INTO booking.admin_sessions (token_hash, user_key, user_name, role, expires_at, created_at)
          VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days', NOW())
        `, [tokenHash, email, name, sessionRole]).catch(() => null);
        token = sessionToken;
      }

      // Logto-Tokens in Session merken (für Logout)
      req.session.logtoIdToken   = tokens.id_token;
      req.session.logtoLogout    = true;
      delete req.session.logtoState;
      delete req.session.logtoVerifier;
      const returnTo = req.session.logtoReturnTo || '/';
      delete req.session.logtoReturnTo;

      // SPA erhält Token über URL-Parameter, speichert ihn in localStorage
      await req.session.save(() =>
        res.redirect(`/login?logto_token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(returnTo)}`)
      );
    } catch (err) {
      console.error('[logto] callback error:', err.message);
      res.status(500).send('Login fehlgeschlagen: ' + err.message);
    }
  });

  // GET /auth/logto/logout → Logto End-Session
  app.get('/auth/logto/logout', async (req, res) => {
    const idToken  = req.session?.logtoIdToken;
    const wasLogto = req.session?.logtoLogout;
    req.session.destroy(() => {
      if (wasLogto && idToken) {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const params  = new URLSearchParams({
          id_token_hint:            idToken,
          post_logout_redirect_uri: `${baseUrl}/`,
        });
        return res.redirect(`${LOGTO_PUBLIC_ENDPOINT}/oidc/session/end?${params}`);
      }
      res.redirect('/');
    });
  });

  console.log('[booking] Logto OIDC auth enabled, app_id:', LOGTO_APP_ID.slice(0, 8) + '…');
})();

// Lokaler Admin-Login (admin_users + admin_sessions)
app.post("/api/admin/login", async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "Datenbank nicht konfiguriert" });
    const { username, password, rememberMe } = req.body || {};
    const user = await db.getAdminUserByUsername(String(username || ""));
    if (!user || !user.active) return res.status(401).json({ error: "Ungueltige Zugangsdaten" });
    if (!user.password_hash) return res.status(401).json({ error: "Ungueltige Zugangsdaten" });
    const ok = await customerAuth.verifyPassword(String(password || ""), user.password_hash);
    if (!ok) return res.status(401).json({ error: "Ungueltige Zugangsdaten" });
    const rawRole = String(user.role || "admin");
    let sessionRole = rawRole;
    if (SUPER_ADMIN_ROLES.has(rawRole)) sessionRole = "admin";
    const { token } = await issueAdminSession(res, {
      role: sessionRole,
      rememberMe: !!rememberMe,
      userKey: String(user.id),
      userName: String(user.email || user.username || ""),
    });
    let permissions = [];
    try {
      await rbac.seedRbacIfNeeded();
      await rbac.syncAdminUserRolesFromDb(user.id);
      const sid = await rbac.ensureAdminUserSubject(user.id);
      if (sid) {
        const set = await rbac.getEffectivePermissions(sid, { scopeType: "system", companyId: null, customerId: null });
        permissions = Array.from(set);
      }
      if (!permissions.length) {
        permissions = Array.from(rbac.legacyFallbackPermissions(rawRole));
      }
    } catch (_e) {
      permissions = Array.from(rbac.legacyFallbackPermissions(rawRole));
    }
    res.json({ ok: true, token, role: rawRole, permissions });
  } catch (err) {
    console.error("[admin-login]", err?.message || err);
    res.status(500).json({ error: err.message || "Login fehlgeschlagen" });
  }
});

const mailer = ensureSmtpConfigured()
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    })
  : null;
app.locals.mailer = mailer;

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    buildId: getBuildId(),
    hasPricingPreviewRoute: true,
    features: {
      productCatalog: true,
      adminProductsCrud: true,
      adminPricingPreview: true,
      adminSettings: true,
      discountCodes: true,
      assignmentDecisionTrace: true,
      ssoEnabled: !!(process.env.PROPUS_BOOKING_LOGTO_APP_ID && process.env.PROPUS_BOOKING_LOGTO_APP_SECRET),
      logtoEnabled: !!(process.env.PROPUS_BOOKING_LOGTO_APP_ID && process.env.PROPUS_BOOKING_LOGTO_APP_SECRET),
    },
    dbEnabled: !!process.env.DATABASE_URL,
    uptimeSec: Math.round(process.uptime()),
  });
});

app.post("/api/logs", (req, res) => {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  if (!allowFrontendLog(ip)) {
    return res.status(429).json({ error: "Too many log events" });
  }

  const payload = isObjectRecord(req.body) ? req.body : {};
  const level = sanitizeFrontendLogLevel(payload.level);
  const messageRaw = typeof payload.message === "string" ? payload.message : "";
  const message = messageRaw.trim().slice(0, 1500);
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  const context = isObjectRecord(payload.context) ? payload.context : {};
  const logMeta = {
    module: "frontend",
    source: "admin-panel",
    path: typeof payload.url === "string" ? payload.url.slice(0, 1000) : undefined,
    userAgent: typeof payload.userAgent === "string" ? payload.userAgent.slice(0, 400) : req.headers["user-agent"],
    requestId: req.id,
    context,
  };

  if (level === "error") {
    logger.error(logMeta, message);
  } else if (level === "warn") {
    logger.warn(logMeta, message);
  } else if (level === "debug") {
    logger.debug(logMeta, message);
  } else {
    logger.info(logMeta, message);
  }

  return res.status(202).json({ ok: true });
});

// ==============================
// Customer Auth + Self-Service
// ==============================
const CUSTOMER_SESSION_DAYS = parseInt(process.env.CUSTOMER_SESSION_DAYS || "30", 10);

function ensureDbForCustomer(res) {
  if (!process.env.DATABASE_URL) {
    res.status(503).json({ error: "Customer-Account ben\u00f6tigt DATABASE_URL (DB ist nicht aktiv)" });
    return false;
  }
  return true;
}

function isWeekendLocal(d) {
  const day = d.getDay(); // 0=So ... 6=Sa
  return day === 0 || day === 6;
}

function subtractNonWeekendHoursLocal(startDate, hours) {
  // Subtrahiert "working hours" r-ckw-rts: Stunden, die auf Sa/So fallen, z-hlen nicht.
  let d = new Date(startDate.getTime());
  let remaining = Math.max(0, Number(hours) || 0);
  while (remaining > 0) {
    d = new Date(d.getTime() - 60 * 60 * 1000);
    if (!isWeekendLocal(d)) remaining -= 1;
  }
  return d;
}

function getAppointmentStartLocalFromOrder(order) {
  const date = order?.schedule?.date;
  const time = order?.schedule?.time;
  if (!date || !time) return null;
  // Interpretiert als lokale Zeit (Server laeuft i.d.R. auf Europe/Zurich wie TIMEZONE).
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function assertCustomerChangeAllowedOrThrow(order) {
  const apptStart = getAppointmentStartLocalFromOrder(order);
  if (!apptStart) throw new Error("Termin-Zeit ist nicht verfuegbar");

  const cutoff = subtractNonWeekendHoursLocal(apptStart, 48);
  if (Date.now() >= cutoff.getTime()) {
    const err = new Error("Aenderung nicht mehr moeglich (weniger als 48h Arbeitszeit vorher)");
    err.statusCode = 403;
    throw err;
  }
}

async function requireCustomer(req, res, next) {
  try {
    if (!ensureDbForCustomer(res)) return;
    const auth = req.headers.authorization || "";
    let token = auth.replace(/^Bearer\s+/i, "").trim();
    
    // Cookie Fallback
    if(!token && req.headers.cookie) {
      const cookies = req.headers.cookie.split(";").map(c => c.trim());
      for(const c of cookies) {
        if(c.startsWith("customer_session=")) {
          token = c.substring("customer_session=".length);
          break;
        }
      }
    }
    if (!token) {
      token = String(req.query.token || "").trim();
    }
    
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const tokenHash = customerAuth.hashSha256Hex(token);
    const customer = await db.getCustomerBySessionTokenHash(tokenHash);
    if (!customer) return res.status(401).json({ error: "Unauthorized" });

    req.customer = customer;
    req.customerTokenHash = tokenHash;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message || "Auth error" });
  }
}

function getCookieValue(req, name) {
  const cookieName = String(name || "").trim();
  if (!cookieName || !req?.headers?.cookie) return "";
  const cookies = req.headers.cookie.split(";").map((entry) => entry.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${cookieName}=`)) {
      return cookie.substring(cookieName.length + 1);
    }
  }
  return "";
}

async function sendVerificationEmail(email, token) {
  const baseUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
  const link = `${baseUrl}/verify-email.html?token=${encodeURIComponent(token)}`;
  const subject = "Herzlich willkommen bei Propus! Bitte bestaetigen Sie Ihre E-Mail-Adresse";
  const html = `
    <p>Herzlich willkommen bei Propus!</p>
    <p>Schoen, dass Sie sich registriert haben. Um Ihr Konto zu aktivieren, bestaetigen Sie bitte Ihre E-Mail-Adresse mit einem Klick auf den folgenden Link:</p>
    <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#8b7a3d;color:#fff;text-decoration:none;border-radius:6px;">E-Mail-Adresse bestaetigen</a></p>
    <p style="color:#888;font-size:13px;">Oder kopieren Sie diesen Link in Ihren Browser:<br>${link}</p>
    <p>Der Link ist 24 Stunden gueltig.</p>
    <p>Falls Sie sich nicht registriert haben, koennen Sie diese E-Mail ignorieren.</p>
    <p>Freundliche Gruesse<br>Ihr Propus Team</p>
  `;
  const text = `Herzlich willkommen bei Propus!\n\nBitte bestaetigen Sie Ihre E-Mail-Adresse:\n${link}\n\nDer Link ist 24 Stunden gueltig.`;

  if (mailer) {
    await mailer.sendMail({ from: MAIL_FROM, to: email, subject, html: html, text });
  } else {
    try {
      const graphResult = await sendMailViaGraph(email, subject, html, text, null);
      assertMailSent(graphResult, "verification-email");
    } catch (err) {
      console.warn("[customer-register] could not send verification email:", err?.message);
    }
  }
}

function buildBookingCustomerProfile(billing = {}) {
  const firstName = String(billing?.first_name || "").trim();
  const lastName = String(billing?.name || "").trim();
  const company = String(billing?.company || "").trim();
  const street = String(billing?.street || "").trim();
  const zip = String(billing?.zip || "").trim();
  const city = String(billing?.city || "").trim();
  const zipcity = String(billing?.zipcity || "").trim() || [zip, city].filter(Boolean).join(" ");
  return {
    name: [firstName, lastName].filter(Boolean).join(" ") || company || "",
    company,
    phone: String(billing?.phone || billing?.phone_mobile || "").trim(),
    street,
    zipcity,
  };
}

async function createCustomerPortalMagicLink(billing = {}, { sessionDays = 14 } = {}) {
  const pool = db.getPool ? db.getPool() : null;
  if (!pool) return null;

  const email = customerAuth.normalizeEmail(billing?.email);
  if (!email) return null;

  let customer = await db.getCustomerByEmail(email);
  if (!customer) {
    const profile = buildBookingCustomerProfile(billing);
    await db.createCustomer({
      email,
      passwordHash: null,
      name: profile.name || email,
      company: profile.company,
      phone: profile.phone,
      street: profile.street,
      zipcity: profile.zipcity,
    });
    customer = await db.getCustomerByEmail(email);
  }

  if (!customer?.id || customer?.blocked) return null;

  const token = customerAuth.createSessionToken();
  const tokenHash = customerAuth.hashSha256Hex(token);
  const expiresAt = new Date(Date.now() + Math.max(1, Number(sessionDays) || 14) * 24 * 60 * 60 * 1000);
  await db.createCustomerSession({ customerId: Number(customer.id), tokenHash, expiresAt });

  const frontendUrl = String(process.env.FRONTEND_URL || "https://booking.propus.ch/").replace(/\/?$/, "/");
  return `${frontendUrl}?magic=${encodeURIComponent(token)}`;
}

// Einfaches In-Memory Rate-Limit fuer erneutes Senden (pro E-Mail)
const _resendVerifyThrottle = new Map(); // email -> lastSentMs

function resolveCustomerFrontendRedirect(rawRedirect) {
  const fallback = String(process.env.FRONTEND_URL || "https://booking.propus.ch/").trim() || "https://booking.propus.ch/";
  const raw = String(rawRedirect || "").trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw, fallback);
    if (!/^https?:$/i.test(url.protocol)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

// Legacy-Kompatibilitaet: alte Keycloak-Links auf das Frontend zurueckleiten
app.get("/auth/customer/login", (req, res) => {
  return res.redirect(resolveCustomerFrontendRedirect(req.query.redirect));
});
app.get("/auth/customer/register", (req, res) => {
  return res.redirect(resolveCustomerFrontendRedirect(req.query.redirect));
});
app.get("/auth/customer/logout", (req, res) => {
  return res.redirect(resolveCustomerFrontendRedirect(req.query.redirect));
});
app.get("/auth/customer/callback", (req, res) => {
  return res.redirect(resolveCustomerFrontendRedirect(req.query.redirect));
});

// Kunden-Logout
app.post("/api/customer/logout", requireCustomer, async (req, res) => {
  try {
    await db.deleteCustomerSessionByTokenHash(req.customerTokenHash);
    res.clearCookie("customer_session");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Logout fehlgeschlagen" });
  }
});

if (process.env.PROPUS_ENABLE_LEGACY_CUSTOMER_LOGIN !== "0") {
  app.post("/api/customer/login", async (req, res) => {
    try {
      if (!ensureDbForCustomer(res)) return;
      const { email, password } = req.body || {};
      const norm = customerAuth.normalizeEmail(email);
      if (!norm || !password) return res.status(400).json({ error: "E-Mail und Passwort erforderlich" });
      const customer = await db.getCustomerByEmail(norm);
      if (!customer || !customer.password_hash) return res.status(401).json({ error: "Ungueltige Zugangsdaten" });
      const ok = await customerAuth.verifyPassword(String(password), customer.password_hash);
      if (!ok) return res.status(401).json({ error: "Ungueltige Zugangsdaten" });
      const token = customerAuth.createSessionToken();
      const tokenHash = customerAuth.hashSha256Hex(token);
      const days = 30;
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      await db.createCustomerSession({ customerId: customer.id, tokenHash, expiresAt });
      res.cookie("customer_session", token, {
        httpOnly: true,
        secure: String(process.env.SESSION_COOKIE_SECURE || "false").toLowerCase() === "true",
        sameSite: "lax",
        maxAge: days * 24 * 60 * 60 * 1000,
      });
      res.json({ ok: true, token });
    } catch (err) {
      res.status(500).json({ error: err.message || "Login fehlgeschlagen" });
    }
  });

  app.post("/api/customer/register", async (req, res) => {
    try {
      if (!ensureDbForCustomer(res)) return;
      const { email, password, name } = req.body || {};
      const norm = customerAuth.normalizeEmail(email);
      if (!norm || !password) return res.status(400).json({ error: "E-Mail und Passwort erforderlich" });
      const existing = await db.getCustomerByEmail(norm);
      if (existing) return res.status(409).json({ error: "Diese E-Mail ist bereits registriert" });
      const passwordHash = await customerAuth.hashPassword(String(password));
      await db.createCustomer({
        email: norm,
        name: String(name || "").trim() || norm,
        passwordHash,
        phone: "",
        company: "",
        street: "",
        zipcity: "",
      });
      res.status(201).json({ ok: true });
    } catch (err) {
      const msg = err && err.message ? String(err.message) : "Registrierung fehlgeschlagen";
      res.status(400).json({ error: msg });
    }
  });
} else {
  app.post("/api/customer/login", (_req, res) => {
    res.status(410).json({ error: "Legacy-Kundenlogin deaktiviert – bitte SSO (Logto) nutzen." });
  });
  app.post("/api/customer/register", (_req, res) => {
    res.status(410).json({ error: "Legacy-Registrierung deaktiviert – bitte SSO (Logto) nutzen." });
  });
}

app.get("/api/customer/verify-email", (_req, res) => {
  res.status(501).json({ error: "E-Mail-Verifizierung nicht aktiviert." });
});
app.post("/api/customer/email-status", (_req, res) => {
  res.status(501).json({ error: "Nicht verfuegbar." });
});
app.post("/api/customer/resend-verification", (_req, res) => {
  res.status(501).json({ error: "Nicht verfuegbar." });
});
app.post("/api/customer/forgot-password", (_req, res) => {
  res.status(501).json({ error: "Passwort-Reset noch nicht angebunden." });
});
app.post("/api/customer/reset-password", (_req, res) => {
  res.status(501).json({ error: "Passwort-Reset noch nicht angebunden." });
});

app.get("/api/customer/me", requireCustomer, async (req, res) => {
  const c = req.customer;
  res.json({
    ok: true,
    customer: {
      salutation: c.salutation || "",
      first_name: c.first_name || "",
      email: c.email,
      name: c.name || "",
      company: c.company || "",
      phone: c.phone || "",
      phone_mobile: c.phone_mobile || "",
      onsite_name: c.onsite_name || "",
      onsite_phone: c.onsite_phone || "",
      street: c.street || "",
      zip: c.zip || "",
      city: c.city || "",
      zipcity: c.zipcity || "",
      emailVerified: c.email_verified !== false,
    },
  });
});

app.get("/api/customer/orders", requireCustomer, async (req, res) => {
  try {
    const email = req.customer.email;
    const orders = await db.getOrdersForCustomerEmail(email, { limit: 200, offset: 0 });
    res.json({ ok: true, orders });
  } catch (err) {
    res.status(500).json({ error: err.message || "Orders laden fehlgeschlagen" });
  }
});

// NOTE: Cutoff/Business-Day-Regel wird im n-chsten Schritt (todo) erzwungen.
app.post("/api/customer/orders/:orderNo/cancel", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => o.orderNo === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const email = (order.billing?.email || order.customerEmail || "").toLowerCase().trim();
    if (!email || email !== req.customer.email) return res.status(403).json({ error: "Forbidden" });

    if (["cancelled","archived"].includes(String(order.status || "").toLowerCase())) {
      return res.status(409).json({ error: "Buchung ist bereits abgeschlossen/archiviert" });
    }
    assertCustomerChangeAllowedOrThrow(order);

    // Kalender-Events loeschen (damit im Mitarbeiter-/Office-Kalender nichts stehen bleibt)
    let deletedPhotographerEvent = false;
    let deletedOfficeEvent = false;
    if (graphClient) {
      const _ccKey = String(order.photographer?.key || "").toLowerCase();
      const photographerEmail =
        order.photographer?.email || (await resolvePhotographerCalendarEmail(_ccKey));
      if (order.photographerEventId && photographerEmail) {
        try {
          await graphClient.api(`/users/${photographerEmail}/events/${order.photographerEventId}`).delete();
          deletedPhotographerEvent = true;
        } catch (err) {
          console.error("[customer-cancel] photographer event delete failed", err?.message || err);
        }
      }
      if (order.officeEventId && OFFICE_EMAIL) {
        try {
          await graphClient.api(`/users/${OFFICE_EMAIL}/events/${order.officeEventId}`).delete();
          deletedOfficeEvent = true;
        } catch (err) {
          console.error("[customer-cancel] office event delete failed", err?.message || err);
        }
      }
    }

    const updateFields = { status: "cancelled" };
    if (deletedPhotographerEvent) updateFields.photographer_event_id = null;
    if (deletedOfficeEvent) updateFields.office_event_id = null;
    await db.updateOrderFields(orderNo, updateFields);
    res.json({ ok: true, orderNo });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Cancel fehlgeschlagen" });
  }
});

// Prueft ob ein Wunschtermin verfuegbar ist und gibt ggf. 3 Alternativvorschlaege zurueck
app.post("/api/customer/orders/:orderNo/reschedule-check", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const { date, time } = req.body || {};
    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => o.orderNo === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const email = (order.billing?.email || order.customerEmail || "").toLowerCase().trim();
    if (!email || email !== req.customer.email) return res.status(403).json({ error: "Forbidden" });

    if (["cancelled","archived"].includes(String(order.status || "").toLowerCase())) {
      return res.status(409).json({ error: "Buchung ist storniert oder archiviert" });
    }
    assertCustomerChangeAllowedOrThrow(order);

    const newDate = String(date || "");
    const newTime = String(time || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
      return res.status(400).json({ error: "Invalid date/time" });
    }

    const area = parseAreaToNumber(order.object?.area);
    const durationMin = await getShootDurationMinutes(area, order.services || {});
    const assignedKey = String(order.photographer?.key || "").toLowerCase();
    const assignedEmail = await resolvePhotographerCalendarEmail(assignedKey);

    // Verfuegbarkeit des zugewiesenen Fotografen pruefen
    let assignedFree = [];
    if (assignedEmail) {
      try {
        let events = await fetchCalendarEvents(assignedEmail, newDate, assignedKey);
        events = await appendBlockedDateBusyEvents(assignedKey, newDate, events);
        const schedulingSettings = await getSchedulingSettings(assignedKey);
        const daySchedule = resolveScheduleForDate(newDate, schedulingSettings);
        if (!daySchedule.isHoliday && daySchedule.enabled) {
          const avail = buildAvailability(events, durationMin, {
            ...schedulingSettings,
            workStart: daySchedule.workStart,
            workEnd: daySchedule.workEnd,
          });
          assignedFree = avail.free || [];
        }
      } catch (err) {
        console.error("[reschedule-check] calendar fetch error:", err?.message);
      }
    }

    if (assignedFree.includes(newTime)) {
      return res.json({ ok: true, available: true });
    }

    const schedulingBase = await getSchedulingSettings(assignedKey);
    const lookaheadDays = Number(schedulingBase.lookaheadDays || 14);

    // Nicht verfuegbar - 3 Alternativvorschlaege suchen (max. lookaheadDays voraus)
    const suggestions = [];
    const baseDate = new Date(`${newDate}T00:00:00`);

    for (let dayOffset = 0; dayOffset <= lookaheadDays && suggestions.length < 3; dayOffset++) {
      const candidateDate = new Date(baseDate.getTime() + dayOffset * 86400000);
      const yyyy = candidateDate.getFullYear();
      const mm = String(candidateDate.getMonth() + 1).padStart(2, "0");
      const dd = String(candidateDate.getDate()).padStart(2, "0");
      const candidateDateStr = `${yyyy}-${mm}-${dd}`;
      const baseDaySchedule = resolveScheduleForDate(candidateDateStr, schedulingBase);
      if (baseDaySchedule.isHoliday || !baseDaySchedule.enabled) continue;

      // Gleicher Fotograf pruefen
      if (assignedEmail) {
        try {
          let evA = await fetchCalendarEvents(assignedEmail, candidateDateStr, assignedKey);
          evA = await appendBlockedDateBusyEvents(assignedKey, candidateDateStr, evA);
          const schedulingSettings = await getSchedulingSettings(assignedKey);
          const daySchedule = resolveScheduleForDate(candidateDateStr, schedulingSettings);
          if (daySchedule.isHoliday || !daySchedule.enabled) {
            continue;
          }
          const avail = buildAvailability(evA, durationMin, {
            ...schedulingSettings,
            workStart: daySchedule.workStart,
            workEnd: daySchedule.workEnd,
          });
          for (const slot of (avail.free || [])) {
            if (dayOffset === 0 && slot === newTime) continue; // bereits gepr-ft
            suggestions.push({
              date: candidateDateStr,
              time: slot,
              photographer: { key: assignedKey, name: order.photographer?.name || assignedKey }
            });
            if (suggestions.length >= 3) break;
          }
        } catch (err) {
          console.error("[reschedule-check] same-photographer slot search error:", err?.message);
        }
      }

      if (suggestions.length >= 3) break;

      // Falls nicht genug Slots vom gleichen Fotografen: resolveAnyPhotographer fuer Kandidaten-Slots
      if (suggestions.length < 3) {
        const workStartMin = parseTimeToMinutes(baseDaySchedule.workStart || schedulingBase.workStart || WORK_START) ?? 480;
        const workEndMin = parseTimeToMinutes(baseDaySchedule.workEnd || schedulingBase.workEnd || WORK_END) ?? 1080;
        const slotStep = Number(schedulingBase.slotMinutes || 15);
        const candidateSlots = buildWorkSlots(workStartMin, workEndMin + durationMin, slotStep);

        const availabilityMap = {};
        for (const p of PHOTOGRAPHERS_CONFIG) {
          try {
            const pEmail = await resolvePhotographerCalendarEmail(p.key);
            if (!pEmail) continue;
            let evP = await fetchCalendarEvents(pEmail, candidateDateStr, p.key);
            evP = await appendBlockedDateBusyEvents(p.key, candidateDateStr, evP);
            const schedulingSettings = await getSchedulingSettings(p.key);
            const daySchedule = resolveScheduleForDate(candidateDateStr, schedulingSettings);
            if (daySchedule.isHoliday || !daySchedule.enabled) {
              availabilityMap[p.key] = [];
              continue;
            }
            const avail = buildAvailability(evP, durationMin, {
              ...schedulingSettings,
              workStart: daySchedule.workStart,
              workEnd: daySchedule.workEnd,
            });
            availabilityMap[p.key] = avail.free || [];
          } catch (err) {
            availabilityMap[p.key] = [];
          }
        }

        const bookingCoords = order.address?.coords
          ? { lat: Number(order.address.coords.lat), lon: Number(order.address.coords.lng ?? order.address.coords.lon) }
          : null;

        for (const slot of candidateSlots) {
          if (suggestions.length >= 3) break;
          const slotTime = slot.label;
          try {
            const resolved = await resolveAnyPhotographer({
              photographersConfig: PHOTOGRAPHERS_CONFIG,
              availabilityMap,
              date: candidateDateStr,
              time: slotTime,
              services: order.services || {},
              sqm: area,
              bookingCoords: bookingCoords && Number.isFinite(bookingCoords.lat) ? bookingCoords : null,
            });
            if (resolved) {
              // Kein Duplikat hinzuf-gen
              const isDup = suggestions.some(s => s.date === candidateDateStr && s.time === slotTime);
              if (!isDup) {
                suggestions.push({
                  date: candidateDateStr,
                  time: slotTime,
                  photographer: { key: resolved.key, name: resolved.name }
                });
              }
            }
          } catch (err) {
            // Slot -berspringen
          }
        }
      }
    }

    res.json({ ok: true, available: false, suggestions: suggestions.slice(0, 3) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Reschedule-Check fehlgeschlagen" });
  }
});

app.patch("/api/customer/orders/:orderNo/reschedule", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const { date, time, photographerKey, photographerName } = req.body || {};
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const email = (order.billing?.email || order.customerEmail || "").toLowerCase().trim();
    if (!email || email !== req.customer.email) return res.status(403).json({ error: "Forbidden" });

    if (["cancelled","archived"].includes(String(order.status || "").toLowerCase())) {
      return res.status(409).json({ error: "Buchung ist storniert oder archiviert" });
    }
    assertCustomerChangeAllowedOrThrow(order);

    const newDate = String(date || "");
    const newTime = String(time || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
      return res.status(400).json({ error: "Invalid date/time" });
    }

    const schedule = { ...(order.schedule || {}), date: newDate, time: newTime };
    const updates = { schedule };

    // Fotografen aktualisieren wenn ein anderer vorgeschlagen wurde
    if (photographerKey && photographerKey !== order.photographer?.key) {
      const newPhotogName = photographerName || photographerKey;
      updates.photographer = { key: photographerKey, name: newPhotogName };
    }

    await db.updateOrderFields(orderNo, updates);
    res.json({ ok: true, orderNo, schedule, photographer: updates.photographer || order.photographer });
  } catch (err) {
    res.status(500).json({ error: err.message || "Reschedule fehlgeschlagen" });
  }
});

function normalizeRecipientRoles(toValue){
  const raw = Array.isArray(toValue) ? toValue : [toValue];
  const values = raw.map(v => String(v || "").trim().toLowerCase()).filter(Boolean);
  const hasBoth = values.includes("both") || values.includes("alle") || values.includes("beide");
  const set = new Set();
  if (hasBoth) {
    set.add("customer");
    set.add("photographer");
  }
  for (const v of values) {
    if (["customer","kunde"].includes(v)) set.add("customer");
    if (["photographer","fotograf","mitarbeiter"].includes(v)) set.add("photographer");
    if (["both","alle","beide"].includes(v)) {
      set.add("customer");
      set.add("photographer");
    }
  }
  return Array.from(set);
}

function sanitizeMessageText(input){
  return String(input || "").replace(/\r\n/g, "\n").trim();
}

function escMailHtml(s){
  return String(s || "").replace(/[<>&]/g, c => ({ "<":"&lt;", ">":"&gt;", "&":"&amp;" }[c]));
}

async function sendOrderMessageMails({ order, orderNo, senderLabel, senderRole, recipientRoles, message }){
  const customerEmail = String(order.billing?.email || order.customerEmail || "").trim();
  const photographerEmail = String(
    (await resolvePhotographerCalendarEmail(order.photographer?.key)) ||
      order.photographer?.email ||
      ""
  ).trim();
  const recipients = [];
  if (recipientRoles.includes("customer") && customerEmail) recipients.push({ role: "customer", email: customerEmail });
  if (recipientRoles.includes("photographer") && photographerEmail) recipients.push({ role: "photographer", email: photographerEmail });
  if (!recipients.length) throw new Error("Keine g\u00fcltigen Empf\u00e4nger gefunden");

  const roleLabels = { admin: "Admin", photographer: "Fotograf", customer: "Kunde" };
  const senderRoleLabel = roleLabels[senderRole] || senderRole;
  const subject = `Nachricht zu Auftrag #${orderNo}`;
  const safe = escMailHtml(message);
  const buildHtml = () => `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#222;max-width:560px">
    <div style="border-bottom:3px solid #9e8649;padding-bottom:10px;margin-bottom:20px">
      <span style="font-size:20px;font-weight:900;color:#9e8649;letter-spacing:1px">PROPUS</span>
      <span style="font-size:11px;color:#aaa;margin-left:8px">Real Estate Photography</span>
    </div>
    <h2 style="margin:0 0 12px;font-size:17px;color:#111">Neue Nachricht zu Auftrag #${orderNo}</h2>
    <p style="margin:0 0 6px"><strong>Absender:</strong> ${escMailHtml(senderLabel)} <span style="color:#888;font-size:13px">(${escMailHtml(senderRoleLabel)})</span></p>
    <p style="margin:0 0 16px"><strong>Objekt:</strong> ${escMailHtml(String(order.address || "\u2014"))}</p>
    <div style="padding:14px 16px;border-left:4px solid #9e8649;background:#fafafa;border-radius:4px;white-space:pre-wrap;font-size:14px;line-height:1.6">${safe}</div>
    <p style="margin-top:20px;font-size:12px;color:#aaa">Auftrag #${orderNo} &middot; Propus GmbH</p>
  </div>`;

  const text = `Neue Nachricht zu Auftrag #${orderNo}\nAbsender: ${senderLabel} (${senderRoleLabel})\nObjekt: ${order.address || "\u2014"}\n\n${message}`;

  for (const rec of recipients) {
    const sendResult = await sendMailWithFallback({
      to: rec.email,
      subject,
      html: buildHtml(),
      text,
      context: `order-message:${orderNo}:${rec.role}`,
    });
    assertMailSent(sendResult, `order-message:${orderNo}:${rec.role}`);
  }
  return recipients;
}

app.get("/api/customer/orders/:orderNo/messages", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const customerEmail = (order.billing?.email || order.customerEmail || "").toLowerCase().trim();
    if (!customerEmail || customerEmail !== req.customer.email) return res.status(403).json({ error: "Forbidden" });
    const messages = await listOrderMessages(orderNo);
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ error: err.message || "Nachrichten laden fehlgeschlagen" });
  }
});

app.post("/api/customer/orders/:orderNo/message", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const message = sanitizeMessageText(req.body?.message);
    if (!message) return res.status(400).json({ error: "Nachricht erforderlich" });
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const customerEmail = (order.billing?.email || order.customerEmail || "").toLowerCase().trim();
    if (!customerEmail || customerEmail !== req.customer.email) return res.status(403).json({ error: "Forbidden" });

    const recipients = await sendOrderMessageMails({
      order,
      orderNo,
      senderLabel: order.billing?.name || req.customer.name || req.customer.email,
      senderRole: "customer",
      recipientRoles: ["photographer"],
      message
    });
    const msg = await addOrderMessage({
      orderNo,
      senderRole: "customer",
      senderName: order.billing?.name || req.customer.name || req.customer.email || "Kunde",
      recipientRoles: ["photographer"],
      message
    });
    res.json({ ok: true, sent: recipients, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message || "Nachricht senden fehlgeschlagen" });
  }
});

app.get("/api/customer/orders/:orderNo/chat", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await getOrderForChat(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canCustomerAccessOrder(order, req.customer?.email)) return res.status(403).json({ error: "Forbidden" });

    const availability = getChatAvailability(order, "customer");
    if (!availability.readable) return res.status(403).json({ error: "Chat fuer diesen Auftrag nicht verfuegbar" });

    const messages = await listChatMessages(orderNo);
    res.json({ ok: true, messages, availability });
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat laden fehlgeschlagen" });
  }
});

app.post("/api/customer/orders/:orderNo/chat/message", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await getOrderForChat(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canCustomerAccessOrder(order, req.customer?.email)) return res.status(403).json({ error: "Forbidden" });

    if (!isChatWritable(order, "customer")) return res.status(403).json({ error: "Chat ist nicht mehr schreibbar" });
    const message = sanitizeMessageText(req.body?.message);
    if (!message) return res.status(400).json({ error: "Nachricht erforderlich" });

    const msg = await addChatMessage({
      orderNo,
      senderRole: "customer",
      senderId: String(req.customer?.id || req.customer?.email || ""),
      senderName: order.billing?.name || req.customer?.name || req.customer?.email || "Kunde",
      message,
    });

    const photographerEmail = String(
      (await resolvePhotographerCalendarEmail(order.photographer?.key)) ||
        order.photographer?.email ||
        ""
    ).trim();
    scheduleMailIfUnread({
      orderNo,
      msgId: msg.id,
      recipientEmail: photographerEmail,
      recipientRole: "photographer",
      senderName: msg.senderName,
    });
    broadcastChat(orderNo, msg);
    res.json({ ok: true, message: msg, availability: getChatAvailability(order, "customer") });
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat-Nachricht senden fehlgeschlagen" });
  }
});

app.patch("/api/customer/orders/:orderNo/chat/read", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await getOrderForChat(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canCustomerAccessOrder(order, req.customer?.email)) return res.status(403).json({ error: "Forbidden" });
    if (!isChatReadable(order, "customer")) return res.status(403).json({ error: "Chat fuer diesen Auftrag nicht verfuegbar" });

    const changed = await markChatRead(orderNo, "customer");
    res.json({ ok: true, changed });
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat-Lesestatus aktualisieren fehlgeschlagen" });
  }
});

app.get("/api/customer/orders/:orderNo/chat/events", requireCustomer, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await getOrderForChat(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canCustomerAccessOrder(order, req.customer?.email)) return res.status(403).json({ error: "Forbidden" });
    if (!isChatReadable(order, "customer")) return res.status(403).json({ error: "Chat fuer diesen Auftrag nicht verfuegbar" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    addChatSseClient(orderNo, "customer", res);
    const ping = setInterval(() => {
      try {
        res.write("event: ping\ndata: {}\n\n");
      } catch (_) {}
    }, 30000);
    req.on("close", () => {
      clearInterval(ping);
      removeChatSseClient(orderNo, "customer", res);
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat-Eventstream fehlgeschlagen" });
  }
});

app.get("/api/availability", async (req, res) => {
  try {
    const photographer = String(req.query.photographer || "").toLowerCase();
    const date = parseDateFlexible(req.query.date);
    const sqmRaw = String(req.query.sqm || "");
    const durationRaw = String(req.query.duration || "");
    const durationMin = Number(durationRaw);
    const sqm = Number(sqmRaw);
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const packageCode = String(req.query.package || "");
    const addonCodes = String(req.query.addons || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const includeSkillWarning = String(req.query.includeSkillWarning || "false").toLowerCase() === "true";
    const servicesForTravel = {
      package: packageCode ? { key: packageCode } : {},
      addons: addonCodes.map((id) => ({ id })),
    };
    const getSkillLevel = (skills, key) => {
      const fallbackDrone = (key === "drohne_foto" || key === "drohne_video")
        ? skills?.drohne
        : undefined;
      const level = Number(skills?.[key] ?? fallbackDrone ?? 0);
      return Number.isFinite(level) ? level : 0;
    };
    const travelEnabled = await shouldApplyTravelCalculation(servicesForTravel);
    console.log("[availability] request", { photographer, date, durationMin, sqm });

    if (!PHOTOGRAPHERS[photographer]) {
      console.error("[availability] unknown photographer", photographer);
      return res.status(400).json({ error: "Unknown photographer key" });
    }

    const calendarEmail = await resolvePhotographerCalendarEmail(photographer);
    if (!calendarEmail) {
      return res.status(400).json({ error: "No calendar email for photographer" });
    }

    if (!date) {
      console.error("[availability] invalid date", req.query.date);
      return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD or DD.MM.YYYY)" });
    }

    const bookingCoords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    let wishPhotographerSkillWarning = false;
    let missingSkills = [];
    let recommendedPhotographer = null;
    if (includeSkillWarning) {
      const selectedSettings = await db.getPhotographerSettings(photographer).catch(() => ({}));
      const selectedSkills = selectedSettings?.skills && typeof selectedSettings.skills === "object" ? selectedSettings.skills : {};
      const requiredSkillLevels = (await getSetting("assignment.requiredSkillLevels")).value || {};
      const matterportLargeSqmThreshold = (await getSetting("assignment.matterportLargeSqmThreshold")).value || 300;
      const matterportLargeSqmMinLevel = (await getSetting("assignment.matterportLargeSqmMinLevel")).value || 7;
      const matterportSmallSqmReduction = (await getSetting("assignment.matterportSmallSqmReduction")).value ?? 2;
      let productsByCode = new Map();
      try {
        const products = await db.listProductsWithRules({ includeInactive: false });
        productsByCode = new Map((Array.isArray(products) ? products : []).map((p) => [String(p.code || ""), p]));
      } catch {
        productsByCode = new Map();
      }
      const parsedSqm = Number.isFinite(sqm) && sqm > 0 ? sqm : null;
      const effectiveSqm = resolveEffectiveSqm(parsedSqm, servicesForTravel, productsByCode);
      const neededSkills = buildNeededSkills(servicesForTravel, effectiveSqm, {
        requiredSkillLevels,
        matterportLargeSqmThreshold,
        matterportLargeSqmMinLevel,
        matterportSmallSqmReduction,
      }, productsByCode);
      missingSkills = Object.keys(neededSkills).filter((skill) => getSkillLevel(selectedSkills, skill) <= 0);
      wishPhotographerSkillWarning = missingSkills.length > 0;

      if (wishPhotographerSkillWarning) {
        const recommendationPool = PHOTOGRAPHERS_CONFIG.filter((p) => p.key !== photographer);
        const availabilityMap = {};
        for (const p of recommendationPool) {
          const email = await resolvePhotographerCalendarEmail(p.key);
          if (!email) {
            availabilityMap[p.key] = [];
            continue;
          }
          try {
            const schedulingSettings = await getSchedulingSettings(p.key);
            const daySchedule = resolveScheduleForDate(date, schedulingSettings);
            if (daySchedule.isHoliday || !daySchedule.enabled) {
              availabilityMap[p.key] = [];
              continue;
            }
            let recEvents = await fetchCalendarEvents(email, date, p.key);
            recEvents = await appendBlockedDateBusyEvents(p.key, date, recEvents);
            const recAvail = buildAvailability(recEvents, durationMin, {
              ...schedulingSettings,
              workStart: daySchedule.workStart,
              workEnd: daySchedule.workEnd,
            });
            const travelResult = await filterAvailabilityByTravel({
              freeSlots: recAvail.free || [],
              events: recEvents,
              durationMin,
              date,
              photographerKey: p.key,
              bookingCoord: bookingCoords,
              bufferMinutes: schedulingSettings.bufferMinutes,
            });
            availabilityMap[p.key] = travelResult.free || [];
          } catch {
            availabilityMap[p.key] = [];
          }
        }

        const resolvedRecommendation = await resolveAnyPhotographer({
          photographersConfig: recommendationPool,
          availabilityMap,
          date,
          time: "00:00",
          services: servicesForTravel,
          sqm: effectiveSqm ?? sqm,
          bookingCoords,
          anySlotMode: true,
        });
        if (resolvedRecommendation?.key) {
          recommendedPhotographer = {
            key: resolvedRecommendation.key,
            name: resolvedRecommendation.name || resolvedRecommendation.key,
          };
        }
      }
    }

    const schedulingSettings = await getSchedulingSettings(photographer);
    const lookaheadDays = Number(schedulingSettings.lookaheadDays || 14);
    const requestedDate = new Date(`${date}T00:00:00`);
    const nowDate = new Date();
    nowDate.setHours(0, 0, 0, 0);
    const dayDiff = Math.floor((requestedDate.getTime() - nowDate.getTime()) / 86400000);
    if (dayDiff > lookaheadDays) {
      return res.status(400).json({ error: `Datum liegt ausserhalb Lookahead (${lookaheadDays} Tage)` });
    }
    const daySchedule = resolveScheduleForDate(date, schedulingSettings);
    if (daySchedule.isHoliday || !daySchedule.enabled) {
      return res.json({
        photographer,
        date,
        timeZone: TIMEZONE,
        workStart: daySchedule.workStart || schedulingSettings.workStart,
        workEnd: daySchedule.workEnd || schedulingSettings.workEnd,
        travelEnabled,
        travelApplied: false,
        travelFilteredCount: 0,
        wishPhotographerSkillWarning,
        missingSkills,
        recommendedPhotographer,
        free: [],
        busy: [],
        reason: daySchedule.isHoliday ? "holiday" : "outside_workdays",
      });
    }

    let events = [];
    let availability = null;
    try {
      events = await fetchCalendarEvents(calendarEmail, date, photographer);
      events = await appendBlockedDateBusyEvents(photographer, date, events);
      availability = buildAvailability(events, durationMin, {
        ...schedulingSettings,
        workStart: daySchedule.workStart,
        workEnd: daySchedule.workEnd,
      });
    } catch (calendarErr) {
      console.error("[availability] calendar fetch/build failed:", calendarErr?.message || calendarErr);
      return res.json({
        photographer,
        date,
        timeZone: TIMEZONE,
        workStart: daySchedule.workStart || schedulingSettings.workStart,
        workEnd: daySchedule.workEnd || schedulingSettings.workEnd,
        travelEnabled,
        travelApplied: false,
        travelFilteredCount: 0,
        wishPhotographerSkillWarning,
        missingSkills,
        recommendedPhotographer,
        free: [],
        busy: [],
        reason: "calendar_unavailable",
      });
    }

    // Optional: Fahrzeit-basiertes Slot-Filtering (wenn Koordinaten gegeben sind)
    let travelApplied = false;
    let travelFilteredCount = 0;
    if (travelEnabled && Number.isFinite(lat) && Number.isFinite(lon) && availability?.free?.length) {
      const travelResult = await filterAvailabilityByTravel({
        freeSlots: availability.free,
        events,
        durationMin,
        date,
        photographerKey: photographer,
        bookingCoord: bookingCoords,
        bufferMinutes: schedulingSettings.bufferMinutes,
      });
      availability.free = travelResult.free;
      travelApplied = travelResult.travelApplied;
      travelFilteredCount = travelResult.travelFilteredCount;
    }

    const showAsCounts = events.reduce((acc, ev) => {
      const key = String(ev.showAs || "unknown").toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    res.json({
      photographer,
      date,
      timeZone: TIMEZONE,
      workStart: daySchedule.workStart || schedulingSettings.workStart,
      workEnd: daySchedule.workEnd || schedulingSettings.workEnd,
      travelEnabled,
      travelApplied,
      travelFilteredCount,
      wishPhotographerSkillWarning,
      missingSkills,
      recommendedPhotographer,
      ...availability
    });
  } catch (err) {
    console.error("Availability error:", err?.message || err);
    const innerError = err?.body?.error?.innerError || {};
    res.status(500).json({ error: "Availability lookup failed" });
  }
});

app.get("/api/admin/availability", requireAdmin, async (req, res) => {
  try {
    const date = parseDateFlexible(req.query.date);
    const time = String(req.query.time || "");
    const photographer = String(req.query.photographer || "any").toLowerCase();
    const sqm = Number(req.query.sqm || 0);
    const decisionTrace = String(req.query.decisionTrace || "false").toLowerCase() === "true";
    const packageCode = String(req.query.package || "");
    const addonCodes = String(req.query.addons || "").split(",").map((x) => x.trim()).filter(Boolean);
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!date) return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD or DD.MM.YYYY)" });
    if (!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: "Invalid time format" });

    const services = {
      package: packageCode ? { key: packageCode } : {},
      addons: addonCodes.map((id) => ({ id })),
    };
    const durationMin = await getShootDurationMinutes(sqm, services);
    const bookingCoords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    const availabilityMap = {};
    for (const p of PHOTOGRAPHERS_CONFIG) {
      const email = await resolvePhotographerCalendarEmail(p.key);
      if (!email) continue;
      try {
        const schedulingSettings = await getSchedulingSettings(p.key);
        const daySchedule = resolveScheduleForDate(date, schedulingSettings);
        if (daySchedule.isHoliday || !daySchedule.enabled) {
          availabilityMap[p.key] = [];
          continue;
        }
        let evAdm = await fetchCalendarEvents(email, date, p.key);
        evAdm = await appendBlockedDateBusyEvents(p.key, date, evAdm);
        const avail = buildAvailability(evAdm, durationMin, {
          ...schedulingSettings,
          workStart: daySchedule.workStart,
          workEnd: daySchedule.workEnd,
        });
        const travelResult = await filterAvailabilityByTravel({
          freeSlots: avail.free || [],
          events: evAdm,
          durationMin,
          date,
          photographerKey: p.key,
          bookingCoord: bookingCoords,
          bufferMinutes: schedulingSettings.bufferMinutes,
        });
        availabilityMap[p.key] = travelResult.free;
      } catch (_) {
        availabilityMap[p.key] = [];
      }
    }

    if (photographer !== "any") {
      return res.json({ ok: true, photographer, freeSlots: availabilityMap[photographer] || [] });
    }

    const resolved = await resolveAnyPhotographer({
      photographersConfig: PHOTOGRAPHERS_CONFIG,
      availabilityMap,
      date,
      time,
      services,
      sqm,
      bookingCoords,
      withDecisionTrace: decisionTrace,
    });

    if (decisionTrace) {
      return res.json({ ok: true, result: resolved?.selected || null, decisionTrace: resolved?.decisionTrace || null });
    }
    return res.json({ ok: true, result: resolved || null });
  } catch (err) {
    res.status(500).json({ error: err.message || "Admin availability failed" });
  }
});

app.post("/api/admin/availability/simulate", requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const date = parseDateFlexible(body.date);
    const time = String(body.time || "");
    const sqm = Number(body.sqm || 0);
    const packageCode = String(body.packageCode || "");
    const addonCodesRaw = body.addonCodes;
    const addonCodes = Array.isArray(addonCodesRaw)
      ? addonCodesRaw.map((x) => String(x || "").trim()).filter(Boolean)
      : String(addonCodesRaw || "").split(",").map((x) => x.trim()).filter(Boolean);
    const lat = Number(body.lat);
    const lon = Number(body.lon);
    const settingsOverride = body.settingsOverride && typeof body.settingsOverride === "object" ? body.settingsOverride : {};

    if (!date) return res.status(400).json({ error: "Invalid date format (YYYY-MM-DD or DD.MM.YYYY)" });
    if (!/^\d{2}:\d{2}$/.test(time)) return res.status(400).json({ error: "Invalid time format" });

    const services = {
      package: packageCode ? { key: packageCode } : {},
      addons: addonCodes.map((id) => ({ id })),
    };
    const durationMin = await getShootDurationMinutes(sqm, services);
    const bookingCoords = Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
    const availabilityMap = {};
    for (const p of PHOTOGRAPHERS_CONFIG) {
      const email = await resolvePhotographerCalendarEmail(p.key);
      if (!email) continue;
      try {
        const schedulingSettings = await getSchedulingSettings(p.key);
        const daySchedule = resolveScheduleForDate(date, schedulingSettings);
        if (daySchedule.isHoliday || !daySchedule.enabled) {
          availabilityMap[p.key] = [];
          continue;
        }
        let evAdm = await fetchCalendarEvents(email, date, p.key);
        evAdm = await appendBlockedDateBusyEvents(p.key, date, evAdm);
        const avail = buildAvailability(evAdm, durationMin, {
          ...schedulingSettings,
          workStart: daySchedule.workStart,
          workEnd: daySchedule.workEnd,
        });
        const travelResult = await filterAvailabilityByTravel({
          freeSlots: avail.free || [],
          events: evAdm,
          durationMin,
          date,
          photographerKey: p.key,
          bookingCoord: bookingCoords,
          bufferMinutes: schedulingSettings.bufferMinutes,
        });
        availabilityMap[p.key] = travelResult.free;
      } catch (_) {
        availabilityMap[p.key] = [];
      }
    }

    const resolved = await resolveAnyPhotographer({
      photographersConfig: PHOTOGRAPHERS_CONFIG,
      availabilityMap,
      date,
      time,
      services,
      sqm,
      bookingCoords,
      withDecisionTrace: true,
      assignmentSettingsOverride: settingsOverride,
    });

    return res.json({ ok: true, result: resolved?.selected || null, decisionTrace: resolved?.decisionTrace || null });
  } catch (err) {
    res.status(500).json({ error: err.message || "Admin availability simulate failed" });
  }
});

app.post("/api/booking", async (req, res) => {
  const requestId = `bk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  let photographerKey = "";
  let date = "";
  let time = "";
  let hasCustomerEmail = false;
  const bookingWarnings = [];
  try {
    const payload = normalizeTextDeep(req.body || {});
    const schedule = payload.schedule || {};
    const billing = payload.billing || {};
    const object = payload.object || {};
    const services = payload.services || {};
    const addressText = payload?.address?.text || "";
    const keyPickup = payload.keyPickup || {};

    photographerKey = String(schedule.photographer?.key || "").toLowerCase();
    let photographerName = String(schedule.photographer?.name || "").trim();
    date = String(schedule.date || "");
    time = String(schedule.time || "");
    const customerEmail = String(billing.email || "").trim();
    hasCustomerEmail = !!customerEmail;

    const area = parseAreaToNumber(object.area);
    const durationMin = await getShootDurationMinutes(area, services);
    const bookingCoords = payload?.address?.coords
      ? { lat: Number(payload.address.coords.lat), lon: Number(payload.address.coords.lng ?? payload.address.coords.lon) }
      : null;

    // "any" aufl-sen: intelligente Zuteilung via photographer-resolver
    if (photographerKey === "any") {
      console.log("[booking] resolving 'any' photographer (smart) for", { date, time });

      // Availability fuer alle Fotografen abrufen
      const availabilityMap = {};
      for (const p of PHOTOGRAPHERS_CONFIG) {
        try {
          const email = await resolvePhotographerCalendarEmail(p.key);
          if (!email) continue;
          const schedulingSettings = await getSchedulingSettings(p.key);
          const daySchedule = resolveScheduleForDate(date, schedulingSettings);
          if (daySchedule.isHoliday || !daySchedule.enabled) {
            availabilityMap[p.key] = [];
            continue;
          }
          let evBk = await fetchCalendarEvents(email, date, p.key);
          evBk = await appendBlockedDateBusyEvents(p.key, date, evBk);
          const avail = buildAvailability(evBk, durationMin, {
            ...schedulingSettings,
            workStart: daySchedule.workStart,
            workEnd: daySchedule.workEnd,
          });
          const travelResult = await filterAvailabilityByTravel({
            freeSlots: avail.free || [],
            events: evBk,
            durationMin,
            date,
            photographerKey: p.key,
            bookingCoord: bookingCoords,
            bufferMinutes: schedulingSettings.bufferMinutes,
          });
          availabilityMap[p.key] = travelResult.free;
        } catch (err) {
          console.error("[booking] availability check failed for", p.key, err?.message);
          availabilityMap[p.key] = [];
        }
      }

      let resolved = null;
      try {
        resolved = await resolveAnyPhotographer({
          photographersConfig: PHOTOGRAPHERS_CONFIG,
          availabilityMap,
          date,
          time,
          services,
          sqm: parseAreaToNumber(object.area),
          bookingCoords: bookingCoords && Number.isFinite(bookingCoords.lat) ? bookingCoords : null,
        });
      } catch (err) {
        console.error("[booking] resolveAnyPhotographer error:", err?.message);
      }

      // Shadow-Mode: Assignment-Vergleich (fire-and-forget, blockiert nicht)
      shadowAssignment({
        photographersConfig: PHOTOGRAPHERS_CONFIG,
        availabilityMap,
        date,
        time,
        services,
        sqm: parseAreaToNumber(object.area),
        bookingCoords: bookingCoords && Number.isFinite(bookingCoords.lat) ? bookingCoords : null,
        v1Result: resolved,
        orderNo: null, // orderNo noch nicht vergeben
      }).catch(() => {});

      if (resolved) {
        photographerKey = resolved.key;
        photographerName = resolved.name;
        console.log("[booking] resolved 'any' to", { key: resolved.key, name: resolved.name });
      } else {
        return res.status(409).json({
          error: "Kein passender Fotograf gefunden",
          reason: "needs_admin_selection",
        });
      }
    }

    console.log("[booking] handler start", {
      requestId,
      photographerKey,
      hasPhotographer: !!PHOTOGRAPHERS[photographerKey],
      date,
      time,
      hasCustomerEmail
    });

    const orderNo = nextOrderNumber();
    const discountCode = String(payload.discountCode || "").trim();
    // Preise direkt aus Frontend-Payload -bernehmen (sind dort korrekt berechnet)
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const frontendPricing = payload?.pricing || {};
    let subtotalFinal = num(frontendPricing.subtotal);
    let discountAmountFinal = num(frontendPricing.discountAmount);
    let vatFinal = num(frontendPricing.vat);
    let totalFinal = num(frontendPricing.total);

    // Fallback: wenn Frontend keine Preise schickt, selbst berechnen
    if (subtotalFinal === 0) {
      const pricingData = await computePricing({ services, object, discountCode, customerEmail });
      subtotalFinal = num(pricingData?.pricing?.subtotal);
      discountAmountFinal = num(pricingData?.pricing?.discountAmount);
      vatFinal = num(pricingData?.pricing?.vat);
      totalFinal = num(pricingData?.pricing?.total);
    }

    const vatRateSetting = Number((await getSetting("pricing.vatRate")).value || 0.081);
    const chfRoundingStep = Math.max(0.01, Number((await getSetting("pricing.chfRoundingStep")).value || 0.05));
    const roundToStep = (value) => Math.round((Number(value) || 0) / chfRoundingStep) * chfRoundingStep;

    // Sicherheitsnetz: MwSt/Total immer neu berechnen falls 0 oder NaN
    if (vatFinal === 0 && subtotalFinal > 0) {
      vatFinal = roundToStep(Math.max(0, subtotalFinal - discountAmountFinal) * vatRateSetting);
    }
    if (totalFinal === 0 && subtotalFinal > 0) {
      totalFinal = roundToStep(Math.max(0, subtotalFinal - discountAmountFinal) + vatFinal);
    }

    console.log("[pricing] final", { subtotalFinal, discountAmountFinal, vatFinal, totalFinal });

    const pricingSummaryLines = [`Zwischensumme: ${subtotalFinal} CHF`];
    if (discountAmountFinal > 0) pricingSummaryLines.push(`Rabatt: -${discountAmountFinal} CHF`);
    pricingSummaryLines.push(`MwSt (${(vatRateSetting * 100).toFixed(1)}%): ${vatFinal} CHF`);
    pricingSummaryLines.push(`Total: ${totalFinal} CHF`);
    const pricingSummary = pricingSummaryLines.join("\n");

    // Service-Listen fuer Mails
    let pricingData;
    try { pricingData = await computePricing({ services, object, discountCode, customerEmail }); } catch(e) { pricingData = { serviceListWithPrice: "-", serviceListNoPrice: "-" }; }

    pricingData = pricingData || {};
    if (!pricingData.serviceListWithPrice) pricingData.serviceListWithPrice = "-";
    if (!pricingData.serviceListNoPrice) pricingData.serviceListNoPrice = "-";

    // Shadow-Mode: Pricing-Vergleich (fire-and-forget, blockiert nicht, beeinflusst keine Order)
    shadowPricing({
      services,
      object,
      discountCode,
      customerEmail,
      v1Result: pricingData,
      orderNo: null, // wird sp-ter vergeben
    }).catch(() => {});

    if (!PHOTOGRAPHERS[photographerKey]) {
      console.error("[booking] invalid photographer", photographerKey);
      return res.status(400).json({ error: "Unknown photographer key", field: "photographerKey" });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      console.error("[booking] invalid date/time", { date, time });
      return res.status(400).json({ error: "Invalid date or time", field: "dateTime" });
    }
    if (!customerEmail) {
      console.error("[booking] missing customer email");
      return res.status(400).json({ error: "Missing customer email", field: "email" });
    }

    const zipCity = getZipCityFromBillingSafe(billing);
    const title = getTitleSafe(addressText, zipCity);
    const objectInfo = buildObjectInfoSafe(object, addressText);
    const serviceListWithPrice = pricingData.serviceListWithPrice;
    const serviceListNoPrice = pricingData.serviceListNoPrice;
    const photographerEmail = await resolvePhotographerCalendarEmail(photographerKey);
    if (!photographerEmail) {
      return res.status(400).json({
        error: "No calendar email for photographer",
        field: "photographerKey",
      });
    }

    try {
      const schedBk = await getSchedulingSettings(photographerKey);
      const dayBk = resolveScheduleForDate(date, schedBk);
      if (dayBk.isHoliday || !dayBk.enabled) {
        return res.status(409).json({
          error: "An diesem Tag ist keine Buchung mÃƒÆ’Ã‚Â¶glich.",
          reason: dayBk.isHoliday ? "holiday" : "outside_workdays",
        });
      }
      let calEvBk = await fetchCalendarEvents(photographerEmail, date, photographerKey).catch((err) => {
        console.warn("[booking] calendar fetch for slot check:", err?.message || err);
        return [];
      });
      if (!Array.isArray(calEvBk)) calEvBk = [];
      calEvBk = await appendBlockedDateBusyEvents(photographerKey, date, calEvBk);
      const availBk = buildAvailability(calEvBk, durationMin, {
        ...schedBk,
        workStart: dayBk.workStart,
        workEnd: dayBk.workEnd,
      });
      if (!(availBk.free || []).includes(time)) {
        return res.status(409).json({
          error: "Dieser Zeitslot ist nicht verfÃƒÆ’Ã‚Â¼gbar (Kalender oder Abwesenheit).",
          reason: "slot_unavailable",
        });
      }
    } catch (e) {
      console.error("[booking] slot validation error", photographerKey, e?.message || e);
      return res.status(503).json({
        error: "VerfÃƒÆ’Ã‚Â¼gbarkeit konnte nicht geprÃƒÆ’Ã‚Â¼ft werden.",
        reason: "availability_check_failed",
      });
    }

    const photographerPhone = PHOTOG_PHONES[photographerKey] || "-";

    const photographerPhoneSafe = PHOTOG_PHONES[photographerKey] || "-";
    const safeLocation = addressText || billing?.street || "";

    const description = buildCalendarContent({
      objectInfo,
      servicesText: serviceListNoPrice,
      billing,
      keyPickup,
      photographer: {
        name: photographerName || photographerKey,
        email: photographerEmail,
        phone: photographerPhoneSafe
      }
    });
    const calendarSubject = buildCalendarSubject({ title, orderNo });
    const { icsContent: ics, uid: icsUid } = buildIcsEvent({
      title: calendarSubject,
      description,
      location: addressText || "-",
      date,
      time,
      durationMin
    });

    // native_language fuer mehrsprachige Fotograf-Mails
    let photogNativeLang = "de";
    if (db.getPool && db.getPool()) {
      try {
        const { rows: nlRows } = await db.getPool().query(
          "SELECT native_language FROM photographer_settings WHERE photographer_key = $1", [photographerKey]
        );
        if (nlRows[0]?.native_language) photogNativeLang = nlRows[0].native_language;
      } catch(e) { /* default de */ }
    }

    const photographerEmailData = buildPhotographerEmail({
      orderNo,
      objectInfo,
      objectType: object?.type,
      objectArea: object?.area,
      objectRooms: object?.rooms,
      objectFloors: object?.floors,
      address: safeLocation,
      serviceListNoPrice,
      date,
      time,
      billing,
      keyPickup
    }, photogNativeLang);
    const photographerMail = {
      from: MAIL_FROM,
      to: photographerEmail,
      subject: photographerEmailData.subject,
      text: photographerEmailData.text,
      html: photographerEmailData.html
    };

    const officeLang = process.env.OFFICE_LANG || "de";
    const customerLang = billing?.language || "de";

    const officeEmail = buildOfficeEmail({
      orderNo,
      objectInfo,
      objectType: object?.type,
      objectArea: object?.area,
      objectRooms: object?.rooms,
      objectFloors: object?.floors,
      address: safeLocation,
      serviceListWithPrice,
      pricingSummary,
      date,
      time,
      photographerName,
      photographerKey,
      billing,
      keyPickup
    }, officeLang);
    const officeMail = {
      from: MAIL_FROM,
      to: OFFICE_EMAIL,
      subject: officeEmail.subject,
      text: officeEmail.text,
      html: officeEmail.html
    };

    const frontendBase = process.env.FRONTEND_URL || "https://booking.propus.ch";
    let portalMagicLink = null;
    try {
      portalMagicLink = await createCustomerPortalMagicLink(billing, { sessionDays: 14 });
    } catch (err) {
      const message = String(err?.message || err || "Customer portal link failed");
      console.warn("[booking] customer portal link failed", { requestId, message, customerEmail });
      bookingWarnings.push({
        stage: "customer_portal",
        code: "CUSTOMER_PORTAL_LINK_FAILED",
        message,
      });
    }
    const customerEmailData = buildCustomerEmail({
      objectInfo,
      serviceListWithPrice,
      pricingSummary,
      date,
      time,
      photographerName,
      photographerKey,
      photographerEmail,
      photographerPhone: photographerPhoneSafe,
      billing,
      keyPickup,
      orderNo,
      address: safeLocation,
      icsUrl: `${frontendBase}/api/orders/${orderNo}/ics`,
      portalMagicLink,
    }, customerLang);
    const customerMail = {
      from: MAIL_FROM,
      to: customerEmail,
      subject: customerEmailData.subject,
      text: customerEmailData.text,
      html: customerEmailData.html
    };

    try {
      await sendMailWithFallback({
        to: officeMail.to,
        subject: officeMail.subject,
        html: officeMail.html,
        text: officeMail.text,
        context: `booking:${orderNo}:office`
      });
    } catch (err) {
      const message = String(err?.message || err || "Office mail send failed");
      const code = err?.code || "MAIL_SEND_FAILED";
      console.error("[booking] office mail failed", {
        requestId,
        stage: "office",
        code,
        message,
        attempts: err?.attempts || []
      });
      bookingWarnings.push({
        stage: "office",
        code,
        message,
        attempts: err?.attempts || []
      });
    }
    try {
      await sendMailWithFallback({
        to: photographerMail.to,
        subject: photographerMail.subject,
        html: photographerMail.html,
        text: photographerMail.text,
        context: `booking:${orderNo}:photographer`
      });
    } catch (err) {
      const message = String(err?.message || err || "Photographer mail send failed");
      const code = err?.code || "MAIL_SEND_FAILED";
      console.error("[booking] photographer mail failed", {
        requestId,
        stage: "photographer",
        code,
        message,
        attempts: err?.attempts || []
      });
      bookingWarnings.push({
        stage: "photographer",
        code,
        message,
        attempts: err?.attempts || []
      });
    }
    try {
      await sendMailWithFallback({
        to: customerMail.to,
        subject: customerMail.subject,
        html: customerMail.html,
        text: customerMail.text,
        context: `booking:${orderNo}:customer`
      });
    } catch (err) {
      const message = String(err?.message || err || "Customer mail send failed");
      const code = err?.code || "MAIL_SEND_FAILED";
      console.error("[booking] customer mail failed", {
        requestId,
        stage: "customer",
        code,
        message,
        attempts: err?.attempts || []
      });
      bookingWarnings.push({
        stage: "customer",
        code,
        message,
        attempts: err?.attempts || []
      });
    }

    let inviteCreated = false;
    let photographerEventId = null;
    try {
      const evResult = await createPhotographerEvent({
        orderNo,
        photographerEmail,
        photographerName,
        subject: calendarSubject,
        date,
        time,
        durationMin,
        title,
        addressText,
        description
      });
      inviteCreated = true;
      photographerEventId = evResult?.id || null;
    } catch (err) {
      console.error("[booking] photographer event failed", err?.message || err);
    }

    let officeEventCreated = false;
    let officeEventId = null;
    try {
      const evResult = await createOfficeEvent({
        subject: calendarSubject,
        date,
        time,
        durationMin,
        addressText,
        description
      });
      officeEventCreated = true;
      officeEventId = evResult?.id || null;
    } catch (err) {
      console.error("[booking] office event failed", err?.message || err);
    }

    if (discountCode) {
      await markDiscountUsed(discountCode, customerEmail);
    }

    // Bestellung speichern fuer Admin-Panel
    const orderRecord = {
      orderNo,
      createdAt: new Date().toISOString(),
      status: "pending",
      address: addressText,
      object: {
        type: object.type || "",
        area: object.area || "",
        floors: object.floors || 1,
        rooms: object.rooms || "",
        desc: object.desc || ""
      },
      services: {
        package: services.package || {},
        addons: (services.addons || []).map(a => ({ id: a.id, label: a.label, price: a.price, group: a.group }))
      },
      photographer: { key: photographerKey, name: photographerName, email: photographerEmail },
      schedule: { date, time, durationMin },
      billing: {
        salutation: billing.salutation || "",
        first_name: billing.first_name || "",
        company: billing.company || "",
        company_email: billing.company_email || "",
        company_phone: billing.company_phone || "",
        name: billing.name || "",
        email: customerEmail,
        phone: billing.phone || "",
        phone_mobile: billing.phone_mobile || "",
        onsiteName: object.onsiteName || billing.onsiteName || "",
        onsitePhone: object.onsitePhone || billing.onsitePhone || "",
        street: billing.street || "",
        zip: billing.zip || "",
        city: billing.city || "",
        zipcity: billing.zipcity || "",
        order_ref: billing.order_ref || "",
        alt_company: billing.alt_company || "",
        alt_company_email: billing.alt_company_email || "",
        alt_company_phone: billing.alt_company_phone || "",
        alt_street: billing.alt_street || "",
        alt_zip: billing.alt_zip || "",
        alt_city: billing.alt_city || "",
        alt_zipcity: billing.alt_zipcity || [billing.alt_zip, billing.alt_city].filter(Boolean).join(" "),
        alt_salutation: billing.alt_salutation || "",
        alt_first_name: billing.alt_first_name || "",
        alt_name: billing.alt_name || "",
        alt_email: billing.alt_email || "",
        alt_phone: billing.alt_phone || "",
        alt_phone_mobile: billing.alt_phone_mobile || "",
        notes: billing.notes || ""
      },
      pricing: { subtotal: subtotalFinal, discount: discountAmountFinal, vat: vatFinal, total: totalFinal },
      settingsSnapshot: {
        pricing: pricingData?.appliedSettings || {},
        scheduling: await getSchedulingSettings(photographerKey),
      },
      discountCode: discountCode || "",
      keyPickup: keyPickup.enabled ? keyPickup : null,
      calendarCreated: inviteCreated,
      officeCalendarCreated: officeEventCreated,
      photographerEventId,
      officeEventId,
      icsUid: icsUid || null
    };
    try {
      await saveOrder(orderRecord);
    } catch (err) {
      const message = String(err?.message || err || "Order persistence failed");
      const code = err?.code || "DB_SAVE_ORDER_FAILED";
      console.error("[booking] saveOrder failed", {
        requestId,
        stage: "database",
        code,
        message,
        photographerKey,
        date,
        time
      });
      return res.status(500).json({
        error: "Booking persistence failed",
        stage: "database",
        code,
        message,
        requestId
      });
    }

    console.log("[booking] success", {
      orderNo,
      warningCount: bookingWarnings.length
    });
    res.json({
      ok: true,
      orderNo,
      warnings: bookingWarnings,
      requestId
    });
  } catch (err) {
    const message = String(err?.message || err || "Unhandled booking error");
    const code = err?.code || "BOOKING_UNHANDLED";
    console.error("[booking] unhandled error", {
      requestId,
      stage: "unhandled",
      code,
      message,
      photographerKey,
      date,
      time,
      hasCustomerEmail
    });
    res.status(500).json({
      error: "Booking failed",
      stage: "unhandled",
      code,
      message,
      requestId
    });
  }
});

// Admin: resend customer confirmation email for an existing order
app.post("/api/admin/orders/:orderNo/resend-customer-email", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    if (!Number.isFinite(orderNo)) return res.status(400).json({ error: "Invalid order number" });

    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => Number(o.orderNo) === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const customerEmail = String(order.billing?.email || order.customerEmail || "").trim();
    if (!customerEmail) return res.status(400).json({ error: "No customer email available for this order" });

    // Rebuild email contents using existing templates/helpers
    const zipCity = getZipCityFromBillingSafe(order.billing);
    const objectInfo = buildObjectInfoSafe(order.object || {}, order.address || "");
    const pricingSummaryLines = [`Zwischensumme: ${order.pricing?.subtotal||0} CHF`];
    if (order.pricing?.discount > 0) pricingSummaryLines.push(`Rabatt: -${order.pricing.discount} CHF`);
    pricingSummaryLines.push(`MwSt (8.1%): ${order.pricing?.vat||0} CHF`);
    pricingSummaryLines.push(`Total: ${order.pricing?.total||0} CHF`);
    const pricingSummary = pricingSummaryLines.join("\n");

    const serviceListWithPrice = Array.isArray(order.services?.addons) ? order.services.addons.map(a => `${a.label} - ${a.price||0} CHF`).join("\n") : (order.services?.package?.label ? `${order.services.package.label} - ${order.services.package.price||0} CHF` : "-");
    const serviceListNoPrice = Array.isArray(order.services?.addons) ? order.services.addons.map(a => a.label).join("\n") : (order.services?.package?.label ? order.services.package.label : "-");

    const photographerName = order.photographer?.name || "";
    const photographerKey = order.photographer?.key || "";
    const photographerEmail =
      (await resolvePhotographerCalendarEmail(String(photographerKey).toLowerCase())) ||
      order.photographer?.email ||
      "";
    const photographerPhone = PHOTOG_PHONES[String(photographerKey).toLowerCase()] || "";

    const frontendBaseResend = process.env.FRONTEND_URL || "https://booking.propus.ch";
    const billing = order.billing || {};
    const customerLang = order.billing?.language || billing?.language || "de";
    const portalMagicLink = await createCustomerPortalMagicLink(billing, { sessionDays: 14 }).catch(() => null);
    const customerEmailData = buildCustomerEmail({
      objectInfo,
      serviceListWithPrice,
      pricingSummary,
      date: order.schedule?.date,
      time: order.schedule?.time,
      photographerName,
      photographerKey,
      photographerEmail,
      photographerPhone,
      billing: order.billing || {},
      keyPickup: order.keyPickup || {},
      orderNo: order.orderNo,
      address: order.address || order.billing?.street || "",
      icsUrl: `${frontendBaseResend}/api/orders/${order.orderNo}/ics`,
      portalMagicLink,
    }, customerLang);

    const mail = {
      from: MAIL_FROM,
      to: customerEmail,
      subject: customerEmailData.subject,
      html: customerEmailData.html,
      text: customerEmailData.text
    };

    try {
      const result = await sendMailWithFallback({
        to: customerEmail,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        context: `admin-resend:${orderNo}:customer`
      });
      return res.json({ ok: true, sent: true, to: customerEmail, via: result.method });
    } catch (err) {
      console.error("[admin-resend] send failed", err?.attempts || err?.message || err);
      return res.status(500).json({
        error: "Failed to send email",
        code: err?.code || null,
        attempts: err?.attempts || [],
        message: String(err?.message || err)
      });
    }
  } catch (err) {
    console.error("[admin-resend] error", err?.message || err);
    res.status(500).json({ error: err.message || "Resend failed" });
  }
});

// Spezifische E-Mail-Typen erneut senden (confirmation_request, reschedule, booking_confirmed)
app.post("/api/admin/orders/:orderNo/resend-email", requireAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    if (!Number.isFinite(orderNo)) return res.status(400).json({ error: "Invalid order number" });

    const { emailType } = req.body || {};
    const allowedTypes = ["confirmation_request", "reschedule", "booking_confirmed"];
    if (!emailType || !allowedTypes.includes(emailType)) {
      return res.status(400).json({ error: "Invalid emailType. Must be one of: " + allowedTypes.join(", ") });
    }

    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => Number(o.orderNo) === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const customerEmail = String(order.billing?.email || order.customerEmail || "").trim();
    if (!customerEmail) return res.status(400).json({ error: "No customer email available for this order" });

    const frontendBase = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
    const customerLang = order.billing?.language || "de";

    let subject, html, text;

    if (emailType === "confirmation_request") {
      const confToken = order.confirmationToken;
      if (!confToken) return res.status(400).json({ error: "No confirmation token available for this order" });
      const confirmUrl = `${frontendBase}/confirm?token=${confToken}`;
      const pool = db.getPool ? db.getPool() : null;
      if (!pool) return res.status(503).json({ error: "No database connection available" });
      const sendFn = (to, subj, htm, txt) => sendMailWithFallback({
        to,
        subject: subj,
        html: htm,
        text: txt,
        context: `admin-resend-email:${orderNo}:confirmation_request`,
      });
      const vars = templateRenderer.buildTemplateVars(order, { confirmationLink: confirmUrl, confirmUrl });
      const result = await templateRenderer.sendMailIdempotent(
        pool,
        "booking_confirmation_request",
        customerEmail,
        orderNo,
        vars,
        sendFn
      );
      return res.json({ ok: true, sent: result.sent === true, to: customerEmail, reason: result.reason || null });
    } else if (emailType === "reschedule") {
      const photographerPhone = PHOTOG_PHONES[String(order.photographer?.key || "").toLowerCase()] || "";
      const emailData = buildRescheduleCustomerEmail(order, null, null, order.schedule?.date, order.schedule?.time, photographerPhone, customerLang);
      subject = emailData.subject;
      html = emailData.html;
      text = emailData.text;
    } else if (emailType === "booking_confirmed") {
      const objectInfo = buildObjectInfoSafe(order.object || {}, order.address || "");
      const serviceListWithPrice = Array.isArray(order.services?.addons)
        ? order.services.addons.map(a => `${a.label} - ${a.price || 0} CHF`).join("\n")
        : (order.services?.package?.label ? `${order.services.package.label} - ${order.services.package.price || 0} CHF` : "-");
      const pricingSummaryLines = [`Zwischensumme: ${order.pricing?.subtotal || 0} CHF`];
      if (order.pricing?.discount > 0) pricingSummaryLines.push(`Rabatt: -${order.pricing.discount} CHF`);
      pricingSummaryLines.push(`MwSt (8.1%): ${order.pricing?.vat || 0} CHF`);
      pricingSummaryLines.push(`Total: ${order.pricing?.total || 0} CHF`);
      const pricingSummary = pricingSummaryLines.join("\n");
      const photographerName = order.photographer?.name || "";
      const photographerKey = order.photographer?.key || "";
      const photographerEmail =
        (await resolvePhotographerCalendarEmail(String(photographerKey).toLowerCase())) ||
        order.photographer?.email ||
        "";
      const photographerPhone = PHOTOG_PHONES[String(photographerKey).toLowerCase()] || "";
      const portalMagicLink = await createCustomerPortalMagicLink(order.billing || {}, { sessionDays: 14 }).catch(() => null);
      const emailData = buildCustomerEmail({
        objectInfo,
        serviceListWithPrice,
        pricingSummary,
        date: order.schedule?.date,
        time: order.schedule?.time,
        photographerName,
        photographerKey,
        photographerEmail,
        photographerPhone,
        billing: order.billing || {},
        keyPickup: order.keyPickup || {},
        orderNo: order.orderNo,
        address: order.address || order.billing?.street || "",
        icsUrl: `${frontendBase}/api/orders/${order.orderNo}/ics`,
        portalMagicLink,
      }, customerLang);
      subject = emailData.subject;
      html = emailData.html;
      text = emailData.text;
    }

    try {
      const result = await sendMailWithFallback({
        to: customerEmail,
        subject,
        html,
        text,
        context: `admin-resend-email:${orderNo}:${emailType}`
      });
      return res.json({ ok: true, sent: true, to: customerEmail, via: result.method });
    } catch (err) {
      console.error("[resend-email] send failed", err?.message || err);
      return res.status(500).json({ error: "Failed to send email", message: String(err?.message || err) });
    }
  } catch (err) {
    console.error("[resend-email] error", err?.message || err);
    res.status(500).json({ error: err.message || "Resend failed" });
  }
});

// Status-E-Mails erneut senden (ohne Statuswechsel)
app.post("/api/admin/orders/:orderNo/resend-status-emails", requireAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    if (!Number.isFinite(orderNo)) return res.status(400).json({ error: "Invalid order number" });

    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => Number(o.orderNo) === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const { sendEmailTargets } = req.body || {};
    const targets = {
      customer: sendEmailTargets?.customer === true,
      office: sendEmailTargets?.office === true,
      photographer: sendEmailTargets?.photographer === true,
      cc: sendEmailTargets?.cc === true,
    };

    const pool = db.getPool ? db.getPool() : null;
    const sendFn = (to, subj, html, text) => sendMailWithFallback({
      to,
      subject: subj,
      html,
      text,
      context: `admin-resend-status:${orderNo}`,
    });
    const vars = templateRenderer.buildTemplateVars(order, {});
    const sideEffects = getResendEmailEffectsForStatus(order.status);
    const sendList = [];
    for (const effect of sideEffects) {
      const EFFECT_MAP = {
        "email.confirmed_customer": { templateKey: "confirmed_customer", role: "customer" },
        "email.confirmed_office": { templateKey: "confirmed_office", role: "office" },
        "email.confirmed_photographer": { templateKey: "confirmed_photographer", role: "photographer" },
        "email.paused_customer": { templateKey: "paused_customer", role: "customer" },
        "email.paused_office": { templateKey: "paused_office", role: "office" },
        "email.paused_photographer": { templateKey: "paused_photographer", role: "photographer" },
        "email.provisional_created": { templateKey: "provisional_created", role: "customer" },
      };
      const mapping = EFFECT_MAP[effect];
      if (mapping && targets[mapping.role]) sendList.push(mapping);
    }

    let sent = 0;
    if (pool && sendList.length > 0) {
      for (const { templateKey, role } of sendList) {
        let recipient = null;
        if (role === "customer") recipient = order.billing?.email || order.customerEmail;
        else if (role === "office") recipient = OFFICE_EMAIL;
        else if (role === "photographer") recipient = order.photographer?.email;
        if (recipient) {
          await templateRenderer.sendMailIdempotent(pool, templateKey, recipient, orderNo, vars, sendFn)
            .then((result) => {
              if (result && result.sent === true) sent++;
            })
            .catch(e => console.error("[resend-status-emails] mail fehler", templateKey, e?.message));
        }
      }
    }

    return res.json({ ok: true, sent });
  } catch (err) {
    console.error("[resend-status-emails] error", err?.message || err);
    res.status(500).json({ error: err.message || "Resend status emails failed" });
  }
});

// Shared ICS helper (Kunden-Template aus DB, Fallback wie frueher)
async function serveIcs(order, orderNo, res) {
  const date = order.schedule?.date || order.appointmentDate?.slice(0, 10);
  const time = order.schedule?.time || order.appointmentDate?.slice(11, 16) || "09:00";
  if (!date) { res.status(400).json({ error: "No appointment date available" }); return; }
  const durationMin = order.schedule?.durationMin || 90;
  const location = order.address || order.billing?.street || "";
  const stableUid = `propus-order-${orderNo}@propus.ch`;
  let summary = `Propus Termin #${orderNo}`;
  let desc = [
    `Bestellung: #${orderNo}`,
    order.customerName ? `Kunde: ${order.customerName}` : null,
    order.services?.package?.label ? `Paket: ${order.services.package.label}` : null,
  ].filter(Boolean).join("\n");
  const pool = db.getPool ? db.getPool() : null;
  if (pool) {
    try {
      const evType = String(order.status || "").toLowerCase() === "confirmed" ? "confirmed" : undefined;
      const rendered = await renderStoredCalendarTemplate(pool, "customer_event", order, { eventType: evType });
      summary = rendered.subject || summary;
      desc = rendered.body || desc;
    } catch (err) {
      console.warn("[ics] customer template failed, fallback", err?.message);
    }
  }
  const { icsContent } = buildIcsEvent({
    title: summary,
    description: desc,
    location: location || "-",
    date,
    time,
    durationMin,
    uid: stableUid,
    method: "PUBLISH",
  });
  res.set("Content-Type", "text/calendar; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="order-${orderNo}.ics"`);
  res.send(icsContent);
}

// ICS calendar export - public (for customer email links, no auth required)
app.get("/api/orders/:orderNo/ics", async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    if (!Number.isFinite(orderNo)) return res.status(400).json({ error: "Invalid order number" });
    const order = process.env.DATABASE_URL
      ? await db.getOrderByNo(orderNo)
      : (await loadOrders()).find(o => Number(o.orderNo) === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    return await serveIcs(order, orderNo, res);
  } catch (err) {
    console.error("[ics-public] error", err?.message || err);
    res.status(500).json({ error: err.message || "ICS generation failed" });
  }
});

// ICS calendar export for an order (admin, auth required)
app.get("/api/admin/orders/:orderNo/ics", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    if (!Number.isFinite(orderNo)) return res.status(400).json({ error: "Invalid order number" });
    const order = process.env.DATABASE_URL
      ? await db.getOrderByNo(orderNo)
      : (await loadOrders()).find(o => Number(o.orderNo) === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    return await serveIcs(order, orderNo, res);
  } catch (err) {
    console.error("[ics] error", err?.message || err);
    res.status(500).json({ error: err.message || "ICS generation failed" });
  }
});

async function notifyCompletedUploadBatch({ order, batch, storedCount, skippedCount, invalidCount }) {
  let effectiveBatch = batch;
  let effectiveStoredCount = storedCount;
  let effectiveSkippedCount = skippedCount;
  let effectiveInvalidCount = invalidCount;
  const uploadGroupId = String(batch?.uploadGroupId || "").trim();
  const uploadGroupTotalParts = Math.max(1, Number(batch?.uploadGroupTotalParts || 1));
  const uploadGroupPartIndex = Math.max(1, Number(batch?.uploadGroupPartIndex || 1));

  if (uploadGroupId) {
    if (uploadGroupPartIndex < uploadGroupTotalParts) return;
    try {
      const groupBatches = await db.listUploadBatchesByGroupId(uploadGroupId);
      if (groupBatches.length > 0) {
        if (groupBatches.some((entry) => String(entry.status || "") !== "completed")) return;
        const groupFiles = [];
        let totalGroupedBytes = 0;
        const fileLists = await Promise.all(groupBatches.map((b) => db.listUploadBatchFiles(b.id)));
        for (let i = 0; i < groupBatches.length; i++) {
          totalGroupedBytes += Number(groupBatches[i].total_bytes || 0);
          groupFiles.push(...fileLists[i]);
        }
        effectiveStoredCount = groupFiles.filter((entry) => entry.status === "stored").length;
        effectiveSkippedCount = groupFiles.filter((entry) => entry.status === "skipped_duplicate").length;
        effectiveInvalidCount = groupFiles.filter((entry) => entry.status === "skipped_invalid_type").length;
        const lastGroupBatch = groupBatches[groupBatches.length - 1];
        effectiveBatch = {
          ...batch,
          id: uploadGroupId,
          batchFolder: lastGroupBatch?.batch_folder ? String(lastGroupBatch.batch_folder) : batch.batchFolder,
          targetRelativePath: lastGroupBatch?.target_relative_path ? String(lastGroupBatch.target_relative_path) : batch.targetRelativePath,
          targetAbsolutePath: lastGroupBatch?.target_absolute_path ? String(lastGroupBatch.target_absolute_path) : batch.targetAbsolutePath,
          fileCount: groupFiles.length,
          totalBytes: totalGroupedBytes,
          uploadGroupId,
          uploadGroupTotalParts,
          uploadGroupPartIndex: uploadGroupTotalParts,
        };
      }
    } catch (groupErr) {
      console.warn("[upload-batch] grouped notification aggregation failed:", groupErr?.message || groupErr);
    }
  }

  const groupedUpload = Boolean(uploadGroupId && uploadGroupTotalParts > 1);
  const subject = groupedUpload
    ? `Sammel-Upload auf NAS abgeschlossen - Auftrag #${order.orderNo}`
    : `Upload auf NAS abgeschlossen - Auftrag #${order.orderNo}`;
  const html = `
    <p>${groupedUpload
      ? `Der Sammel-Upload fuer <strong>Auftrag #${order.orderNo}</strong> wurde vollstaendig auf die NAS uebertragen.`
      : `Der Upload fuer <strong>Auftrag #${order.orderNo}</strong> wurde auf die NAS uebertragen.`}</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr><td style="padding:4px 12px 4px 0;color:#888">Adresse</td><td><strong>${order.address || "-"}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Kategorie</td><td>${effectiveBatch.category || "-"}</td></tr>
      ${groupedUpload ? `<tr><td style="padding:4px 12px 4px 0;color:#888">Teilpakete</td><td>${uploadGroupTotalParts}</td></tr>` : ""}
      <tr><td style="padding:4px 12px 4px 0;color:#888">Dateien gesamt</td><td>${effectiveBatch.fileCount || effectiveStoredCount + effectiveSkippedCount + effectiveInvalidCount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Gespeichert</td><td>${effectiveStoredCount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Duplikate</td><td>${effectiveSkippedCount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Ungueltig</td><td>${effectiveInvalidCount}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">Zielpfad</td><td>${effectiveBatch.targetRelativePath || "-"}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#888">${groupedUpload ? "Upload-Gruppe" : "Batch-ID"}</td><td>${effectiveBatch.id}</td></tr>
    </table>
  `;
  const text = [
    subject,
    groupedUpload
      ? `Der Sammel-Upload fuer Auftrag #${order.orderNo} wurde vollstaendig auf die NAS uebertragen.`
      : `Der Upload fuer Auftrag #${order.orderNo} wurde auf die NAS uebertragen.`,
    `Adresse: ${order.address || "-"}`,
    `Kategorie: ${effectiveBatch.category || "-"}`,
    ...(groupedUpload ? [`Teilpakete: ${uploadGroupTotalParts}`] : []),
    `Dateien gesamt: ${effectiveBatch.fileCount || effectiveStoredCount + effectiveSkippedCount + effectiveInvalidCount}`,
    `Gespeichert: ${effectiveStoredCount}`,
    `Duplikate: ${effectiveSkippedCount}`,
    `Ungueltig: ${effectiveInvalidCount}`,
    `Zielpfad: ${effectiveBatch.targetRelativePath || "-"}`,
    `${groupedUpload ? "Upload-Gruppe" : "Batch-ID"}: ${effectiveBatch.id}`,
  ].join("\n");
  try {
    if (mailer) {
      await mailer.sendMail({ from: MAIL_FROM, to: OFFICE_EMAIL, subject, html, text });
    } else {
      const graphResult = await sendMailViaGraph(OFFICE_EMAIL, subject, html, text, null);
      assertMailSent(graphResult, `upload-batch:${order.orderNo}:office`);
    }
  } catch (mailErr) {
    console.warn("[upload-batch] office notification failed:", mailErr?.message || mailErr);
  }
}

app.get("/api/admin/storage/health", requireAdmin, (_req, res) => {
  try {
    const roots = getStorageHealth();
    res.json({ ok: true, roots });
  } catch (err) {
    res.status(500).json({ error: err.message || "Storage-Health konnte nicht geladen werden" });
  }
});

app.get("/api/admin/orders/:orderNo/storage", requireAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderNo = Number(req.params.orderNo);
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const folders = await getOrderFolderSummary(order, db, { createMissing: false });
    const batchRows = await db.listUploadBatches(orderNo, { limit: 20 });
    const batches = (await Promise.all(batchRows.map((entry) => getBatchWithFiles(db, entry.id)))).filter(Boolean);
    res.json({
      ok: true,
      orderNo,
      orderAddress: String(order.address || ""),
      roots: getStorageHealth(),
      folders,
      batches,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Storage-Status konnte nicht geladen werden" });
  }
});

app.post("/api/admin/orders/:orderNo/storage/provision", requireAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderNo = Number(req.params.orderNo);
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const folders = await getOrderFolderSummary(order, db, { createMissing: true });
    res.json({ ok: true, folders });
  } catch (err) {
    res.status(400).json({ error: err.message || "Ordner konnten nicht erstellt werden" });
  }
});

app.post("/api/admin/orders/:orderNo/storage/link", requireAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderNo = Number(req.params.orderNo);
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    await linkExistingOrderFolder(order, db, {
      folderType: req.body?.folderType,
      relativePath: req.body?.relativePath,
    });
    const folders = await getOrderFolderSummary(order, db, { createMissing: false });
    res.json({ ok: true, folders });
  } catch (err) {
    res.status(400).json({ error: err.message || "Ordner konnte nicht verknuepft werden" });
  }
});

app.delete("/api/admin/orders/:orderNo/storage/folder", requireAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderNo = Number(req.params.orderNo);
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const folderType = String(req.query.folderType || "");
    if (!folderType) return res.status(400).json({ error: "folderType fehlt" });
    await archiveOrderFolder(order, db, folderType);
    const folders = await getOrderFolderSummary(order, db, { createMissing: false });
    res.json({ ok: true, folders });
  } catch (err) {
    res.status(400).json({ error: err.message || "Ordner konnte nicht archiviert werden" });
  }
});

app.post("/api/admin/orders/:orderNo/upload-chunked/init", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ error: "Upload-Batches benoetigen eine aktive DB" });
    }
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const payload = req.body || {};
    const initialized = initChunkedUpload({
      orderNo: orderAccess.orderNo,
      filename: payload.filename,
      size: payload.size,
      type: payload.type,
      lastModified: payload.lastModified,
      sessionId: payload.sessionId,
    });
    return res.json({ ok: true, ...initialized });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Chunked-Upload konnte nicht initialisiert werden" });
  }
});

app.post("/api/admin/orders/:orderNo/upload-chunked/status", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ error: "Upload-Batches benoetigen eine aktive DB" });
    }
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const status = getChunkedUploadStatus({
      orderNo: orderAccess.orderNo,
      uploadId: req.body?.uploadId,
    });
    return res.json({ ok: true, ...status });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Chunk-Status konnte nicht geladen werden" });
  }
});

app.post("/api/admin/orders/:orderNo/upload-chunked/part", requirePhotographerOrAdmin, async (req, res) => {
  try {
    req.setTimeout(CHUNKED_UPLOAD_TIMEOUT_MS);
    try {
      await runChunkPartUpload(req, res);
    } catch (uploadErr) {
      if (uploadErr instanceof multer.MulterError) {
        if (uploadErr.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: `Chunk zu gross (max. ${CHUNK_SIZE_MB} MB)` });
        }
        return res.status(400).json({ error: uploadErr.message || "Chunk-Upload fehlgeschlagen" });
      }
      throw uploadErr;
    }
    if (!process.env.DATABASE_URL) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(503).json({ error: "Upload-Batches benoetigen eine aktive DB" });
    }
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) {
      if (req.file?.path) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    }
    if (!req.file?.path) return res.status(400).json({ error: "Chunk-Datei fehlt" });
    const saved = saveChunkPart({
      orderNo: orderAccess.orderNo,
      uploadId: req.body?.uploadId,
      index: req.body?.index,
      tempFilePath: req.file.path,
    });
    return res.json(saved);
  } catch (err) {
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
    }
    return res.status(400).json({ error: err.message || "Chunk konnte nicht gespeichert werden" });
  }
});

app.post("/api/admin/orders/:orderNo/upload-chunked/complete", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ error: "Upload-Batches benoetigen eine aktive DB" });
    }
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const completed = await completeChunkedUpload({
      orderNo: orderAccess.orderNo,
      uploadId: req.body?.uploadId,
    });
    return res.json(completed);
  } catch (err) {
    return res.status(400).json({ error: err.message || "Chunked-Upload konnte nicht abgeschlossen werden" });
  }
});

app.post("/api/admin/orders/:orderNo/upload-chunked/finalize", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ error: "Upload-Batches benoetigen eine aktive DB" });
    }
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const payload = req.body || {};
    const batch = await finalizeChunkedSession({
      db,
      order: orderAccess.order,
      orderNo: orderAccess.orderNo,
      sessionId: payload.sessionId,
      category: payload.category,
      uploadMode: payload.uploadMode,
      folderType: payload.folderType,
      batchFolderName: payload.batchFolderName || payload.newFolderName,
      comment: payload.comment,
      uploadedBy: req.user?.name || req.user?.email || req.photographerName || req.photographerKey || "Unbekannt",
      conflictMode: payload.conflictMode,
      customFolderName: payload.customFolderName,
      uploadGroupId: payload.uploadGroupId,
      uploadGroupTotalParts: payload.uploadGroupTotalParts,
      uploadGroupPartIndex: payload.uploadGroupPartIndex,
    }, {
      stageUploadBatchFromPaths,
      enqueueBatchTransfer,
      loadOrder: async (orderNo) => db.getOrderByNo(orderNo),
    });
    return res.json({ ok: true, batch });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Chunked-Session konnte nicht finalisiert werden" });
  }
});
app.post("/api/admin/orders/:orderNo/upload", requirePhotographerOrAdmin, async (req, res) => {
  try {
    try {
      await runBookingMaterialUpload(req, res);
    } catch (uploadErr) {
      if (uploadErr instanceof multer.MulterError) {
        if (uploadErr.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ error: `Datei zu gross (max. ${BOOKING_UPLOAD_MAX_FILE_MB} MB pro Datei)` });
        }
        return res.status(400).json({ error: uploadErr.message || "Upload fehlgeschlagen" });
      }
      throw uploadErr;
    }

    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ error: "Upload-Batches benoetigen eine aktive DB" });
    }

    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });

    const batch = await stageUploadBatch({
      db,
      order: orderAccess.order,
      files: Array.isArray(req.files) ? req.files : [],
      category: req.body?.category,
      uploadMode: req.body?.uploadMode,
      batchFolderName: req.body?.batchFolderName || req.body?.newFolderName,
      comment: req.body?.comment,
      uploadedBy: req.user?.name || req.user?.email || req.photographerName || req.photographerKey || "Unbekannt",
      folderType: req.body?.folderType,
      conflictMode: req.body?.conflictMode,
      customFolderName: req.body?.customFolderName,
      uploadGroupId: req.body?.uploadGroupId,
      uploadGroupTotalParts: req.body?.uploadGroupTotalParts,
      uploadGroupPartIndex: req.body?.uploadGroupPartIndex,
    });

    enqueueBatchTransfer(db, batch.id, {
      loadOrder: async (orderNo) => db.getOrderByNo(orderNo),
      notifyCompleted: notifyCompletedUploadBatch,
    });

    res.json({ ok: true, batch });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload fehlgeschlagen" });
  }
});

app.get("/api/admin/orders/:orderNo/upload-batches", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const rows = await db.listUploadBatches(orderAccess.orderNo, { limit: Number(req.query.limit || 20) });
    const batches = (await Promise.all(rows.map((row) => getBatchWithFiles(db, row.id)))).filter(Boolean);
    res.json({ ok: true, batches });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload-Batches konnten nicht geladen werden" });
  }
});

app.get("/api/admin/orders/:orderNo/upload-batches/:batchId", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const batch = await getBatchWithFiles(db, req.params.batchId);
    if (!batch || Number(batch.orderNo) !== Number(orderAccess.orderNo)) {
      return res.status(404).json({ error: "Upload-Batch nicht gefunden" });
    }
    res.json({ ok: true, batch });
  } catch (err) {
    res.status(500).json({ error: err.message || "Upload-Batch konnte nicht geladen werden" });
  }
});

app.post("/api/admin/orders/:orderNo/upload-batches/:batchId/retry", requireAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderNo = Number(req.params.orderNo);
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const batch = await retryBatchTransfer(db, req.params.batchId, {
      loadOrder: async (targetOrderNo) => db.getOrderByNo(targetOrderNo),
      notifyCompleted: notifyCompletedUploadBatch,
    });
    res.json({ ok: true, batch });
  } catch (err) {
    res.status(400).json({ error: err.message || "Retry konnte nicht gestartet werden" });
  }
});

app.get("/api/admin/orders/:orderNo/uploads", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const folderType = String(req.query.folderType || "customer_folder");
    const folders = await getOrderFolderSummary(orderAccess.order, db, { createMissing: false });
    const folder = folders.find((entry) => entry.folderType === folderType);
    const baseDir = folder?.exists ? folder.absolutePath : null;
    const tree = baseDir ? listUploadTree(baseDir, "") : [];
    res.json({
      ok: true,
      orderNo: orderAccess.orderNo,
      folderType,
      folderName: folder?.displayName || "",
      rootPath: folder?.relativePath || "",
      exists: !!folder?.exists,
      tree,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Dateiliste laden fehlgeschlagen" });
  }
});

app.get("/api/admin/orders/:orderNo/uploads/file", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const folderType = String(req.query.folderType || "customer_folder");
    const relativePath = String(req.query.path || "").trim();
    if (!relativePath) return res.status(400).json({ error: "Pfad fehlt" });
    const link = await db.getOrderFolderLink(orderAccess.orderNo, folderType);
    if (!link) return res.status(404).json({ error: "Ordner nicht verknuepft" });
    const normalizedRelative = path.normalize(relativePath).replace(/^([/\\])+/, "");
    const fullPath = path.resolve(link.absolute_path, normalizedRelative);
    if (!isPathInside(link.absolute_path, fullPath)) return res.status(400).json({ error: "Ungueltiger Pfad" });
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return res.status(404).json({ error: "Datei nicht gefunden" });
    res.setHeader("Content-Disposition", `inline; filename=\"${path.basename(fullPath)}\"`);
    res.sendFile(fullPath);
  } catch (err) {
    res.status(500).json({ error: err.message || "Dateiabruf fehlgeschlagen" });
  }
});

app.delete("/api/admin/orders/:orderNo/uploads/file", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const folderType = String(req.query.folderType || "customer_folder");
    const relativePath = String(req.query.path || "").trim();
    if (!relativePath) return res.status(400).json({ error: "Pfad fehlt" });
    const link = await db.getOrderFolderLink(orderAccess.orderNo, folderType);
    if (!link) return res.status(404).json({ error: "Ordner nicht verknuepft" });
    const normalizedRelative = path.normalize(relativePath).replace(/^([/\\])+/, "");
    const fullPath = path.resolve(link.absolute_path, normalizedRelative);
    if (!isPathInside(link.absolute_path, fullPath)) return res.status(400).json({ error: "Ungueltiger Pfad" });
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return res.status(404).json({ error: "Datei nicht gefunden" });
    fs.unlinkSync(fullPath);
    if (folderType === "customer_folder") {
      deleteMatchingWebsizeDerivative(link.absolute_path, fullPath);
    }
    res.json({ ok: true, deleted: path.basename(fullPath) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Loeschen fehlgeschlagen" });
  }
});

app.delete("/api/admin/orders/:orderNo/uploads/folder", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const folderType = String(req.query.folderType || "customer_folder");
    const relativePath = String(req.query.path || "").trim();
    if (!relativePath) return res.status(400).json({ error: "Pfad fehlt" });
    const link = await db.getOrderFolderLink(orderAccess.orderNo, folderType);
    if (!link) return res.status(404).json({ error: "Ordner nicht verknuepft" });
    const normalizedRelative = path.normalize(relativePath).replace(/^([/\\])+/, "");
    const fullPath = path.resolve(link.absolute_path, normalizedRelative);
    if (!isPathInside(link.absolute_path, fullPath)) return res.status(400).json({ error: "Ungueltiger Pfad" });
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) return res.status(404).json({ error: "Ordner nicht gefunden" });
    const deleted = clearDirectoryContentsRecursive(fullPath);
    if (folderType === "customer_folder") {
      deleteMatchingWebsizeFolder(link.absolute_path, fullPath);
    }
    res.json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message || "Ordner leeren fehlgeschlagen" });
  }
});

app.post("/api/admin/orders/:orderNo/uploads/websize-sync", requirePhotographerOrAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderAccess = await getOrderForUploadAccess(req.params.orderNo, req);
    if (orderAccess.error) return res.status(orderAccess.error.status).json({ error: orderAccess.error.message });
    const link = await db.getOrderFolderLink(orderAccess.orderNo, "customer_folder");
    if (!link) return res.status(404).json({ error: "Kundenordner nicht verknuepft" });
    if (!fs.existsSync(link.absolute_path) || !fs.statSync(link.absolute_path).isDirectory()) {
      return res.status(404).json({ error: "Kundenordner nicht gefunden" });
    }
    const stats = await syncWebsizeForOrderFolder(link.absolute_path, console);
    res.json({ ok: true, stats });
  } catch (err) {
    res.status(500).json({ error: err.message || "Websize-Sync fehlgeschlagen" });
  }
});


// ==============================
// Admin Orders CRUD (restored from v2.3.134)
// ==============================

app.get("/api/admin/orders", requirePhotographerOrAdmin, async (req, res) => {
  let orders = await loadOrders();
  if (req.photographerKey) {
    // Mitarbeiter: nur eigene Auftr\u00e4ge
    orders = orders.filter(o => (o.photographer?.key || "") === req.photographerKey);
  }
  orders.sort((a,b) => (b.orderNo || 0) - (a.orderNo || 0));
  res.json({ orders });
});

// Bestellungsdetails bearbeiten (billing, object, address, notes)
app.patch("/api/admin/orders/:orderNo", requireAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    if (!Number.isFinite(orderNo)) return res.status(400).json({ error: "Invalid order number" });
    const body = req.body || {};
    let existingOrder = null;
    let fallbackOrders = null;

    if (process.env.DATABASE_URL) {
      existingOrder = await db.getOrderByNo(orderNo);
      if (!existingOrder) return res.status(404).json({ error: "Order not found" });
    } else {
      fallbackOrders = await loadOrders();
      existingOrder = fallbackOrders.find((o) => o.orderNo === orderNo);
      if (!existingOrder) return res.status(404).json({ error: "Order not found" });
    }

    const updateFields = {};

    if (body.billing && typeof body.billing === "object") {
      const b = body.billing;
      const existingBilling = existingOrder?.billing && typeof existingOrder.billing === "object"
        ? existingOrder.billing
        : {};
      const mergedBilling = { ...existingBilling };
      const hasOwn = (key) => Object.prototype.hasOwnProperty.call(b, key);

      if (hasOwn("salutation")) mergedBilling.salutation = String(b.salutation || "");
      if (hasOwn("first_name")) mergedBilling.first_name = String(b.first_name || "");
      if (hasOwn("company")) mergedBilling.company = String(b.company || "");
      if (hasOwn("company_email")) mergedBilling.company_email = String(b.company_email || "");
      if (hasOwn("company_phone")) mergedBilling.company_phone = String(b.company_phone || "");
      if (hasOwn("name")) mergedBilling.name = String(b.name || "");
      if (hasOwn("email")) mergedBilling.email = String(b.email || "");
      if (hasOwn("phone")) mergedBilling.phone = String(b.phone || "");
      if (hasOwn("phone_mobile")) mergedBilling.phone_mobile = String(b.phone_mobile || "");
      if (hasOwn("onsiteName")) mergedBilling.onsiteName = String(b.onsiteName || "");
      if (hasOwn("onsitePhone")) mergedBilling.onsitePhone = String(b.onsitePhone || "");
      if (hasOwn("street")) mergedBilling.street = String(b.street || "");
      if (hasOwn("zip")) mergedBilling.zip = String(b.zip || "");
      if (hasOwn("city")) mergedBilling.city = String(b.city || "");
      if (hasOwn("zipcity")) mergedBilling.zipcity = String(b.zipcity || "");
      if (hasOwn("order_ref")) mergedBilling.order_ref = String(b.order_ref || "");
      if (hasOwn("notes")) mergedBilling.notes = String(b.notes || "");
      if (hasOwn("alt_company")) mergedBilling.alt_company = String(b.alt_company || "");
      if (hasOwn("alt_company_email")) mergedBilling.alt_company_email = String(b.alt_company_email || "");
      if (hasOwn("alt_company_phone")) mergedBilling.alt_company_phone = String(b.alt_company_phone || "");
      if (hasOwn("alt_street")) mergedBilling.alt_street = String(b.alt_street || "");
      if (hasOwn("alt_zip")) mergedBilling.alt_zip = String(b.alt_zip || "");
      if (hasOwn("alt_city")) mergedBilling.alt_city = String(b.alt_city || "");
      if (hasOwn("alt_zipcity")) mergedBilling.alt_zipcity = String(b.alt_zipcity || "");
      if (hasOwn("alt_salutation")) mergedBilling.alt_salutation = String(b.alt_salutation || "");
      if (hasOwn("alt_first_name")) mergedBilling.alt_first_name = String(b.alt_first_name || "");
      if (hasOwn("alt_name")) mergedBilling.alt_name = String(b.alt_name || "");
      if (hasOwn("alt_email")) mergedBilling.alt_email = String(b.alt_email || "");
      if (hasOwn("alt_phone")) mergedBilling.alt_phone = String(b.alt_phone || "");
      if (hasOwn("alt_phone_mobile")) mergedBilling.alt_phone_mobile = String(b.alt_phone_mobile || "");

      if (!mergedBilling.zipcity) {
        mergedBilling.zipcity = [mergedBilling.zip, mergedBilling.city].filter(Boolean).join(" ");
      }
      if (!mergedBilling.alt_zipcity) {
        mergedBilling.alt_zipcity = [mergedBilling.alt_zip, mergedBilling.alt_city].filter(Boolean).join(" ");
      }

      updateFields.billing = JSON.stringify(mergedBilling);
    }

    if (body.object && typeof body.object === "object") {
      const o = body.object;
      updateFields.object = JSON.stringify({
        type: String(o.type || ""),
        area: o.area ?? "",
        floors: o.floors ?? "",
        rooms: o.rooms ?? "",
        desc: String(o.desc || ""),
      });
    }

    if (typeof body.address === "string") {
      updateFields.address = body.address;
    }

    if (body.services && typeof body.services === "object") {
      const s = body.services;
      updateFields.services = JSON.stringify({
        package: s.package && typeof s.package === "object"
          ? { key: String(s.package.key || ""), label: String(s.package.label || ""), price: Number(s.package.price) || 0 }
          : {},
        addons: Array.isArray(s.addons)
          ? s.addons.map(a => ({ id: String(a.id || ""), label: String(a.label || ""), price: Number(a.price) || 0, ...(a.qty !== undefined ? { qty: Number(a.qty) || 1 } : {}) }))
          : [],
      });
    }

    if (body.pricing && typeof body.pricing === "object") {
      const p = body.pricing;
      updateFields.pricing = JSON.stringify({
        subtotal: Number(p.subtotal) || 0,
        discount: Number(p.discount) || 0,
        vat: Number(p.vat) || 0,
        total: Number(p.total) || 0,
      });
    }

    if (body.keyPickup !== undefined) {
      updateFields.key_pickup = body.keyPickup
        ? JSON.stringify({ address: String(body.keyPickup.address || ""), notes: String(body.keyPickup.notes || "") })
        : null;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    if (process.env.DATABASE_URL) {
      await db.updateOrderFields(orderNo, updateFields);
    } else {
      const order = existingOrder;
      if (updateFields.billing) order.billing = JSON.parse(updateFields.billing);
      if (updateFields.object) order.object = JSON.parse(updateFields.object);
      if (updateFields.address !== undefined) order.address = updateFields.address;
      if (updateFields.services) order.services = JSON.parse(updateFields.services);
      if (updateFields.pricing) order.pricing = JSON.parse(updateFields.pricing);
      if (updateFields.key_pickup !== undefined) order.keyPickup = updateFields.key_pickup ? JSON.parse(updateFields.key_pickup) : null;
      await saveAllOrders(fallbackOrders || []);
    }

    res.json({ ok: true, orderNo });
  } catch (err) {
    console.error("[order-update] error", err.message);
    res.status(500).json({ error: err.message || "Update fehlgeschlagen" });
  }
});

const DEFAULT_EMAIL_WORKFLOW_CONFIG = [
  { status_to: "provisional", template_key: "provisional_created", role: "customer", active: true },
  { status_to: "confirmed", template_key: "confirmed_customer", role: "customer", active: true },
  { status_to: "confirmed", template_key: "confirmed_office", role: "office", active: true },
  { status_to: "confirmed", template_key: "confirmed_photographer", role: "photographer", active: true },
  { status_to: "paused", template_key: "paused_customer", role: "customer", active: true },
  { status_to: "paused", template_key: "paused_office", role: "office", active: true },
  { status_to: "paused", template_key: "paused_photographer", role: "photographer", active: true },
  { status_to: "cancelled", template_key: "cancelled_customer", role: "customer", active: true },
  { status_to: "cancelled", template_key: "cancelled_office", role: "office", active: true },
  { status_to: "cancelled", template_key: "cancelled_photographer", role: "photographer", active: true },
];

async function seedEmailWorkflowConfig(pool) {
  if (!pool) return;
  for (const row of DEFAULT_EMAIL_WORKFLOW_CONFIG) {
    await pool.query(
      `INSERT INTO email_workflow_config (status_to, template_key, role, active)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (status_to, template_key, role) DO NOTHING`,
      [row.status_to, row.template_key, row.role, row.active]
    );
  }
}

async function getEmailWorkflowConfigMap(pool, statusTo) {
  if (!pool || !statusTo) return new Map();
  const { rows } = await pool.query(
    `SELECT template_key, role, active, ics_customer, ics_office
     FROM email_workflow_config
     WHERE status_to = $1`,
    [String(statusTo).toLowerCase()]
  );
  const map = new Map();
  for (const row of rows || []) {
    map.set(`${row.template_key}::${row.role}`, {
      active: row.active === true,
      ics_customer: row.ics_customer === true,
      ics_office: row.ics_office === true,
    });
  }
  return map;
}

function isEmailWorkflowEntryActive(configMap, templateKey, role) {
  const key = `${templateKey}::${role}`;
  if (!configMap.has(key)) return true;
  const entry = configMap.get(key);
  return typeof entry === "object" ? entry.active === true : entry === true;
}

function getEmailWorkflowIcsFlags(configMap, templateKey, role) {
  const key = `${templateKey}::${role}`;
  if (!configMap.has(key)) return { ics_customer: false, ics_office: false };
  const entry = configMap.get(key);
  if (typeof entry !== "object") return { ics_customer: false, ics_office: false };
  return { ics_customer: entry.ics_customer === true, ics_office: entry.ics_office === true };
}

// Status -ndern (inkl. archived) - mit State-Machine-Validierung
app.patch("/api/admin/orders/:orderNo/status", requireAdmin, async (req, res) => {
  const orderNo = Number(req.params.orderNo);
  const { status, reason } = req.body || {};

  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Ung-ltiger Status", valid: VALID_STATUSES });
  }
  const orders = await loadOrders();
  const order = orders.find(o => o.orderNo === orderNo);
  if(!order){
    return res.status(404).json({ error: "Order not found" });
  }

  const prevStatus = String(order.status || "").toLowerCase();

// State-Machine: Uebergang pruefen
  const transitionErr = getTransitionError(prevStatus, status, order);
  if (transitionErr) {
    return res.status(422).json({ error: transitionErr, from: prevStatus, to: status });
  }

  // Side Effects ermitteln und ausfuehren (hinter Feature Flags - workflow-effects.js)
  const sideEffects = getSideEffects(prevStatus, status);
  const sendEmails = resolveAdminSendEmails(req.body);
  const sendEmailTargets = resolveAdminEmailTargets(req.body);
  console.log("[status] transition", { orderNo, from: prevStatus, to: status, sideEffects });

  // Kalender-Side-Effects (Phase 2): provisional, upgrade, create_final
  // Loeschen bei cancelled/done/completed laeuft weiterhin im becomingFinal-Block unten
  const calendarCreateEffects = sideEffects.filter(function(e) {
    return e === "calendar.create_provisional" || e === "calendar.upgrade_to_final" || e === "calendar.create_final";
  });
  if (calendarCreateEffects.length) {
    try {
      await executeSideEffects(order, calendarCreateEffects, {
        graphClient,
        OFFICE_EMAIL,
        PHOTOG_PHONES,
        getSetting,
        db,
      });
    } catch (fxErr) {
      console.error("[status] workflow-effects Fehler:", fxErr && fxErr.message);
    }
  }

  const poolForWorkflow = db.getPool ? db.getPool() : null;
  if (poolForWorkflow) {
    await seedEmailWorkflowConfig(poolForWorkflow).catch(() => {});
  }
  const workflowConfigMap = await getEmailWorkflowConfigMap(poolForWorkflow, status).catch(() => new Map());

  // E-Mail-Versand bei Status-Wechsel: nur an angehakte Empfaenger, in email_send_log
  if (sendEmails && status !== "cancelled") {
    const sendList = getEmailSendListForAdminStatus(sideEffects, req.body).filter(({ templateKey, role }) =>
      isEmailWorkflowEntryActive(workflowConfigMap, templateKey, role)
    );
    const pool = db.getPool ? db.getPool() : null;
    if (pool && sendList.length > 0) {
      const vars = templateRenderer.buildTemplateVars(order, {});
      const orderObj = { ...order, orderNo, order_no: orderNo };
      let icsContentForSend = null;
      if (order.schedule?.date && order.schedule?.time) {
        try {
          const evTypeSt = String(order.status || "").toLowerCase() === "confirmed" ? "confirmed" : undefined;
          let titleIcs = buildCalendarSubject({ title: `Auftrag #${orderNo}`, orderNo });
          let descIcs = `Auftrag #${orderNo}`;
          if (pool) {
            const rIcs = await renderStoredCalendarTemplate(pool, "customer_event", order, { eventType: evTypeSt });
            titleIcs = rIcs.subject || titleIcs;
            descIcs = rIcs.body || descIcs;
          }
          const { icsContent } = buildIcsEvent({
            title: titleIcs,
            description: descIcs,
            location: order.address || "-",
            date: order.schedule.date,
            time: order.schedule.time,
            durationMin: order.schedule.durationMin || 60,
            uid: order.icsUid || undefined,
          });
          icsContentForSend = icsContent;
        } catch (_e) {}
      }
      for (const { templateKey, role } of sendList) {
        let recipient = null;
        if (role === "customer") recipient = order.billing?.email;
        else if (role === "office") recipient = OFFICE_EMAIL;
        else if (role === "photographer") recipient = order.photographer?.email;
        if (recipient) {
          const { ics_customer, ics_office } = getEmailWorkflowIcsFlags(workflowConfigMap, templateKey, role);
          const shouldAttachIcs = (role === "customer" && ics_customer) || (role === "office" && ics_office);
          const icsAttachment = (shouldAttachIcs && icsContentForSend)
            ? [{ filename: "Termin.ics", content: icsContentForSend, contentType: "text/calendar; method=REQUEST" }]
            : null;
          const sendFn = (to, subj, html, text) => sendMailWithFallback({
            to,
            subject: subj,
            html,
            text,
            icsAttachments: icsAttachment,
            context: `status-change:${orderNo}:${templateKey}:${role}`,
          });
          await templateRenderer.sendMailIdempotent(pool, templateKey, recipient, orderNo, vars, sendFn).catch(e => console.error("[status] mail fehler", templateKey, e?.message));
        }
      }
      if (shouldSendAttendeeNotifications(sideEffects, req.body) && (order.attendeeEmails || order.attendee_emails)) {
        await templateRenderer.sendAttendeeNotifications(pool, { ...orderObj, attendeeEmails: order.attendeeEmails || order.attendee_emails }, "confirmed", sendFn).catch(e => console.error("[status] attendee fehler", e?.message));
      }
    }
  }

    const becomingFinal = (status === "cancelled" || status === "completed" || status === "done" || status === "archived") && prevStatus !== status;

  // Bei Absage ODER Erledigt: Kalender-Events loeschen
  const deletedEvents = [];
  let deletedPhotographerEvent = false;
  let deletedOfficeEvent = false;
  if (becomingFinal && graphClient) {
    if (order.photographerEventId && order.photographer?.email) {
      try {
        await graphClient.api(`/users/${order.photographer.email}/events/${order.photographerEventId}`).delete();
        deletedEvents.push("photographer");
        deletedPhotographerEvent = true;
        console.log("[status] photographer event deleted", { orderNo, status, eventId: order.photographerEventId });
      } catch (err) {
        console.error("[status] photographer event delete failed", err?.message || err);
      }
    }
    if (order.officeEventId && OFFICE_EMAIL) {
      try {
        await graphClient.api(`/users/${OFFICE_EMAIL}/events/${order.officeEventId}`).delete();
        deletedEvents.push("office");
        deletedOfficeEvent = true;
        console.log("[status] office event deleted", { orderNo, status, eventId: order.officeEventId });
      } catch (err) {
        console.error("[status] office event delete failed", err?.message || err);
      }
    }

    // Damit bei sp-teren Aktionen nichts "h-ngen bleibt"
    if (deletedPhotographerEvent) order.photographerEventId = null;
    if (deletedOfficeEvent) order.officeEventId = null;
  }

  // F-r UI-Debug/Transparenz
  if (deletedEvents.length) order.deletedEvents = deletedEvents;

  // Bei Absage zus-tzlich: ICS + Mails
  if (status === "cancelled" && prevStatus !== "cancelled") {

    // ICS-Cancellation erstellen (wenn icsUid vorhanden)
    let cancelAttachments = [];
    if(order.icsUid && order.schedule?.date && order.schedule?.time){
      const { icsContent: cancelIcs } = buildIcsEvent({
        title: `ABGESAGT: Auftrag #${orderNo}`,
        description: "Dieser Termin wurde abgesagt.",
        location: order.address || "-",
        date: order.schedule.date,
        time: order.schedule.time,
        durationMin: order.schedule.durationMin || 60,
        uid: order.icsUid,
        method: "CANCEL"
      });
      cancelAttachments = [{ filename: "Absage.ics", content: cancelIcs, contentType: "text/calendar; method=CANCEL" }];
    }

    // Absage-Mails via Graph API verschicken (umgeht SMTP-Throttling)
    // Kein ICS-Anhang n-tig - Graph API l-scht die Events direkt
    const icsAtt = null;

    const sendCancelMails = sendEmails && (graphClient || mailer);
    if (sendCancelMails) {
      const cancelMailsSent = [];
      const pool = db.getPool ? db.getPool() : null;

      // 1) Office-Mail (nur wenn angehakt)
      if (sendEmailTargets.office && isEmailWorkflowEntryActive(workflowConfigMap, "cancelled_office", "office")) try {
        const photogPhone = PHOTOG_PHONES[order.photographer?.key] || "-";
        const officeLang = process.env.OFFICE_LANG || "de";
        const officeCancel = buildCancellationOfficeEmail(order, photogPhone, officeLang);
        const officeResult = await sendMailWithFallback({
          to: OFFICE_EMAIL,
          subject: officeCancel.subject,
          html: officeCancel.html,
          text: officeCancel.text,
          icsAttachment: icsAtt,
          context: `cancel:${orderNo}:office`,
        });
        if (officeResult && officeResult.sent) {
          cancelMailsSent.push("office");
          if (pool) { await pool.query("INSERT INTO email_send_log (idempotency_key, order_no, template_key, recipient) VALUES ($1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING", [orderNo + "_cancelled_office_" + String(OFFICE_EMAIL).toLowerCase(), orderNo, "cancelled_office", OFFICE_EMAIL]).catch(() => {}); }
        }
        console.log("[cancel] office mail sent");
      } catch(err){
        console.error("[cancel] office mail failed", err?.message || err);
      }

      // 2) Fotograf-Mail (nur wenn angehakt)
      if (sendEmailTargets.photographer && order.photographer?.email && isEmailWorkflowEntryActive(workflowConfigMap, "cancelled_photographer", "photographer")){
        try {
          let cancelLang = "de";
          if (db.getPool && db.getPool() && order.photographer?.key) {
            try { const { rows: _nl } = await db.getPool().query("SELECT native_language FROM photographer_settings WHERE photographer_key=$1",[order.photographer.key]); if(_nl[0]?.native_language) cancelLang=_nl[0].native_language; } catch(e){}
          }
          const photogCancel = buildCancellationPhotographerEmail(order, cancelLang);
          const photogResult = await sendMailWithFallback({
            to: order.photographer.email,
            subject: photogCancel.subject,
            html: photogCancel.html,
            text: photogCancel.text,
            icsAttachment: icsAtt,
            context: `cancel:${orderNo}:photographer`,
          });
          if (photogResult && photogResult.sent) {
            cancelMailsSent.push("photographer");
            if (pool) { await pool.query("INSERT INTO email_send_log (idempotency_key, order_no, template_key, recipient) VALUES ($1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING", [orderNo + "_cancelled_photographer_" + String(order.photographer.email).toLowerCase(), orderNo, "cancelled_photographer", order.photographer.email]).catch(() => {}); }
          }
          console.log("[cancel] photographer mail sent");
        } catch(err){
          console.error("[cancel] photographer mail failed", err?.message || err);
        }
      }

      // 3) Kunden-Mail (nur wenn angehakt)
      if (sendEmailTargets.customer && order.billing?.email && isEmailWorkflowEntryActive(workflowConfigMap, "cancelled_customer", "customer")){
        try {
          const billing = order.billing || {};
          const customerLang = order.billing?.language || billing?.language || "de";
          const custCancel = buildCancellationCustomerEmail(order, PHOTOG_PHONES[order.photographer?.key] || "-", customerLang);
          const customerResult = await sendMailWithFallback({
            to: order.billing.email,
            subject: custCancel.subject,
            html: custCancel.html,
            text: custCancel.text,
            icsAttachment: icsAtt,
            context: `cancel:${orderNo}:customer`,
          });
          if (customerResult && customerResult.sent) {
            cancelMailsSent.push("customer");
            if (pool) { await pool.query("INSERT INTO email_send_log (idempotency_key, order_no, template_key, recipient) VALUES ($1,$2,$3,$4) ON CONFLICT (idempotency_key) DO NOTHING", [orderNo + "_cancelled_customer_" + String(order.billing.email).toLowerCase(), orderNo, "cancelled_customer", order.billing.email]).catch(() => {}); }
          }
          console.log("[cancel] customer mail sent");
        } catch(err){
          console.error("[cancel] customer mail failed", err?.message || err);
        }
      }

      console.log("[cancel] mails sent via Graph", { orderNo, cancelMailsSent });
    } else {
      console.error("[cancel] no mail transport available (graph/smtp), cannot send cancel mails");
    }
  }

  order.status = status;
  const nowIso = new Date().toISOString();
  if (status === "done" && prevStatus !== "done") {
    order.doneAt = nowIso;
    order.closedAt = nowIso;
  }
  if (status !== "done") {
    order.doneAt = null;
  }
  if (status === "cancelled" && reason) {
    order.cancelReason = String(reason).slice(0, 500);
  }
  if (status === "paused" && reason) {
    order.pauseReason = String(reason).slice(0, 500);
  }

  // Provisorische Buchung: Metadaten setzen
  if (status === "provisional" && prevStatus !== "provisional") {
    order.provisionalBookedAt = nowIso;
    order.provisionalExpiresAt = calcProvisionalExpiresAt(nowIso).toISOString();
    order.provisionalReminder1SentAt = null;
    order.provisionalReminder2SentAt = null;
  }
  // Provisorium aufheben: Felder zuruecksetzen
  if (prevStatus === "provisional" && (status === "pending" || status === "cancelled")) {
    order.provisionalBookedAt = null;
    order.provisionalExpiresAt = null;
    order.provisionalReminder1SentAt = null;
    order.provisionalReminder2SentAt = null;
  }

  order.updatedAt = nowIso;
  if (process.env.DATABASE_URL) {
    const updateFields = { status };
    if (status === "done" && prevStatus !== "done") {
      updateFields.done_at = nowIso;
      updateFields.closed_at = nowIso;
    }
    if (status !== "done") updateFields.done_at = null;
    if (becomingFinal && deletedPhotographerEvent) updateFields.photographer_event_id = null;
    if (becomingFinal && deletedOfficeEvent) updateFields.office_event_id = null;
    if (status === "cancelled" && reason) updateFields.cancel_reason = String(reason).slice(0, 500);
    if (status === "paused" && reason) updateFields.pause_reason = String(reason).slice(0, 500);
    if (status === "provisional" && prevStatus !== "provisional") {
      updateFields.provisional_booked_at = nowIso;
      updateFields.provisional_expires_at = calcProvisionalExpiresAt(nowIso).toISOString();
      updateFields.provisional_reminder_1_sent_at = null;
      updateFields.provisional_reminder_2_sent_at = null;
    }
    if (prevStatus === "provisional" && (status === "pending" || status === "cancelled")) {
      updateFields.provisional_booked_at = null;
      updateFields.provisional_expires_at = null;
      updateFields.provisional_reminder_1_sent_at = null;
      updateFields.provisional_reminder_2_sent_at = null;
    }
    await db.updateOrderFields(orderNo, updateFields);
  } else {
    saveAllOrdersToJson(orders);
  }
  res.json({ ok: true, orderNo, status, sideEffects });
});

app.get("/api/admin/orders/:orderNo/email-log", requireAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    if (!Number.isFinite(orderNo)) return res.status(400).json({ error: "Invalid order number" });

    const order = process.env.DATABASE_URL
      ? await db.getOrderByNo(orderNo)
      : (await loadOrders()).find((o) => Number(o.orderNo) === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const pool = db.getPool ? db.getPool() : null;
    if (!pool) {
      return res.json({ ok: true, entries: [], availability: "no_db" });
    }

    const { rows } = await pool.query(
      `SELECT id, template_key, recipient, sent_at, template_language
       FROM email_send_log
       WHERE order_no = $1
       ORDER BY sent_at DESC NULLS LAST, id DESC`,
      [orderNo]
    );

    const entries = rows.map((row) => {
      let sentAt = row.sent_at;
      if (sentAt instanceof Date) {
        sentAt = sentAt.toISOString();
      } else if (sentAt && typeof sentAt === "object" && typeof sentAt.toISOString === "function") {
        sentAt = sentAt.toISOString();
      } else if (sentAt != null) {
        sentAt = String(sentAt);
      } else {
        sentAt = null;
      }
      return {
        id: Number(row.id),
        template_key: String(row.template_key || ""),
        recipient: String(row.recipient || ""),
        sent_at: sentAt,
        template_language: row.template_language ? String(row.template_language) : null,
      };
    });

    res.json({ ok: true, entries, availability: "available" });
  } catch (err) {
    console.error("[email-log] load failed", err?.message || err);
    res.status(500).json({ error: err.message || "Email log load failed" });
  }
});


app.get("/api/admin/orders/:orderNo/messages", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => o.orderNo === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (req.photographerKey) {
      const orderPhotogKey = String(order.photographer?.key || "").toLowerCase();
      if (!orderPhotogKey || orderPhotogKey !== String(req.photographerKey || "").toLowerCase()) {
        return res.status(403).json({ error: "Nur eigene Auftraege erlaubt" });
      }
    }
    const messages = await listOrderMessages(orderNo);
    res.json({ ok: true, messages });
  } catch (err) {
    res.status(500).json({ error: err.message || "Nachrichten laden fehlgeschlagen" });
  }
});

app.post("/api/admin/orders/:orderNo/message", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const message = sanitizeMessageText(req.body?.message);
    if (!message) return res.status(400).json({ error: "Nachricht erforderlich" });
    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => o.orderNo === orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const fromPhotographer = !!req.photographerKey;
    let recipientRoles = normalizeRecipientRoles(req.body?.to);
    let senderName = "Admin";
    let senderRole = "admin";

    if (fromPhotographer) {
      const orderPhotogKey = String(order.photographer?.key || "").toLowerCase();
      if (!orderPhotogKey || orderPhotogKey !== String(req.photographerKey || "").toLowerCase()) {
        return res.status(403).json({ error: "Nur eigene Auftraege erlaubt" });
      }
      recipientRoles = ["customer"];
      senderRole = "photographer";
      senderName = req.photographerName || req.photographerKey || "Fotograf";
    } else {
      if (!recipientRoles.length) return res.status(400).json({ error: "Bitte mindestens einen Empf-nger w-hlen" });
    }

    const sent = await sendOrderMessageMails({
      order,
      orderNo,
      senderLabel: senderName,
      senderRole,
      recipientRoles,
      message
    });
    const msg = await addOrderMessage({
      orderNo,
      senderRole,
      senderName,
      recipientRoles,
      message
    });
    res.json({ ok: true, sent, message: msg });
  } catch (err) {
    res.status(500).json({ error: err.message || "Nachricht senden fehlgeschlagen" });
  }
});

app.get("/api/admin/orders/:orderNo/chat", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await getOrderForChat(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canPhotographerAccessOrder(order, req.photographerKey)) {
      return res.status(403).json({ error: "Nur eigene Auftraege erlaubt" });
    }

    const actorRole = req.photographerKey ? "photographer" : "admin";
    const availability = getChatAvailability(order, actorRole);
    if (!availability.readable) return res.status(403).json({ error: "Chat fuer diesen Auftrag nicht verfuegbar" });

    const messages = await listChatMessages(orderNo);
    res.json({ ok: true, messages, availability });
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat laden fehlgeschlagen" });
  }
});

app.post("/api/admin/orders/:orderNo/chat/message", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await getOrderForChat(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canPhotographerAccessOrder(order, req.photographerKey)) {
      return res.status(403).json({ error: "Nur eigene Auftraege erlaubt" });
    }

    const actorRole = req.photographerKey ? "photographer" : "admin";
    if (!isChatWritable(order, actorRole)) return res.status(403).json({ error: "Chat ist nicht mehr schreibbar" });
    const message = sanitizeMessageText(req.body?.message);
    if (!message) return res.status(400).json({ error: "Nachricht erforderlich" });

    const senderRole = req.photographerKey ? "photographer" : "admin";
    const senderName = req.photographerName || req.photographerKey || "Admin";
    const msg = await addChatMessage({
      orderNo,
      senderRole,
      senderId: String(req.photographerKey || "admin"),
      senderName,
      message,
    });

    const customerEmail = String(order.billing?.email || order.customerEmail || "").trim();
    if (senderRole === "photographer") {
      scheduleMailIfUnread({
        orderNo,
        msgId: msg.id,
        recipientEmail: customerEmail,
        recipientRole: "customer",
        senderName: msg.senderName,
      });
    } else {
      const photographerEmail = String(
        (await resolvePhotographerCalendarEmail(order.photographer?.key)) ||
          order.photographer?.email ||
          ""
      ).trim();
      scheduleMailIfUnread({
        orderNo,
        msgId: msg.id,
        recipientEmail: customerEmail,
        recipientRole: "customer",
        senderName: msg.senderName,
      });
      scheduleMailIfUnread({
        orderNo,
        msgId: msg.id,
        recipientEmail: photographerEmail,
        recipientRole: "photographer",
        senderName: msg.senderName,
      });
    }
    broadcastChat(orderNo, msg);
    res.json({ ok: true, message: msg, availability: getChatAvailability(order, actorRole) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat-Nachricht senden fehlgeschlagen" });
  }
});

app.patch("/api/admin/orders/:orderNo/chat/read", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await getOrderForChat(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canPhotographerAccessOrder(order, req.photographerKey)) {
      return res.status(403).json({ error: "Nur eigene Auftraege erlaubt" });
    }
    const actorRole = req.photographerKey ? "photographer" : "admin";
    if (!isChatReadable(order, actorRole)) return res.status(403).json({ error: "Chat fuer diesen Auftrag nicht verfuegbar" });

    const changed = req.photographerKey
      ? await markChatRead(orderNo, "photographer")
      : (await markChatRead(orderNo, "photographer")) + (await markChatRead(orderNo, "customer"));
    res.json({ ok: true, changed });
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat-Lesestatus aktualisieren fehlgeschlagen" });
  }
});

app.get("/api/admin/orders/:orderNo/chat/events", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    const order = await getOrderForChat(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canPhotographerAccessOrder(order, req.photographerKey)) {
      return res.status(403).json({ error: "Nur eigene Auftraege erlaubt" });
    }
    const actorRole = req.photographerKey ? "photographer" : "admin";
    if (!isChatReadable(order, actorRole)) return res.status(403).json({ error: "Chat fuer diesen Auftrag nicht verfuegbar" });

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    addChatSseClient(orderNo, "photographer", res);
    const ping = setInterval(() => {
      try {
        res.write("event: ping\ndata: {}\n\n");
      } catch (_) {}
    }, 30000);
    req.on("close", () => {
      clearInterval(ping);
      removeChatSseClient(orderNo, "photographer", res);
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Chat-Eventstream fehlgeschlagen" });
  }
});


app.patch("/api/admin/orders/:orderNo/reschedule", requireAdmin, async (req, res) => {
  const orderNo = Number(req.params.orderNo);
  const { date, time, durationMin: durationMinRaw } = req.body || {};
  if(!date || !time){
    return res.status(400).json({ error: "Datum und Uhrzeit erforderlich" });
  }
  const orders = await loadOrders();
  const order = orders.find(o => o.orderNo === orderNo);
  if(!order){
    return res.status(404).json({ error: "Order not found" });
  }
  if(order.status === "cancelled"){
    return res.status(400).json({ error: "Abgesagte Bestellungen k\u00f6nnen nicht verschoben werden" });
  }

  const oldDate = order.schedule?.date || "";
  const oldTime = order.schedule?.time || "";
  const durationMin = durationMinRaw === undefined ? Number(order.schedule?.durationMin || 60) : Number(durationMinRaw);
  if (!Number.isFinite(durationMin) || durationMin <= 0) {
    return res.status(400).json({ error: "Gueltige Dauer erforderlich" });
  }
  const timingChanged = oldDate !== date || oldTime !== time;
  const photographerKey = String(order.photographer?.key || "").toLowerCase();
  const photographerName = order.photographer?.name || "";
  const resolvedCalEmail = await resolvePhotographerCalendarEmail(photographerKey);
  const deleteMailbox =
    String(order.photographer?.email || "").trim() || resolvedCalEmail || "";
  const workMailbox =
    resolvedCalEmail || String(order.photographer?.email || "").trim() || "";

  console.log("[reschedule] start", { orderNo, oldDate, oldTime, newDate: date, newTime: time, durationMin, timingChanged });

  // 1) Alte Kalender-Events loeschen
  if(graphClient){
    if(order.photographerEventId && deleteMailbox){
      try {
        await graphClient.api(`/users/${deleteMailbox}/events/${order.photographerEventId}`).delete();
        console.log("[reschedule] old photographer event deleted");
      } catch(err){ console.error("[reschedule] old photographer event delete failed", err?.message); }
    }
    if(order.officeEventId && OFFICE_EMAIL){
      try {
        await graphClient.api(`/users/${OFFICE_EMAIL}/events/${order.officeEventId}`).delete();
        console.log("[reschedule] old office event deleted");
      } catch(err){ console.error("[reschedule] old office event delete failed", err?.message); }
    }
  }

  // 2) Order updaten
  order.schedule = order.schedule || {};
  order.schedule.date = date;
  order.schedule.time = time;
  order.schedule.durationMin = durationMin;
  order.photographerEventId = null;
  order.officeEventId = null;
  order.icsUid = null;
  order.updatedAt = new Date().toISOString();

  // 3) Neue Kalender-Events erstellen
  if(graphClient && workMailbox){
    try {
      const poolRs = db.getPool ? db.getPool() : null;
      const photogPhoneRs = PHOTOG_PHONES[photographerKey] || "—";
      const zipCity = order.billing?.zipcity || "";
      const titleText = getTitleSafe(order.address, zipCity);
      const evTypeRs = String(order.status || "").toLowerCase() === "confirmed" ? "confirmed" : undefined;
      let calDescription;
      let calendarSubject;
      if (poolRs) {
        const r = await renderStoredCalendarTemplate(poolRs, "photographer_event", order, {
          photogPhone: photogPhoneRs,
          eventType: evTypeRs,
        });
        calDescription = r.body;
        calendarSubject = r.subject;
      } else {
        const objectInfo = buildObjectInfoSafe(order.object, order.address);
        const servicesText = [
          order.services?.package?.label || "",
          ...(order.services?.addons || []).map(a => a.label)
        ].filter(Boolean).join("\n");
        calDescription = buildCalendarContent({
          objectInfo,
          address: order.address,
          object: order.object || {},
          servicesText,
          billing: order.billing,
          keyPickup: order.keyPickup,
          photographer: { name: photographerName, phone: photogPhoneRs, email: order.photographer?.email || "" },
          orderNo,
        });
        calendarSubject = buildCalendarSubject({ title: titleText, orderNo, eventType: evTypeRs });
      }

      const photogEvent = await createPhotographerEvent({
        orderNo, photographerEmail: workMailbox, photographerName,
        subject: calendarSubject, date, time, durationMin,
        title: titleText, addressText: order.address, description: calDescription
      });
      order.photographerEventId = photogEvent?.id || null;
      order.calendarCreated = true;
      console.log("[reschedule] new photographer event created");

      const officeEvent = await createOfficeEvent({
        subject: calendarSubject, date, time, durationMin,
        addressText: order.address, description: calDescription
      });
      order.officeEventId = officeEvent?.id || null;
      order.officeCalendarCreated = true;
      console.log("[reschedule] new office event created");

      // ICS
      const { icsContent, uid: newIcsUid } = buildIcsEvent({
        title: calendarSubject, description: calDescription.replace(/<[^>]+>/g, ""),
        location: order.address || "-", date, time, durationMin
      });
      order.icsUid = newIcsUid;
    } catch(err){
      console.error("[reschedule] calendar event creation failed", err?.message);
    }
  }

  if (process.env.DATABASE_URL) {
    await db.updateOrderFields(orderNo, {
      schedule: JSON.stringify(order.schedule),
      photographer_event_id: order.photographerEventId || null,
      office_event_id: order.officeEventId || null,
      ics_uid: order.icsUid || null,
      ...(workMailbox && order.photographer
        ? { photographer: JSON.stringify(order.photographer) }
        : {}),
    });
  } else {
    saveAllOrdersToJson(orders);
  }

  // 4) Mails nur senden, wenn sich Datum/Uhrzeit geaendert haben.
  // Reine Daueranpassungen aktualisieren den Kalender stillschweigend.
  if(graphClient && timingChanged){
    const rsPhotogPhone = PHOTOG_PHONES[order.photographer?.key] || "-";
    try {
      const officeLang = process.env.OFFICE_LANG || "de";
      const officeMail = buildRescheduleOfficeEmail(order, oldDate, oldTime, date, time, rsPhotogPhone, officeLang);
      const officeResult = await sendMailWithFallback({
        to: OFFICE_EMAIL,
        subject: officeMail.subject,
        html: officeMail.html,
        text: officeMail.text,
        context: `reschedule:${orderNo}:office`,
      });
      assertMailSent(officeResult, `reschedule:${orderNo}:office`);
      console.log("[reschedule] office mail sent");
    } catch(err){ console.error("[reschedule] office mail failed", err?.message); }

    if(workMailbox){
      try {
        let rsLang = "de";
        if (db.getPool && db.getPool() && order.photographer?.key) {
          try { const { rows: _nl } = await db.getPool().query("SELECT native_language FROM photographer_settings WHERE photographer_key=$1",[order.photographer.key]); if(_nl[0]?.native_language) rsLang=_nl[0].native_language; } catch(e){}
        }
        const photogMail = buildReschedulePhotographerEmail(order, oldDate, oldTime, date, time, rsLang);
        const photogResult = await sendMailWithFallback({
          to: workMailbox,
          subject: photogMail.subject,
          html: photogMail.html,
          text: photogMail.text,
          context: `reschedule:${orderNo}:photographer`,
        });
        assertMailSent(photogResult, `reschedule:${orderNo}:photographer`);
        console.log("[reschedule] photographer mail sent");
      } catch(err){ console.error("[reschedule] photographer mail failed", err?.message); }
    }

    if(order.billing?.email){
      try {
        const billing = order.billing || {};
        const customerLang = order.billing?.language || billing?.language || "de";
        const custMail = buildRescheduleCustomerEmail(order, oldDate, oldTime, date, time, rsPhotogPhone, customerLang);
        const customerResult = await sendMailWithFallback({
          to: order.billing.email,
          subject: custMail.subject,
          html: custMail.html,
          text: custMail.text,
          context: `reschedule:${orderNo}:customer`,
        });
        assertMailSent(customerResult, `reschedule:${orderNo}:customer`);
        console.log("[reschedule] customer mail sent");
      } catch(err){ console.error("[reschedule] customer mail failed", err?.message); }
    }
  } else if (!timingChanged) {
    console.log("[reschedule] duration-only update -> no emails sent");
  }

  console.log("[reschedule] done", { orderNo, newDate: date, newTime: time, durationMin, timingChanged });
  res.json({ ok: true, orderNo, schedule: { date, time, durationMin }, emailsSent: timingChanged });
});

// Fotograf -ndern
app.patch("/api/admin/orders/:orderNo/photographer", requireAdmin, async (req, res) => {
  const orderNo = Number(req.params.orderNo);
  const { photographerKey: newKey } = req.body || {};
  if(!newKey){
    return res.status(400).json({ error: "photographerKey erforderlich" });
  }
  const orders = await loadOrders();
  const order = orders.find(o => o.orderNo === orderNo);
  if(!order) return res.status(404).json({ error: "Order not found" });
  if(order.status === "cancelled" || order.status === "archived") return res.status(400).json({ error: "Abgesagte/archivierte Bestellungen k\u00f6nnen nicht ge\u00e4ndert werden" });

  const newPhotogCfg = PHOTOGRAPHERS_CONFIG.find(p => p.key === newKey);
  const newPhotogEmail = (await resolvePhotographerCalendarEmail(newKey)) || newPhotogCfg?.email || PHOTOGRAPHERS[newKey] || "";
  const newPhotogName = newPhotogCfg?.name || newKey;
  const oldPhotogName = order.photographer?.name || "-";
  const oldPhotogEmail = order.photographer?.email || "";
  const oldPhotogKey = order.photographer?.key || "";

  if(newKey === oldPhotogKey){
    return res.status(400).json({ error: "Gleicher Fotograf bereits zugewiesen" });
  }

  console.log("[reassign] start", { orderNo, oldPhotog: oldPhotogName, newPhotog: newPhotogName });

  // 1) Alten Fotografen-Event loeschen
  if(graphClient && order.photographerEventId && oldPhotogEmail){
    try {
      await graphClient.api(`/users/${oldPhotogEmail}/events/${order.photographerEventId}`).delete();
      console.log("[reassign] old photographer event deleted");
    } catch(err){ console.error("[reassign] old photographer event delete failed", err?.message); }
  }

  // 2) Alten Office-Event loeschen und neu erstellen (mit neuem Fotografen-Info)
  if(graphClient && order.officeEventId && OFFICE_EMAIL){
    try {
      await graphClient.api(`/users/${OFFICE_EMAIL}/events/${order.officeEventId}`).delete();
      console.log("[reassign] old office event deleted");
    } catch(err){ console.error("[reassign] old office event delete failed", err?.message); }
  }

  // 3) Order updaten
  order.photographer = { key: newKey, name: newPhotogName, email: newPhotogEmail };
  order.photographerEventId = null;
  order.officeEventId = null;
  order.icsUid = null;
  order.updatedAt = new Date().toISOString();

  // 4) Neue Events erstellen
  const date = order.schedule?.date;
  const time = order.schedule?.time;
  const durationMin = order.schedule?.durationMin || 60;

  if(graphClient && newPhotogEmail && date && time){
    try {
      const objectInfo = buildObjectInfoSafe(order.object, order.address);
      const servicesText = [
        order.services?.package?.label || "",
        ...(order.services?.addons || []).map(a => a.label)
      ].filter(Boolean).join("\n");
      const zipCity = order.billing?.zipcity || "";
      const titleText = getTitleSafe(order.address, zipCity);
      const calDescription = buildCalendarContent({
        objectInfo, servicesText, billing: order.billing, keyPickup: order.keyPickup,
        photographer: { name: newPhotogName, phone: PHOTOG_PHONES[newKey] || "-" }
      });
      const calendarSubject = buildCalendarSubject({ title: titleText, orderNo });

      const photogEvent = await createPhotographerEvent({
        orderNo, photographerEmail: newPhotogEmail, photographerName: newPhotogName,
        subject: calendarSubject, date, time, durationMin,
        title: titleText, addressText: order.address, description: calDescription
      });
      order.photographerEventId = photogEvent?.id || null;
      console.log("[reassign] new photographer event created");

      const officeEvent = await createOfficeEvent({
        subject: calendarSubject, date, time, durationMin,
        addressText: order.address, description: calDescription
      });
      order.officeEventId = officeEvent?.id || null;
      console.log("[reassign] new office event created");

      const { uid: newIcsUid } = buildIcsEvent({
        title: calendarSubject, description: calDescription.replace(/<[^>]+>/g, ""),
        location: order.address || "-", date, time, durationMin
      });
      order.icsUid = newIcsUid;
    } catch(err){
      console.error("[reassign] calendar creation failed", err?.message);
    }
  }

  if (process.env.DATABASE_URL) {
    await db.updateOrderFields(orderNo, {
      photographer: JSON.stringify(order.photographer),
      photographer_event_id: order.photographerEventId || null,
      office_event_id: order.officeEventId || null,
      ics_uid: order.icsUid || null,
    });
  } else {
    saveAllOrdersToJson(orders);
  }

  // 5) Mails via Graph API
  const oldPhotogObj = { name: oldPhotogName, email: oldPhotogEmail, phone: PHOTOG_PHONES[oldPhotogKey] || "-" };
  const newPhotogObj = { name: newPhotogName, email: newPhotogEmail, phone: PHOTOG_PHONES[newKey] || "-" };
  if(graphClient){
    // Office
    try {
      const officeLang = process.env.OFFICE_LANG || "de";
      const m = buildReassignOfficeEmail(order, oldPhotogObj, newPhotogObj, officeLang);
      const officeResult = await sendMailWithFallback({
        to: OFFICE_EMAIL,
        subject: m.subject,
        html: m.html,
        text: m.text,
        context: `reassign:${orderNo}:office`,
      });
      assertMailSent(officeResult, `reassign:${orderNo}:office`);
      console.log("[reassign] office mail sent");
    } catch(err){ console.error("[reassign] office mail failed", err?.message); }

    // Alter Fotograf (abgegeben)
    if(oldPhotogEmail){
      try {
        let oldLang = "de";
        if (db.getPool && db.getPool() && oldPhotogKey) {
          try { const { rows: _nl } = await db.getPool().query("SELECT native_language FROM photographer_settings WHERE photographer_key=$1",[oldPhotogKey]); if(_nl[0]?.native_language) oldLang=_nl[0].native_language; } catch(e){}
        }
        const m = buildReassignPhotographerEmail(order, "old", newPhotogObj, oldLang);
        const oldPhotogResult = await sendMailWithFallback({
          to: oldPhotogEmail,
          subject: m.subject,
          html: m.html,
          text: m.text,
          context: `reassign:${orderNo}:old-photographer`,
        });
        assertMailSent(oldPhotogResult, `reassign:${orderNo}:old-photographer`);
        console.log("[reassign] old photographer mail sent");
      } catch(err){ console.error("[reassign] old photographer mail failed", err?.message); }
    }

    // Neuer Fotograf (-bernommen)
    if(newPhotogEmail){
      try {
        let newLang = "de";
        if (db.getPool && db.getPool() && newKey) {
          try { const { rows: _nl } = await db.getPool().query("SELECT native_language FROM photographer_settings WHERE photographer_key=$1",[newKey]); if(_nl[0]?.native_language) newLang=_nl[0].native_language; } catch(e){}
        }
        const m = buildReassignPhotographerEmail(order, "new", oldPhotogObj, newLang);
        const newPhotogResult = await sendMailWithFallback({
          to: newPhotogEmail,
          subject: m.subject,
          html: m.html,
          text: m.text,
          context: `reassign:${orderNo}:new-photographer`,
        });
        assertMailSent(newPhotogResult, `reassign:${orderNo}:new-photographer`);
        console.log("[reassign] new photographer mail sent");
      } catch(err){ console.error("[reassign] new photographer mail failed", err?.message); }
    }

    // Kunde
    if(order.billing?.email){
      try {
        const billing = order.billing || {};
        const customerLang = order.billing?.language || billing?.language || "de";
        const m = buildReassignCustomerEmail(order, newPhotogObj, customerLang);
        const customerResult = await sendMailWithFallback({
          to: order.billing.email,
          subject: m.subject,
          html: m.html,
          text: m.text,
          context: `reassign:${orderNo}:customer`,
        });
        assertMailSent(customerResult, `reassign:${orderNo}:customer`);
        console.log("[reassign] customer mail sent");
      } catch(err){ console.error("[reassign] customer mail failed", err?.message); }
    }
  }

  console.log("[reassign] done", { orderNo, newPhotog: newPhotogName });
  res.json({ ok: true, orderNo, photographer: { key: newKey, name: newPhotogName } });
});

// Bestellung loeschen
app.delete("/api/admin/orders/:orderNo", requireAdmin, async (req, res) => {
  const orderNo = Number(req.params.orderNo);
  if (process.env.DATABASE_URL) {
    const order = await db.getOrderByNo(orderNo);
    if (!order) return res.status(404).json({ error: "Order not found" });

    // Kalender-Events aufraeumen (sonst bleiben sie im Kalender stehen)
    if (graphClient) {
      const _delKey = String(order.photographer?.key || "").toLowerCase();
      const photographerEmail =
        order.photographer?.email || (await resolvePhotographerCalendarEmail(_delKey));
      if (order.photographerEventId && photographerEmail) {
        try { await graphClient.api(`/users/${photographerEmail}/events/${order.photographerEventId}`).delete(); }
        catch (err) { console.error("[admin-delete] photographer event delete failed", err?.message || err); }
      }
      if (order.officeEventId && OFFICE_EMAIL) {
        try { await graphClient.api(`/users/${OFFICE_EMAIL}/events/${order.officeEventId}`).delete(); }
        catch (err) { console.error("[admin-delete] office event delete failed", err?.message || err); }
      }
    }

    await db.query("DELETE FROM orders WHERE order_no = $1", [orderNo]);
  } else {
    const orders = loadOrdersFromJson();
    const idx = orders.findIndex(o => o.orderNo === orderNo);
    if(idx === -1) return res.status(404).json({ error: "Order not found" });

    const order = orders[idx];
    if (graphClient) {
      const _delKeyJ = String(order.photographer?.key || "").toLowerCase();
      const photographerEmail =
        order.photographer?.email || (await resolvePhotographerCalendarEmail(_delKeyJ));
      if (order.photographerEventId && photographerEmail) {
        try { await graphClient.api(`/users/${photographerEmail}/events/${order.photographerEventId}`).delete(); }
        catch (err) { console.error("[admin-delete] photographer event delete failed", err?.message || err); }
      }
      if (order.officeEventId && OFFICE_EMAIL) {
        try { await graphClient.api(`/users/${OFFICE_EMAIL}/events/${order.officeEventId}`).delete(); }
        catch (err) { console.error("[admin-delete] office event delete failed", err?.message || err); }
      }
    }

    orders.splice(idx, 1);
    saveAllOrdersToJson(orders);
  }
  console.log("[admin] order deleted", { orderNo });
  res.json({ ok: true, orderNo });
});

// Manuelle Bestellung erstellen (telefonische Buchung)
app.post("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const data = normalizeTextDeep(req.body || {});
    const orderNo = nextOrderNumber();
    const photographerKey = String(data.photographerKey || "").toLowerCase();
    const photographerCfg = PHOTOGRAPHERS_CONFIG.find(p => p.key === photographerKey);
    const photographerEmail =
      (await resolvePhotographerCalendarEmail(photographerKey)) ||
      photographerCfg?.email ||
      PHOTOGRAPHERS[photographerKey] ||
      "";
    const photographerName = photographerCfg?.name || photographerKey;

    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const roundingStepSetting = Math.max(0.01, Number((await getSetting("pricing.chfRoundingStep")).value || 0.05));
    const vatRateSetting = Number((await getSetting("pricing.vatRate")).value || 0.081);
    const round05 = (v) => Math.round((Number(v) || 0) / roundingStepSetting) * roundingStepSetting;

    // Robust pricing fallback for manual bookings:
    // if frontend fields are empty/0, rebuild totals from selected package/addons.
    const pkgPriceManual = num(data?.package?.price);
    const addonsSumManual = Array.isArray(data?.addons)
      ? data.addons.reduce((sum, a) => sum + num(a?.price), 0)
      : 0;
    let subtotalManual = num(data.subtotal);
    if (subtotalManual <= 0 && (pkgPriceManual > 0 || addonsSumManual > 0)) {
      subtotalManual = round05(pkgPriceManual + addonsSumManual);
    }
    let discountManual = Math.max(0, num(data.discount));
    if (discountManual > subtotalManual) discountManual = subtotalManual;
    let vatManual = num(data.vat);
    if (vatManual <= 0 && subtotalManual > 0) {
      vatManual = round05((subtotalManual - discountManual) * vatRateSetting);
    }
    let totalManual = num(data.total);
    if (totalManual <= 0 && subtotalManual > 0) {
      totalManual = round05((subtotalManual - discountManual) + vatManual);
    }

    const orderRecord = {
      orderNo,
      createdAt: new Date().toISOString(),
      status: "pending",
      source: "manual",
      address: data.address || "",
      object: {
        type: data.objectType || "",
        area: data.area || "",
        floors: data.floors || 1,
        rooms: data.rooms || "",
        desc: data.desc || ""
      },
      services: {
        package: data.package ? { key: data.package.key, label: data.package.label, price: num(data.package.price) } : {},
        addons: (data.addons || []).map(a => ({ id: a.id||"", label: a.label||"", price: num(a.price) }))
      },
      photographer: { key: photographerKey, name: photographerName, email: photographerEmail },
      schedule: { date: data.date || "", time: data.time || "", durationMin: num(data.durationMin) || 60 },
      billing: {
        company: data.company || "",
        name: data.customerName || "",
        email: data.customerEmail || "",
        phone: data.customerPhone || "",
        onsiteName: data.onsiteName || "",
        onsitePhone: data.onsitePhone || "",
        street: data.street || "",
        zipcity: data.zipcity || "",
        notes: data.notes || ""
      },
      pricing: {
        subtotal: subtotalManual,
        discount: discountManual,
        vat: vatManual,
        total: totalManual
      },
      discountCode: data.discountCode || "",
      keyPickup: data.keyPickup && data.keyPickup.address ? data.keyPickup : null,
      calendarCreated: false,
      officeCalendarCreated: false,
      photographerEventId: null,
      officeEventId: null,
      icsUid: null
    };

    // Kalender-Event erstellen - identisch wie normale Buchung
    let manualIcs = "";
    if (orderRecord.schedule.date && orderRecord.schedule.time && photographerEmail && graphClient) {
      const durationMin = orderRecord.schedule.durationMin || 60;
      const photographerPhone = PHOTOG_PHONES[photographerKey] || "-";

      // Gleiche Funktionen wie bei normaler Buchung
      const objectInfo = buildObjectInfoSafe(orderRecord.object, orderRecord.address);
      // Service-Liste identisch wie bei normaler Buchung aufbauen
      const svcItems = [];
      if (orderRecord.services.package?.label) svcItems.push(orderRecord.services.package.label);
      (orderRecord.services.addons || []).forEach(a => { if(a.label) svcItems.push(a.label); });
      const serviceListNoPrice = svcItems.join("\n") || "-";
      const zipCity = getZipCityFromBillingSafe(orderRecord.billing);
      const titleText = getTitleSafe(orderRecord.address, zipCity);

      const calDescription = buildCalendarContent({
        objectInfo,
        servicesText: serviceListNoPrice,
        billing: orderRecord.billing,
        keyPickup: orderRecord.keyPickup,
        photographer: {
          name: photographerName,
          email: photographerEmail,
          phone: photographerPhone
        }
      });
      const calendarSubject = buildCalendarSubject({ title: titleText, orderNo });

      // ICS-Datei generieren (identisch wie bei normaler Buchung)
      const icsResult = buildIcsEvent({
        title: calendarSubject,
        description: calDescription,
        location: orderRecord.address || "-",
        date: orderRecord.schedule.date,
        time: orderRecord.schedule.time,
        durationMin
      });
      manualIcs = icsResult.icsContent;
      orderRecord.icsUid = icsResult.uid;

      try {
        const evResult = await createPhotographerEvent({
          orderNo, photographerEmail, photographerName,
          subject: calendarSubject,
          date: orderRecord.schedule.date, time: orderRecord.schedule.time,
          durationMin, title: titleText, addressText: orderRecord.address, description: calDescription
        });
        orderRecord.calendarCreated = true;
        orderRecord.photographerEventId = evResult?.id || null;
      } catch(err){ console.error("[manual] photographer event failed", err?.message); }

      try {
        const evResult = await createOfficeEvent({
          subject: calendarSubject,
          date: orderRecord.schedule.date, time: orderRecord.schedule.time,
          durationMin, addressText: orderRecord.address, description: calDescription
        });
        orderRecord.officeCalendarCreated = true;
        orderRecord.officeEventId = evResult?.id || null;
      } catch(err){ console.error("[manual] office event failed", err?.message); }
    }

    const createdByMemberId =
      req.companyMembership?.id != null ? Number(req.companyMembership.id) : null;
    await saveOrder(orderRecord, {
      createdByMemberId: Number.isFinite(createdByMemberId) ? createdByMemberId : null,
    });
    console.log("[manual] order created", { orderNo });

    // E-Mails an alle Parteien senden
    if (data.sendEmails && mailer) {
      const serviceListWithPrice = [];
      if (orderRecord.services.package?.label) serviceListWithPrice.push(`${orderRecord.services.package.label} - ${orderRecord.services.package.price} CHF`);
      (orderRecord.services.addons || []).forEach(a => serviceListWithPrice.push(`${a.label} - ${a.price} CHF`));
      const serviceListNoPrice = [];
      if (orderRecord.services.package?.label) serviceListNoPrice.push(orderRecord.services.package.label);
      (orderRecord.services.addons || []).forEach(a => serviceListNoPrice.push(a.label));

      const objectInfo = [
        `Adresse: ${orderRecord.address}`,
        `Objektart: ${translateObjectType(orderRecord.object.type)}`,
        `Wohn-/Nutzflaeche: ${orderRecord.object.area} m2`,
        `Etagen/Ebene: ${orderRecord.object.floors}`,
        `Zimmer: ${orderRecord.object.rooms || "-"}`,
        `Beschreibung: ${orderRecord.object.desc || "-"}`
      ].join("\n");

      const pricingSummary = [
        `Zwischensumme: ${orderRecord.pricing.subtotal} CHF`,
        orderRecord.pricing.discount > 0 ? `Rabatt: -${orderRecord.pricing.discount} CHF` : null,
        `MwSt (8.1%): ${orderRecord.pricing.vat} CHF`,
        `Total: ${orderRecord.pricing.total} CHF`
      ].filter(Boolean).join("\n");

      const emailData = {
        orderNo,
        objectInfo,
        serviceListWithPrice: serviceListWithPrice.join("\n"),
        serviceListNoPrice: serviceListNoPrice.join("\n"),
        pricingSummary,
        date: orderRecord.schedule.date,
        time: orderRecord.schedule.time,
        photographerName, photographerKey, photographerEmail,
        photographerPhone: PHOTOG_PHONES[photographerKey] || "-",
        billing: orderRecord.billing,
        keyPickup: null
      };

      // ICS-Anhang fuer Mails (falls vorhanden)
      // Kein ICS-Anhang wenn Graph-API Events erstellt werden (sonst Doppel-Eintr-ge)
      const manualIcsAttachments = [];

      // Office Mail
      try {
        const officeLang = process.env.OFFICE_LANG || "de";
        const officeMail = buildOfficeEmail(emailData, officeLang);
        await mailer.sendMail({ from: MAIL_FROM, to: OFFICE_EMAIL, subject: officeMail.subject + " (manuell)", html: officeMail.html, text: officeMail.text });
        console.log("[manual] office mail sent");
      } catch(err){ console.error("[manual] office mail failed", err?.message); }

      // Fotograf Mail (mit ICS-Anhang identisch wie normale Buchung)
      if (photographerEmail) {
        try {
          let manLang = "de";
          if (db.getPool && db.getPool() && photographerKey) {
            try { const { rows: _nl } = await db.getPool().query("SELECT native_language FROM photographer_settings WHERE photographer_key=$1",[photographerKey]); if(_nl[0]?.native_language) manLang=_nl[0].native_language; } catch(e){}
          }
          const photogMail = buildPhotographerEmail(emailData, manLang);
          await mailer.sendMail({ from: MAIL_FROM, to: photographerEmail, subject: photogMail.subject, html: photogMail.html, text: photogMail.text, attachments: manualIcsAttachments });
          console.log("[manual] photographer mail sent");
        } catch(err){ console.error("[manual] photographer mail failed", err?.message); }
      }

      // Kunden Mail (mit ICS-Anhang identisch wie normale Buchung)
      if (orderRecord.billing.email) {
        try {
          const billing = orderRecord.billing || {};
          const customerLang = orderRecord.billing?.language || billing?.language || "de";
          const custMail = buildCustomerEmail(emailData, customerLang);
          await mailer.sendMail({ from: MAIL_FROM, to: orderRecord.billing.email, subject: custMail.subject, html: custMail.html, text: custMail.text, attachments: manualIcsAttachments });
          console.log("[manual] customer mail sent");
        } catch(err){ console.error("[manual] customer mail failed", err?.message); }
      }
    }

    res.json({ ok: true, orderNo });
  } catch(err) {
    console.error("[manual] error", err?.message || err);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Fotografen-Liste fuer Admin-Frontend (auch fuer eingeloggte Mitarbeiter zugaenglich)

app.get("/api/admin/orders/:orderNo", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const orderNo = Number(req.params.orderNo);
    if (!Number.isFinite(orderNo)) {
      return res.status(400).json({ error: "Invalid order number" });
    }

    const order = process.env.DATABASE_URL
      ? await db.getOrderByNo(orderNo)
      : (await loadOrders()).find((o) => Number(o.orderNo) === orderNo);

    if (!order) return res.status(404).json({ error: "Order not found" });
    if (!canPhotographerAccessOrder(order, req.photographerKey)) {
      return res.status(403).json({ error: "Nur eigene Auftraege erlaubt" });
    }

    res.json({ order });
  } catch (err) {
    res.status(500).json({ error: err.message || "Order laden fehlgeschlagen" });
  }
});

// ==============================
// BOT API - Ein Endpoint, alle Befehle
// ==============================
// POST /api/bot  -  { "action": "...", ...params }
// ==============================

app.post("/api/bot", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const action = String(req.body?.action || "").trim();
    if (action === "config") {
      let packages = [];
      let addons = [];
      if (process.env.DATABASE_URL) {
        try {
          const products = await db.listProductsWithRules({ includeInactive: false });
          const formatted = formatCatalogProducts(products);
          packages = (formatted.packages || []).map((p) => ({ key: p.key, label: p.label, price: p.price ?? 0 }));
          addons = (formatted.addons || []).map((a) => ({ id: a.id, label: a.label, price: a.price, unitPrice: a.unitPrice, pricingType: a.pricingType }));
        } catch (_e) { /* DB/Produkte fehlen: leere Listen */ }
      }
      const photographers = (PHOTOGRAPHERS_CONFIG || []).map((p) => ({ key: p.key, name: p.name || p.key }));
      return res.json({ packages, addons, photographers });
    }
    if (action === "pricing") {
      const body = req.body || {};
      const pkgKey = body.package || null;
      const addonIds = Array.isArray(body.addons) ? body.addons : [];
      const products = await db.listProductsWithRules({ includeInactive: false });
      const productByCode = new Map(products.map((p) => [String(p.code), p]));
      const normalizedAddons = addonIds.map((addonInput) => {
        const id = typeof addonInput === "string" ? addonInput : addonInput?.id;
        const product = productByCode.get(String(id || ""));
        return {
          id: String(id || ""),
          qty: typeof addonInput === "object" ? (parseInt(addonInput.qty) || 1) : 1,
          group: product?.group_key || String(id || "").split(":")[0],
          label: product?.name || String(id || ""),
        };
      }).filter((x) => !!x.id);
      const pkgProduct = productByCode.get(String(pkgKey || ""));
      const services = {
        package: pkgProduct ? { key: pkgProduct.code, label: pkgProduct.name } : {},
        addons: normalizedAddons,
      };
      const result = await computePricing({
        services,
        object: { area: Number(body.area) || 0, floors: Number(body.floors) || 1 },
        discountCode: String(body.discountCode || ""),
        customerEmail: String(body.customerEmail || ""),
      });
      return res.json({ ok: true, ...result });
    }
    return res.status(400).json({ error: "Unbekannte action" });
  } catch (err) {
    res.status(500).json({ error: err.message || "Bot action fehlgeschlagen" });
  }
});

app.post("/api/admin/orders/:orderNo/review/resend", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderNo = Number(req.params.orderNo);
    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => o.orderNo === orderNo);
    if (!order) return res.status(404).json({ error: "Auftrag nicht gefunden" });

    // Cooldown pruefen (7 Tage)
    if (order.reviewRequestSentAt) {
      const lastSent = new Date(order.reviewRequestSentAt);
      const cooldownMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastSent.getTime() < cooldownMs) {
        const daysLeft = Math.ceil((cooldownMs - (Date.now() - lastSent.getTime())) / (24 * 60 * 60 * 1000));
        return res.status(429).json({ error: `Cooldown aktiv. Erneut senden in ${daysLeft} Tag(en).` });
      }
    }

    // Token generieren
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO order_reviews (order_no, token) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [orderNo, token]
    );

    const frontendUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
    const reviewLink = `${frontendUrl}/review/${token}`;
    const googleReviewLink = "https://g.page/r/CSQ5RnWmJOumEAE/review";

    // Mail versenden
    const customerEmail = order.billing?.email || "";
    let reviewMailSent = false;
    if (graphClient && customerEmail) {
      const subject = `Wie war Ihr Shooting? Auftrag #${orderNo}`;
      const html = `<p>Guten Tag ${order.billing?.name || ""},</p>
<p>wir hoffen, dass alles zu Ihrer Zufriedenheit war. Wir freuen uns -ber Ihr Feedback:</p>
<p><a href="${reviewLink}">Jetzt bewerten (1-5 Sterne)</a></p>
<p><a href="${googleReviewLink}">Auf Google bewerten</a></p>
<p>Herzliche Gr-sse, Ihr Propus-Team</p>`;
      const mailResult = await sendMailWithFallback({
        to: customerEmail,
        subject,
        html,
        text: "",
        context: `manual-review-request:${orderNo}`,
      });
      reviewMailSent = mailResult && mailResult.sent === true;
    }

    // Timestamp + Count nur bei bestaetigtem Versand aktualisieren
    if (reviewMailSent && process.env.DATABASE_URL) {
      const nowIso = new Date().toISOString();
      await db.updateOrderFields(orderNo, {
        review_request_sent_at: nowIso,
        review_request_count: (order.reviewRequestCount || 0) + 1,
      });
    }

    res.json({ ok: true, orderNo, reviewLink, sentTo: order.billing?.email || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Review als erledigt markieren (ohne Mail)
app.patch("/api/admin/orders/:orderNo/review/dismiss", requireAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const orderNo = Number(req.params.orderNo);
    const nowIso = new Date().toISOString();
    await db.updateOrderFields(orderNo, { review_request_sent_at: nowIso, review_request_count: 1 });
    res.json({ ok: true, orderNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -ffentlich: Review-Token abrufen (kein Login)

if (process.env.DATABASE_URL) {
  setTimeout(() => {
    resumePendingTransfers(db, {
      loadOrder: async (orderNo) => db.getOrderByNo(orderNo),
      notifyCompleted: notifyCompletedUploadBatch,
    })
      .then((count) => {
        if (count > 0) {
          console.log("[upload-batch] resumed pending transfers", { count });
        }
      })
      .catch((err) => {
        console.warn("[upload-batch] resume failed:", err?.message || err);
      });
  }, 2500);

  setTimeout(() => {
    syncWebsizeForAllCustomerFolders(db, console)
      .then((stats) => {
        if (stats.created || stats.updated || stats.deleted) {
          console.log("[websize-sync] initial sync completed", stats);
        }
      })
      .catch((err) => {
        console.warn("[websize-sync] initial sync failed:", err?.message || err);
      });
  }, 6000);

  setInterval(() => {
    syncWebsizeForAllCustomerFolders(db, console)
      .then((stats) => {
        if (stats.created || stats.updated || stats.deleted) {
          console.log("[websize-sync] periodic sync completed", stats);
        }
      })
      .catch((err) => {
        console.warn("[websize-sync] periodic sync failed:", err?.message || err);
      });
  }, 10 * 60 * 1000);
}

// ==============================
// Orders Storage (DB + JSON-Fallback)
// ==============================
function loadOrdersFromJson(){
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8"));
    }
  } catch(e){ console.error("[orders] json load error", e?.message); }
  return [];
}
function saveAllOrdersToJson(orders){
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
  } catch(e){ console.error("[orders] json save error", e?.message); }
}

async function loadOrders(){
  if (process.env.DATABASE_URL) {
    return await db.getOrders();
  }
  return loadOrdersFromJson();
}
async function saveAllOrders(orders){
  // Nur JSON-Fallback - DB wird direkt per insertOrder/updateOrderFields geschrieben
  if (!process.env.DATABASE_URL) {
    saveAllOrdersToJson(orders);
  }
}
function normalizeForCustomerCompare(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .trim();
}
function looksLikeAddressText(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const hasNumber = /\d/.test(raw);
  const hasStreetToken = /(strasse|str\.|weg|gasse|allee|platz|ring|quai|asse|via|rue|road|street|lane|drive)\b/i.test(raw);
  return hasNumber && hasStreetToken;
}
function shouldSkipCustomerUpsert(record) {
  const billingNameRaw = String(record?.billing?.name || "");
  const addressRaw = String(record?.address || "");
  const billingStreetRaw = String(record?.billing?.street || "");
  const billingName = normalizeForCustomerCompare(billingNameRaw);
  if (!billingName) return true;
  const orderAddress = normalizeForCustomerCompare(addressRaw);
  const billingStreet = normalizeForCustomerCompare(billingStreetRaw);
  if (billingName && (billingName === orderAddress || billingName === billingStreet)) return true;
  if (looksLikeAddressText(billingNameRaw)) return true;
  return false;
}
async function saveOrder(record, opts = {}){
  if (process.env.DATABASE_URL) {
    const canUpsertCustomer = !!record.billing?.email && !shouldSkipCustomerUpsert(record);
    if (record.billing?.email && !canUpsertCustomer) {
      console.warn("[orders] skip customer upsert due suspicious billing name", {
        orderNo: record.orderNo,
        billingName: String(record.billing?.name || ""),
        address: String(record.address || ""),
      });
    }
    const customerId = canUpsertCustomer ? await db.upsertCustomer(record.billing) : null;
    const mid = opts.createdByMemberId != null ? Number(opts.createdByMemberId) : null;
    await db.insertOrder(record, customerId, Number.isFinite(mid) ? mid : null);
  } else {
    const orders = loadOrdersFromJson();
    orders.push(record);
    saveAllOrdersToJson(orders);
  }
}

function loadOrderMessagesFromJson(){
  try {
    if (fs.existsSync(ORDER_MESSAGES_FILE)) {
      const rows = JSON.parse(fs.readFileSync(ORDER_MESSAGES_FILE, "utf8"));
      return Array.isArray(rows) ? rows : [];
    }
  } catch(e){ console.error("[order-messages] json load error", e?.message); }
  return [];
}
function saveOrderMessagesToJson(rows){
  try {
    fs.writeFileSync(ORDER_MESSAGES_FILE, JSON.stringify(rows, null, 2));
  } catch(e){ console.error("[order-messages] json save error", e?.message); }
}

async function listOrderMessages(orderNo){
  const num = Number(orderNo);
  if (process.env.DATABASE_URL) {
    const { rows } = await db.query(
      `SELECT id, order_no, sender_role, sender_name, recipient_roles, message, created_at
       FROM order_messages
       WHERE order_no = $1
       ORDER BY created_at ASC`,
      [num]
    );
    return rows.map(r => ({
      id: r.id,
      orderNo: r.order_no,
      senderRole: r.sender_role,
      senderName: r.sender_name || "",
      recipientRoles: Array.isArray(r.recipient_roles) ? r.recipient_roles : (typeof r.recipient_roles === "string" ? JSON.parse(r.recipient_roles || "[]") : []),
      message: r.message || "",
      createdAt: r.created_at
    }));
  }
  const rows = loadOrderMessagesFromJson();
  return rows.filter(r => Number(r.orderNo) === num).sort((a,b)=> new Date(a.createdAt) - new Date(b.createdAt));
}

async function addOrderMessage({ orderNo, senderRole, senderName, recipientRoles, message }){
  const num = Number(orderNo);
  const cleanRecipients = Array.from(new Set((recipientRoles || []).map(x => String(x || "").trim().toLowerCase()).filter(Boolean)));
  if (process.env.DATABASE_URL) {
    const { rows } = await db.query(
      `INSERT INTO order_messages (order_no, sender_role, sender_name, recipient_roles, message)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, order_no, sender_role, sender_name, recipient_roles, message, created_at`,
      [num, String(senderRole || ""), String(senderName || ""), JSON.stringify(cleanRecipients), String(message || "")]
    );
    const r = rows[0];
    return {
      id: r.id,
      orderNo: r.order_no,
      senderRole: r.sender_role,
      senderName: r.sender_name || "",
      recipientRoles: Array.isArray(r.recipient_roles) ? r.recipient_roles : (typeof r.recipient_roles === "string" ? JSON.parse(r.recipient_roles || "[]") : []),
      message: r.message || "",
      createdAt: r.created_at
    };
  }
  const rows = loadOrderMessagesFromJson();
  const rec = {
    id: Date.now(),
    orderNo: num,
    senderRole: String(senderRole || ""),
    senderName: String(senderName || ""),
    recipientRoles: cleanRecipients,
    message: String(message || ""),
    createdAt: new Date().toISOString()
  };
  rows.push(rec);
  saveOrderMessagesToJson(rows);
  return rec;
}

function loadOrderChatMessagesFromJson() {
  try {
    if (fs.existsSync(ORDER_CHAT_MESSAGES_FILE)) {
      const rows = JSON.parse(fs.readFileSync(ORDER_CHAT_MESSAGES_FILE, "utf8"));
      return Array.isArray(rows) ? rows : [];
    }
  } catch (e) {
    console.error("[order-chat] json load error", e?.message);
  }
  return [];
}

function saveOrderChatMessagesToJson(rows) {
  try {
    fs.writeFileSync(ORDER_CHAT_MESSAGES_FILE, JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error("[order-chat] json save error", e?.message);
  }
}

function normalizeChatMessageRecord(row) {
  return {
    id: row.id,
    orderNo: Number(row.order_no ?? row.orderNo),
    senderRole: String(row.sender_role ?? row.senderRole ?? ""),
    senderId: String(row.sender_id ?? row.senderId ?? ""),
    senderName: String(row.sender_name ?? row.senderName ?? ""),
    message: String(row.message || ""),
    readAt: row.read_at ?? row.readAt ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

async function listChatMessages(orderNo) {
  const num = Number(orderNo);
  if (process.env.DATABASE_URL) {
    const { rows } = await db.query(
      `SELECT id, order_no, sender_role, sender_id, sender_name, message, read_at, created_at
       FROM order_chat_messages
       WHERE order_no = $1
       ORDER BY created_at ASC`,
      [num]
    );
    return rows.map(normalizeChatMessageRecord);
  }
  const rows = loadOrderChatMessagesFromJson();
  return rows
    .filter((r) => Number(r.orderNo) === num)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(normalizeChatMessageRecord);
}

async function addChatMessage({ orderNo, senderRole, senderId, senderName, message }) {
  const num = Number(orderNo);
  if (process.env.DATABASE_URL) {
    const { rows } = await db.query(
      `INSERT INTO order_chat_messages (order_no, sender_role, sender_id, sender_name, message)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, order_no, sender_role, sender_id, sender_name, message, read_at, created_at`,
      [num, String(senderRole || ""), String(senderId || ""), String(senderName || ""), String(message || "")]
    );
    return normalizeChatMessageRecord(rows[0] || {});
  }
  const rows = loadOrderChatMessagesFromJson();
  const rec = {
    id: Date.now(),
    orderNo: num,
    senderRole: String(senderRole || ""),
    senderId: String(senderId || ""),
    senderName: String(senderName || ""),
    message: String(message || ""),
    readAt: null,
    createdAt: new Date().toISOString(),
  };
  rows.push(rec);
  saveOrderChatMessagesToJson(rows);
  return normalizeChatMessageRecord(rec);
}

async function markChatRead(orderNo, recipientRole) {
  const num = Number(orderNo);
  const role = String(recipientRole || "").toLowerCase();
  if (!["customer", "photographer"].includes(role)) return 0;
  if (process.env.DATABASE_URL) {
    const { rowCount } = await db.query(
      `UPDATE order_chat_messages
       SET read_at = NOW()
       WHERE order_no = $1
         AND read_at IS NULL
         AND sender_role <> $2`,
      [num, role]
    );
    return rowCount || 0;
  }
  const rows = loadOrderChatMessagesFromJson();
  let changed = 0;
  for (const row of rows) {
    if (Number(row.orderNo) !== num) continue;
    if (String(row.senderRole || "").toLowerCase() === role) continue;
    if (row.readAt) continue;
    row.readAt = new Date().toISOString();
    changed += 1;
  }
  if (changed) saveOrderChatMessagesToJson(rows);
  return changed;
}

function getOrderDoneAt(order) {
  return order?.doneAt || order?.done_at || null;
}

function getOrderAppointmentTs(order) {
  const date = String(order?.schedule?.date || "").trim();
  const time = String(order?.schedule?.time || "").trim();
  if (!date || !time) return NaN;
  const ts = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(ts) ? ts : NaN;
}

function isBeforeAppointment(order) {
  const appointmentTs = getOrderAppointmentTs(order);
  if (!Number.isFinite(appointmentTs)) return false;
  return Date.now() < appointmentTs;
}

function isChatReadable(order, actorRole = "customer") {
  const role = String(actorRole || "").toLowerCase();
  if (role === "admin") return true;
  if (isBeforeAppointment(order)) return true;
  const status = String(order?.status || "").toLowerCase();
  return !!status && !CHAT_BLOCKED_STATUSES.has(status);
}

function getChatFeedbackUntil(order) {
  const status = String(order?.status || "").toLowerCase();
  if (CHAT_ACTIVE_STATUSES.has(status)) return null;
  if (status !== "done") return null;
  const doneAt = getOrderDoneAt(order);
  const doneTs = doneAt ? new Date(doneAt).getTime() : NaN;
  if (!Number.isFinite(doneTs)) return null;
  return new Date(doneTs + CHAT_FEEDBACK_WINDOW_MS);
}

function isChatWritable(order, actorRole = "customer") {
  const role = String(actorRole || "").toLowerCase();
  if (role === "admin") return true;
  if (isBeforeAppointment(order)) return true;
  const status = String(order?.status || "").toLowerCase();
  if (CHAT_ACTIVE_STATUSES.has(status)) return true;
  if (status !== "done") return false;
  const until = getChatFeedbackUntil(order);
  if (!until) return false;
  return Date.now() < until.getTime();
}

function getChatAvailability(order, actorRole = "customer") {
  const role = String(actorRole || "").toLowerCase();
  const feedbackUntil = role === "admin" || isBeforeAppointment(order) ? null : getChatFeedbackUntil(order);
  return {
    readable: isChatReadable(order, role),
    writable: isChatWritable(order, role),
    feedbackUntil: feedbackUntil ? feedbackUntil.toISOString() : null,
  };
}

function chatSseKey(orderNo, audience) {
  return `${Number(orderNo)}:${String(audience || "").toLowerCase()}`;
}

function addChatSseClient(orderNo, audience, res) {
  const key = chatSseKey(orderNo, audience);
  const set = chatSseClients.get(key) || new Set();
  set.add(res);
  chatSseClients.set(key, set);
}

function removeChatSseClient(orderNo, audience, res) {
  const key = chatSseKey(orderNo, audience);
  const set = chatSseClients.get(key);
  if (!set) return;
  set.delete(res);
  if (!set.size) chatSseClients.delete(key);
}

function broadcastChat(orderNo, payload) {
  const json = JSON.stringify(payload);
  const packet = `event: message\ndata: ${json}\n\n`;
  for (const audience of ["customer", "photographer"]) {
    const set = chatSseClients.get(chatSseKey(orderNo, audience));
    if (!set || !set.size) continue;
    for (const res of set) {
      try {
        res.write(packet);
      } catch (_) {}
    }
  }
}

async function getChatMessageById(msgId) {
  if (process.env.DATABASE_URL) {
    const { rows } = await db.query(
      "SELECT id, read_at FROM order_chat_messages WHERE id = $1 LIMIT 1",
      [Number(msgId)]
    );
    return rows[0] || null;
  }
  const rows = loadOrderChatMessagesFromJson();
  return rows.find((row) => Number(row.id) === Number(msgId)) || null;
}

async function sendChatNotificationMail({ orderNo, senderName, recipientEmail, recipientRole }) {
  const orderLinkBase = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
  const pathPart = recipientRole === "customer" ? "/customer-dashboard.html" : "/orders";
  const link = `${orderLinkBase}${pathPart}`;
  const subject = `Neue Chat-Nachricht zu Auftrag #${orderNo}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#222;max-width:560px">
    <h2 style="margin:0 0 12px;font-size:17px;color:#111">Neue Chat-Nachricht zu Auftrag #${orderNo}</h2>
    <p style="margin:0 0 10px">${escMailHtml(senderName || "Kontakt")} hat Ihnen im Auftrags-Chat geschrieben.</p>
    <p style="margin:0 0 16px">Bitte -ffnen Sie den Auftrag im Browser, um zu antworten.</p>
    <p style="margin:0"><a href="${link}" style="display:inline-block;padding:10px 14px;background:#9e8649;color:#fff;text-decoration:none;border-radius:6px">Zum Auftrag</a></p>
  </div>`;
  const text = `Neue Chat-Nachricht zu Auftrag #${orderNo}\n${senderName || "Kontakt"} hat Ihnen geschrieben.\n\nZum Auftrag: ${link}`;
  const sendResult = await sendMailWithFallback({
    to: String(recipientEmail || "").trim(),
    subject,
    html,
    text,
    context: `chat-unread:${orderNo}:${recipientRole}`,
  });
  assertMailSent(sendResult, `chat-unread:${orderNo}:${recipientRole}`);
}

function scheduleMailIfUnread({ orderNo, msgId, recipientEmail, recipientRole, senderName }) {
  const email = String(recipientEmail || "").trim();
  const role = String(recipientRole || "").toLowerCase();
  if (!email || !["customer", "photographer"].includes(role)) return;

  const key = `${Number(orderNo)}:${role}:${email.toLowerCase()}`;
  const existing = chatUnreadMailTimers.get(key);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(async () => {
    try {
      const msg = await getChatMessageById(msgId);
      const readAt = msg?.read_at || msg?.readAt || null;
      if (!msg || readAt) return;
      await sendChatNotificationMail({
        orderNo: Number(orderNo),
        senderName,
        recipientEmail: email,
        recipientRole: role,
      });
    } catch (err) {
      console.error("[chat-mail] delayed send failed", err?.message || err);
    } finally {
      chatUnreadMailTimers.delete(key);
    }
  }, CHAT_UNREAD_MAIL_DELAY_MS);

  chatUnreadMailTimers.set(key, timeout);
}

async function getOrderForChat(orderNo) {
  const num = Number(orderNo);
  if (!Number.isFinite(num)) return null;
  return process.env.DATABASE_URL
    ? await db.getOrderByNo(num)
    : (await loadOrders()).find((o) => Number(o.orderNo) === num);
}

function canPhotographerAccessOrder(order, photographerKey) {
  const key = String(photographerKey || "").toLowerCase();
  if (!key) return true;
  const orderPhotogKey = String(order?.photographer?.key || "").toLowerCase();
  return !!orderPhotogKey && orderPhotogKey === key;
}

function canCustomerAccessOrder(order, customerEmail) {
  const orderEmail = String(order?.billing?.email || order?.customerEmail || "").toLowerCase().trim();
  return !!orderEmail && orderEmail === String(customerEmail || "").toLowerCase().trim();
}

const ADMIN_SESSION_DAYS = parseInt(process.env.ADMIN_SESSION_DAYS || "30", 10);


function generateToken(){
  return require("crypto").randomBytes(32).toString("base64url");
}

function resolveAdminFrontendUrl(req) {
  const configured = String(process.env.ADMIN_PANEL_URL || process.env.ADMIN_FRONTEND_URL || "").trim();
  if (configured) return configured;

  const requested = String(req?.query?.redirect || "").trim();
  if (requested) return requested;

  return "http://localhost:5173/";
}

async function issueAdminSession(res, { role = "admin", rememberMe = false, userKey = null, userName = null } = {}) {
  const token = generateToken();
  const sessionDays = rememberMe ? 30 : ADMIN_SESSION_DAYS;
  const expiresAt = new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);

  try {
    if (db.createAdminSession) {
      const tokenHash = customerAuth.hashSha256Hex(token);
      await db.createAdminSession({ tokenHash, role, userKey, userName, expiresAt });
    }
    res.cookie("admin_session", token, {
      httpOnly: true,
      secure: String(process.env.SESSION_COOKIE_SECURE || "false").toLowerCase() === "true",
      sameSite: "lax",
      maxAge: sessionDays * 24 * 60 * 60 * 1000
    });
  } catch (e) {
    console.error("[auth] create admin session failed", e?.message);
  }

  return { token, sessionDays, expiresAt };
}


function getRequestToken(req) {
  // 1. Bearer Header
  const auth = req.headers.authorization || "";
  let token = auth.replace(/^Bearer\s+/i, "").trim();
  // 2. Cookie als Fallback fuer Sessions
  if(!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(";").map(c => c.trim());
    for(const c of cookies) {
      if(c.startsWith("admin_session=")) {
        token = c.substring("admin_session=".length);
        break;
      }
    }
  }
  // 3. Query Param
  if(!token) {
    token = String(req.query.token || "").trim();
  }
  return token;
}

function getActorLabel(req){
  const fromUser = req?.user?.name || req?.user?.email;
  if (fromUser) return String(fromUser);
  if (req?.photographerName) return String(req.photographerName);
  if (req?.photographerKey) return `photographer:${req.photographerKey}`;
  return "admin";
}

function loadEmployeeActivityFromJson(){
  try {
    if (fs.existsSync(EMPLOYEE_ACTIVITY_FILE)) {
      const rows = JSON.parse(fs.readFileSync(EMPLOYEE_ACTIVITY_FILE, "utf8"));
      return Array.isArray(rows) ? rows : [];
    }
  } catch(e){ console.error("[employee-activity] json load error", e?.message); }
  return [];
}

function saveEmployeeActivityToJson(rows){
  try {
    fs.writeFileSync(EMPLOYEE_ACTIVITY_FILE, JSON.stringify(rows, null, 2));
  } catch(e){ console.error("[employee-activity] json save error", e?.message); }
}

async function addEmployeeActivity({ employeeKey, action, actor, details }){
  const rec = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    employeeKey: String(employeeKey || "").toLowerCase(),
    action: String(action || "updated"),
    actor: String(actor || "admin"),
    details: details || {},
    createdAt: new Date().toISOString()
  };
  const rows = loadEmployeeActivityFromJson();
  rows.push(rec);
  if (rows.length > 5000) rows.splice(0, rows.length - 5000);
  saveEmployeeActivityToJson(rows);
  return rec;
}

async function listEmployeeActivity(employeeKey, limit = 100){
  const key = String(employeeKey || "").toLowerCase();
  const lim = Math.max(1, Math.min(500, Number(limit || 100)));
  const rows = loadEmployeeActivityFromJson()
    .filter(r => String(r.employeeKey || "").toLowerCase() === key)
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  return rows.slice(0, lim);
}

async function attachRbacToRequest(req) {
  try {
    const ctx = await rbac.resolveRequestAccessContext(req);
    req.accessSubjectId = ctx.subjectId;
    req.effectivePermissions = ctx.permissions;
  } catch (_e) {
    req.accessSubjectId = null;
    req.effectivePermissions = rbac.legacyFallbackPermissions(req.user?.role);
  }
}

function getRoutePermission(method, url) {
  const m = (method || "").toUpperCase();
  const p = (url || "").split("?")[0];

  if (p === "/api/admin/login" || p === "/api/admin/logout" ||
      p === "/api/admin/me" || p.startsWith("/api/admin/me/") ||
      p.startsWith("/api/admin/sso")) return null;

  if (/\/orders\/\d+\/review\//.test(p)) return "reviews.manage";
  if (/^\/api\/admin\/reviews/.test(p)) return "reviews.manage";

  if (/^\/api\/admin\/orders/.test(p)) {
    if (m === "POST" && /^\/api\/admin\/orders$/.test(p)) return "orders.create";
    if (m === "DELETE") return "orders.delete";
    if (m === "PATCH" || m === "PUT") return "orders.update";
    if (m === "POST") return "orders.update";
    return "orders.read";
  }

  if (/^\/api\/admin\/customers/.test(p)) {
    return m === "GET" ? "customers.read" : "customers.manage";
  }

  if (/^\/api\/admin\/products/.test(p) ||
      /^\/api\/admin\/service-categories/.test(p) ||
      /^\/api\/admin\/pricing/.test(p)) return "products.manage";

  if (/^\/api\/admin\/calendar-events/.test(p) ||
      /^\/api\/admin\/availability/.test(p)) return "calendar.view";

  if (/^\/api\/admin\/photographers/.test(p)) {
    return m === "GET" ? "photographers.read" : "photographers.manage";
  }

  if (/^\/api\/admin\/settings/.test(p) ||
      /^\/api\/admin\/integrations/.test(p) ||
      /^\/api\/admin\/shadow-log/.test(p) ||
      /^\/api\/admin\/mail/.test(p)) return "settings.manage";

  if (/^\/api\/admin\/discount-codes/.test(p)) return "discount_codes.manage";

  if (/^\/api\/admin\/email-templates/.test(p) ||
      /^\/api\/admin\/email-workflow-config/.test(p)) return "emails.manage";

  if (/^\/api\/admin\/backups/.test(p)) return "backups.manage";

  if (/^\/api\/admin\/bug-reports/.test(p)) {
    return m === "GET" ? "bugs.read" : "bugs.manage";
  }

  if (/^\/api\/admin\/companies/.test(p) || /^\/api\/admin\/users/.test(p)) return "users.manage";

  return null;
}

async function enforceRoutePermission(req, res) {
  const perm = getRoutePermission(req.method, req.originalUrl || req.url);
  if (!perm) return true;
  if (!req.effectivePermissions) await attachRbacToRequest(req);
  if (req.effectivePermissions && req.effectivePermissions.has(perm)) return true;
  res.status(403).json({ error: "Keine Berechtigung", permission: perm });
  return false;
}

async function resolveCompanyScope(req) {
  const role = String(req.user?.role || "");
  if (!COMPANY_MEMBER_ROLES.has(role)) {
    req.authRole = role;
    req.companyId = null;
    req.companyMembership = null;
    return null;
  }

  const member = await db.getCompanyMemberForIdentity({
    keycloakSubject: req.user?.id || "",
    email: req.user?.email || "",
  });
  if (!member) return null;

  if (member.status !== "active") return null;
  req.authRole = member.role;
  req.companyId = Number(member.company_id);
  req.companyMembership = member;
  return member;
}

async function requireCompanyMember(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Nicht authentifiziert." });
  }
  const member = await resolveCompanyScope(req);
  if (!member) return res.status(403).json({ error: "Keine Firmenberechtigung" });
  await attachRbacToRequest(req);
  if (!(await enforceRoutePermission(req, res))) return;
  return next();
}

async function requireCompanyAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Nicht authentifiziert." });
  }
  const member = await resolveCompanyScope(req);
  if (!member || (member.role !== "company_admin" && member.role !== "company_owner")) {
    return res.status(403).json({ error: "Keine Firmen-Admin-Berechtigung" });
  }
  await attachRbacToRequest(req);
  if (!(await enforceRoutePermission(req, res))) return;
  return next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Nicht authentifiziert." });
  }
  const role = String(req.user?.role || "");
  if (!SUPER_ADMIN_ROLES.has(role)) {
    return res.status(403).json({ error: "Nur Super-Admin erlaubt" });
  }
  req.authRole = "super_admin";
  req.companyId = null;
  req.companyMembership = null;
  return next();
}

async function ensureCustomerInRequestCompany(req, customerId) {
  if (!req.companyId) return true;
  const customers = await db.listCompanyCustomers(req.companyId);
  return customers.some((item) => Number(item.id) === Number(customerId));
}

async function requireAdmin(req, res, next){
  if (!req.user) {
    return res.status(401).json({ error: "Nicht authentifiziert." });
  }
  const ssoRole = String(req.user?.role || "");
  if (SUPER_ADMIN_ROLES.has(ssoRole)) {
    req.authRole = "super_admin";
    req.companyId = null;
    req.companyMembership = null;
    await attachRbacToRequest(req);
    if (!(await enforceRoutePermission(req, res))) return;
    return next();
  }
  const member = await resolveCompanyScope(req);
  if (member) {
    const pathName = String(req.path || "");
    const isAllowedCompanyPath = pathName.startsWith("/api/company/");
    const isAllowedAdminUtilityPath = pathName === "/api/admin/me" || pathName === "/api/admin/logout";
    if (!isAllowedCompanyPath && !isAllowedAdminUtilityPath) {
      return res.status(403).json({ error: "Keine Berechtigung fuer diesen Admin-Endpunkt" });
    }
    await attachRbacToRequest(req);
    if (!(await enforceRoutePermission(req, res))) return;
    return next();
  }
  return res.status(403).json({ error: "Keine Berechtigung fuer diesen Admin-Endpunkt" });
}

async function requirePhotographerOrAdmin(req, res, next){
  if (!req.user) {
    return res.status(401).json({ error: "Nicht authentifiziert." });
  }
  if (req.user?.role === "admin" || req.user?.role === "employee" || req.user?.role === "super_admin" || req.user?.role === "photographer") {
    req.isFullAdmin = req.user?.role === "admin" || req.user?.role === "employee" || req.user?.role === "super_admin";
    req.photographerKey = req.user?.role === "photographer" ? String(req.user?.id || "") : null;
    req.photographerName = req.user?.name || null;
    await attachRbacToRequest(req);
    if (!(await enforceRoutePermission(req, res))) return;
    return next();
  }
  return res.status(403).json({ error: "Keine Berechtigung" });
}

// Logout: Admin-Session-Cookie + DB-Eintrag entfernen
app.post("/api/admin/logout", requireAdmin, async (req, res) => {
  try {
    const token = getRequestToken(req);
    if (token && db.deleteAdminSessionByTokenHash) {
      await db.deleteAdminSessionByTokenHash(customerAuth.hashSha256Hex(token));
    }
  } catch (_e) {}
  res.clearCookie("admin_session");
  res.json({ ok: true });
});

// Admin Profil
app.get("/api/admin/me", requireAdmin, async (req, res) => {
  try {
    const companyMember = await resolveCompanyScope(req);
    const permissions = req.effectivePermissions ? Array.from(req.effectivePermissions) : [];
    return res.json({
      ok: true,
      role: companyMember?.role || req.user?.role || "admin",
      company: companyMember ? {
        id: Number(companyMember.company_id),
        name: companyMember.company_name || "",
        slug: companyMember.company_slug || "",
      } : null,
      profile: {
        user: req.user?.email || req.user?.id || "",
        email: req.user?.email || "",
        name: req.user?.name || req.user?.email || "",
        phone: "",
        language: "de",
      },
      permissions,
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Profil konnte nicht geladen werden" });
  }
});

app.put("/api/admin/me", requireAdmin, async (req, res) => {
  return res.status(400).json({ error: "Profil-Aenderung aktuell nicht unterstuetzt." });
});

app.post("/api/admin/me/change-password", requireAdmin, async (req, res) => {
  return res.status(400).json({ error: "Passwort-Aenderung bitte direkt in der Datenbank (admin_users) oder per zukuenftigem Admin-Tool." });
});

// Mail diagnostics for quick admin troubleshooting
app.get("/api/admin/mail/diagnostics", requireAdmin, (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || 30)));
  const rows = _mailDiagnostics.slice(-limit).reverse();
  res.json({
    ok: true,
    count: rows.length,
    diagnostics: rows
  });
});

// Fotografen-Login: Route derzeit nicht aktiv (kein lokaler/SSO-Flow hier).
app.post("/api/photographer/login", (_req, res) => {
  res.status(403).json({ error: "Photographen-Login ueber diese Route ist deaktiviert." });
});

app.post("/api/photographer/logout", (_req, res) => {
  res.json({ ok: true });
});

// Mitarbeiter: eigenes Profil abrufen (fuer Token-Validierung)
app.get("/api/photographer/me", requirePhotographerOrAdmin, (req, res) => {
  // is_admin-Mitarbeiter erhalten role "admin" fuer vollen Admin-Zugriff
  if (req.isFullAdmin) {
    res.json({ role: "admin", key: req.photographerKey || null, name: req.photographerName || null });
    return;
  }
  if (req.photographerKey) {
    res.json({ role: "photographer", key: req.photographerKey, name: req.photographerName });
  } else {
    res.json({ role: "admin" });
  }
});

function mapRuleToPricingMeta(rule) {
  const type = String(rule?.rule_type || "");
  const cfg = rule?.config_json || {};
  if (type === "fixed") {
    return { pricingType: "fixed", price: Number(cfg.price || 0) };
  }
  if (type === "per_floor") {
    return { pricingType: "perFloor", unitPrice: Number(cfg.unitPrice || 0) };
  }
  if (type === "per_room") {
    return { pricingType: "perRoom", unitPrice: Number(cfg.unitPrice || 0) };
  }
  if (type === "area_tier") {
    const tiers = Array.isArray(cfg.tiers) ? cfg.tiers : [];
    const notes = tiers.map((t) => `${t.price} CHF (<=${t.maxArea}m2)`);
    if (cfg.incrementPrice && cfg.incrementArea) {
      notes.push(`+${cfg.incrementPrice} CHF pro ${cfg.incrementArea}m2`);
    }
    return { pricingType: "byArea", price: Number(tiers?.[0]?.price || cfg.basePrice || 0), pricingNote: notes.join(", ") };
  }
  if (type === "conditional") {
    return { pricingType: "conditional", price: Number(cfg.price || 0), conditions: cfg };
  }
  return { pricingType: "fixed", price: 0 };
}

function formatCatalogProducts(products) {
  const sorted = Array.isArray(products) ? products : [];
  const packages = [];
  const addons = [];
  for (const p of sorted) {
    const firstRule = (p.rules || []).find((r) => r?.active !== false);
    const pricingMeta = mapRuleToPricingMeta(firstRule);
    if (p.kind === "package") {
      packages.push({
        key: p.code,
        categoryKey: p.category_key || p.group_key || "",
        sortOrder: Number(p.sort_order || 0),
        label: p.name,
        description: p.description || "",
        price: pricingMeta.price || 0,
        pricingType: pricingMeta.pricingType,
      });
    } else {
      addons.push({
        id: p.code,
        group: p.group_key || "",
        categoryKey: p.category_key || p.group_key || "",
        sortOrder: Number(p.sort_order || 0),
        label: p.name,
        ...pricingMeta,
      });
    }
  }
  return { packages, addons };
}

app.get("/api/catalog/products", async (_req, res) => {
  try {
    const products = await db.listProductsWithRules({ includeInactive: false });
    const categories = await db.listServiceCategories({ includeInactive: false });
    const { packages, addons } = formatCatalogProducts(products);
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, categories, packages, addons, products });
  } catch (err) {
    res.status(500).json({ error: err.message || "Produktkatalog konnte nicht geladen werden" });
  }
});

app.get("/api/catalog/photographers", (_req, res) => {
  const list = (PHOTOGRAPHERS_CONFIG || []).map((p) => ({
    key: p.key,
    name: p.name || p.key,
    initials: p.initials || "",
    image: p.image || "",
  }));
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, photographers: list });
});

app.get(ADDRESS_AUTOCOMPLETE_ENDPOINT, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().replace(/\u00DF/g, "ss");
    const lang = String(req.query.lang || "de-CH").split("-")[0] || "de";
    const limit = Math.min(Number(req.query.limit || 8), 5);
    if (!q || q.length < 3) return res.json({ ok: true, results: [] });

    const apiKey = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
    if (!apiKey) return res.json({ ok: true, results: [] });

    // 1. Google Places Autocomplete
    const acUrl = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    acUrl.searchParams.set("input", q);
    acUrl.searchParams.set("components", "country:ch");
    acUrl.searchParams.set("language", lang);
    acUrl.searchParams.set("key", apiKey);

    const acRes = await fetch(acUrl.toString(), { signal: AbortSignal.timeout(6000) });
    if (!acRes.ok) return res.json({ ok: true, results: [] });
    const acJson = await acRes.json();
    const predictions = Array.isArray(acJson.predictions) ? acJson.predictions.slice(0, limit) : [];
    if (acJson.status !== "OK" && acJson.status !== "ZERO_RESULTS" || predictions.length === 0) {
      return res.json({ ok: true, results: [] });
    }

    const chStr = (s) => String(s || "").replace(/\u00DF/g, "ss");

    const fetchDetails = async (p) => {
      const detailsUrl = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      detailsUrl.searchParams.set("place_id", p.place_id);
      detailsUrl.searchParams.set("language", lang);
      detailsUrl.searchParams.set("fields", "address_components,geometry,formatted_address");
      detailsUrl.searchParams.set("key", apiKey);
      const dr = await fetch(detailsUrl.toString(), { signal: AbortSignal.timeout(4000) });
      if (!dr.ok) return null;
      const dj = await dr.json();
      if (dj.status !== "OK" || !dj.result) return null;
      const r = dj.result;
      const comps = Array.isArray(r.address_components) ? r.address_components : [];
      const get = (types) => comps.find((c) => types.some((t) => c.types && c.types.includes(t)));
      const road = chStr((get(["route"]) || {}).long_name || "");
      const house = chStr((get(["street_number"]) || {}).long_name || "");
      const city = chStr((get(["locality"]) || get(["administrative_area_level_2"]) || {}).long_name || "");
      const postcode = chStr((get(["postal_code"]) || {}).long_name || "");
      const canton = chStr((get(["administrative_area_level_1"]) || {}).short_name || "");
      const countryCode = chStr((get(["country"]) || {}).short_name || "CH").toUpperCase();
      const mainText = chStr((p.structured_formatting && p.structured_formatting.main_text) || p.description || "");
      const subText = chStr((p.structured_formatting && p.structured_formatting.secondary_text) || "");
      const zipcity = [postcode, city].filter(Boolean).join(" ");
      const main = road && house ? `${road} ${house}`.trim() : mainText || zipcity;
      const sub = zipcity || subText;
      const display = [main, sub, countryCode === "CH" ? "Schweiz" : ""].filter(Boolean).join(", ");
      const loc = r.geometry && r.geometry.location;
      const lat = loc && Number.isFinite(loc.lat) ? Number(loc.lat) : 0;
      const lon = loc && Number.isFinite(loc.lng) ? Number(loc.lng) : 0;

      if (road || mainText) {
        return {
          type: "address",
          main,
          sub,
          display,
          street: road || undefined,
          houseNumber: house || undefined,
          zip: postcode || undefined,
          city: city || undefined,
          canton: canton || undefined,
          countryCode: countryCode || "CH",
          complete: Boolean(road && house && postcode && city && countryCode === "CH"),
          lat,
          lng: lon,
          lon,
        };
      }
      return {
        type: "place",
        main: zipcity || mainText,
        sub: subText,
        display: [zipcity || mainText, "Schweiz"].filter(Boolean).join(", "),
        zip: postcode || undefined,
        city: city || undefined,
        canton: canton || undefined,
        countryCode: countryCode || "CH",
        complete: false,
        lat,
        lng: lon,
        lon,
      };
    };

    const details = await Promise.all(predictions.map((p) => fetchDetails(p).catch(() => null)));
    const results = details.filter(Boolean);

    res.json({ ok: true, results });
  } catch (err) {
    res.json({ ok: true, results: [] });
  }
});

app.get("/api/config", async (_req, res) => {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  const mapId = String(process.env.GOOGLE_MAP_ID || "DEMO_MAP_ID").trim();
  let dbFieldHintsEnabled = false;
  let provisionalBookingEnabled = false;
  let vatRate = 0.081;
  let chfRoundingStep = 0.05;
  let keyPickupPrice = 50;
  let lookaheadDays = 365;
  let minAdvanceHours = 24;
  try {
    const [dbHints, provisional, vat, rounding, pickup, lookahead, advance] = await Promise.all([
      getSetting("feature.dbFieldHints").catch(() => ({ value: false })),
      getSetting("feature.provisionalBooking").catch(() => ({ value: false })),
      getSetting("pricing.vatRate").catch(() => ({ value: 0.081 })),
      getSetting("pricing.chfRoundingStep").catch(() => ({ value: 0.05 })),
      getSetting("pricing.keyPickupPrice").catch(() => ({ value: 50 })),
      getSetting("scheduling.lookaheadDays").catch(() => ({ value: 365 })),
      getSetting("scheduling.minAdvanceHours").catch(() => ({ value: 24 })),
    ]);
    dbFieldHintsEnabled = !!dbHints.value;
    provisionalBookingEnabled = !!provisional.value;
    vatRate = Number(vat.value) || 0.081;
    chfRoundingStep = Number(rounding.value) || 0.05;
    keyPickupPrice = Number(pickup.value) || 50;
    lookaheadDays = Number(lookahead.value) || 365;
    minAdvanceHours = Number(advance.value) || 24;
  } catch {
    /* defaults above */
  }
  res.setHeader("Cache-Control", "private, max-age=60");
  res.json({
    ok: true,
    googleMapsKey: key || null,
    googleMapId: mapId || null,
    dbFieldHintsEnabled,
    provisionalBookingEnabled,
    vatRate,
    chfRoundingStep,
    keyPickupPrice,
    lookaheadDays,
    minAdvanceHours,
  });
});

app.get("/api/reverse-geocode", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const apiKey = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !apiKey) {
      return res.json({ ok: true, addr: "", parsed: null });
    }
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("language", "de");
    url.searchParams.set("result_type", "street_address|premise");
    url.searchParams.set("key", apiKey);
    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.json({ ok: true, addr: "", parsed: null });
    const j = await r.json();
    const result = Array.isArray(j.results) && j.results[0] ? j.results[0] : null;
    if (!result) return res.json({ ok: true, addr: "", parsed: null });
    const comps = result.address_components || [];
    const get = (types) => comps.find((c) => (c.types || []).some((t) => types.includes(t)));
    const road = String((get(["route"]) || {}).long_name || "").trim();
    const house = String((get(["street_number"]) || {}).long_name || "").trim();
    const city = String((get(["locality"]) || get(["administrative_area_level_2"]) || {}).long_name || "").trim();
    const postcode = String((get(["postal_code"]) || {}).long_name || "").trim();
    const cc = String((get(["country"]) || {}).short_name || "").toUpperCase();
    if (cc !== "CH") return res.json({ ok: true, addr: "", parsed: null });
    const zipcity = [postcode, city].filter(Boolean).join(" ").trim();
    const line1 = road ? `${road}${house ? ` ${house}` : ""}`.trim() : "";
    const addr = [line1, zipcity].filter(Boolean).join(", ").trim();
    res.json({
      ok: true,
      addr,
      parsed: {
        street: road || undefined,
        houseNumber: house || undefined,
        zip: postcode || undefined,
        city: city || undefined,
        countryCode: "CH",
        complete: Boolean(road && house && postcode && city),
      },
    });
  } catch (err) {
    res.json({ ok: true, addr: "", parsed: null });
  }
});

// ─── Google Reviews (öffentlich, gecacht) ────────────────────────────────────
let _reviewsCache = null;
let _reviewsCacheAt = 0;
const REVIEWS_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 Stunden

app.get("/api/reviews", async (req, res) => {
  try {
    const now = Date.now();
    if (_reviewsCache && now - _reviewsCacheAt < REVIEWS_CACHE_TTL) {
      return res.json(_reviewsCache);
    }

    const apiKey = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
    const placeId = String(process.env.GOOGLE_REVIEWS_PLACE_ID || "").trim();

    if (!apiKey || !placeId) {
      return res.json({ ok: false, reason: "not_configured" });
    }

    const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
    url.searchParams.set("place_id", placeId);
    url.searchParams.set("fields", "name,rating,user_ratings_total,reviews");
    url.searchParams.set("language", "de");
    url.searchParams.set("reviews_sort", "most_relevant");
    url.searchParams.set("key", apiKey);

    const r = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.json({ ok: false, reason: "fetch_error" });

    const j = await r.json();
    if (j.status !== "OK" || !j.result) {
      return res.json({ ok: false, reason: j.status || "api_error" });
    }

    const result = j.result;
    const reviews = (Array.isArray(result.reviews) ? result.reviews : [])
      .filter((rv) => rv.rating >= 4 && rv.text && rv.text.length > 30)
      .slice(0, 5)
      .map((rv) => ({
        author: rv.author_name || "Anonym",
        rating: rv.rating,
        text: rv.text,
        relativeTime: rv.relative_time_description || "",
      }));

    const payload = {
      ok: true,
      rating: result.rating || null,
      total: result.user_ratings_total || null,
      reviews,
    };

    _reviewsCache = payload;
    _reviewsCacheAt = now;
    res.json(payload);
  } catch (err) {
    res.json({ ok: false, reason: "exception" });
  }
});

app.get("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true" || String(req.query.includeInactive) === "1";
    const kind = String(req.query.kind || "").trim();
    const products = await db.listProductsWithRules({ includeInactive, kind });
    res.json({ ok: true, products });
  } catch (err) {
    res.status(500).json({ error: err.message || "Produkte konnten nicht geladen werden" });
  }
});

app.get("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const product = await db.getProductById(req.params.id);
    if (!product) return res.status(404).json({ error: "Produkt nicht gefunden" });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(500).json({ error: err.message || "Produkt konnte nicht geladen werden" });
  }
});

app.post("/api/admin/products", requireAdmin, async (req, res) => {
  try {
    const product = await db.createProduct(req.body || {});
    res.json({ ok: true, product });
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "Produkt-Code ist bereits vergeben" });
    res.status(400).json({ error: err.message || "Produkt konnte nicht erstellt werden" });
  }
});

app.put("/api/admin/products/:id", requireAdmin, async (req, res) => {
  try {
    const product = await db.updateProduct(req.params.id, req.body || {});
    res.json({ ok: true, product });
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "Produkt-Code ist bereits vergeben" });
    res.status(400).json({ error: err.message || "Produkt konnte nicht aktualisiert werden" });
  }
});

app.patch("/api/admin/products/:id/active", requireAdmin, async (req, res) => {
  try {
    const active = req.body?.active !== false;
    const product = await db.setProductActive(req.params.id, active);
    if (!product) return res.status(404).json({ error: "Produkt nicht gefunden" });
    res.json({ ok: true, product });
  } catch (err) {
    res.status(400).json({ error: err.message || "Produktstatus konnte nicht ge-ndert werden" });
  }
});

app.get("/api/admin/service-categories", requireAdmin, async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "").toLowerCase() === "true" || String(req.query.includeInactive) === "1";
    const kindScope = String(req.query.kindScope || "").trim();
    const categories = await db.listServiceCategories({ includeInactive, kindScope });
    res.json({ ok: true, categories });
  } catch (err) {
    res.status(500).json({ error: err.message || "Kategorien konnten nicht geladen werden" });
  }
});

app.post("/api/admin/service-categories", requireAdmin, async (req, res) => {
  try {
    const category = await db.createServiceCategory(req.body || {});
    res.json({ ok: true, category });
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "Kategorie-Key ist bereits vergeben" });
    res.status(400).json({ error: err.message || "Kategorie konnte nicht erstellt werden" });
  }
});

app.put("/api/admin/service-categories/:key", requireAdmin, async (req, res) => {
  try {
    const category = await db.updateServiceCategory(req.params.key, req.body || {});
    res.json({ ok: true, category });
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "Kategorie-Key ist bereits vergeben" });
    res.status(400).json({ error: err.message || "Kategorie konnte nicht aktualisiert werden" });
  }
});

app.delete("/api/admin/service-categories/:key", requireAdmin, async (req, res) => {
  try {
    const fallbackKey = String(req.query.fallbackKey || "");
    await db.deleteServiceCategory(req.params.key, { fallbackKey });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Kategorie konnte nicht gelöscht werden" });
  }
});

app.post("/api/admin/pricing/preview", requireAdmin, async (req, res) => {
  try {
    const body = normalizeTextDeep(req.body || {});
    const pkg = body?.services?.package || body?.package || null;
    const addons = body?.services?.addons || body?.addons || [];
    const object = body?.object || {
      area: body?.area,
      floors: body?.floors,
    };
    const services = {
      package: pkg ? {
        key: String(pkg.key || pkg.code || body?.packageKey || ""),
        label: String(pkg.label || pkg.name || ""),
        price: Number(pkg.price || 0),
      } : {},
      addons: (Array.isArray(addons) ? addons : []).map((a) => ({
        id: String(a.id || a.code || ""),
        label: String(a.label || a.name || ""),
        group: String(a.group || a.group_key || ""),
        qty: Number(a.qty || 0) || undefined,
        price: Number(a.price || 0),
      })),
    };
    const result = await computePricing({
      services,
      object,
      discountCode: String(body.discountCode || ""),
      customerEmail: String(body.customerEmail || body?.billing?.email || ""),
    });
    // Shadow-Mode: Pricing-Vergleich auch im Preview-Endpoint (fire-and-forget)
    shadowPricing({
      services,
      object,
      discountCode: String(body.discountCode || ""),
      customerEmail: String(body.customerEmail || body?.billing?.email || ""),
      v1Result: result,
      orderNo: "preview",
    }).catch(() => {});
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Preisvorschau fehlgeschlagen" });
  }
});

app.get("/api/admin/calendar-events", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const queryPhotographer = String(req.query.photographer || "").trim().toLowerCase();
    const photographerKeyFilter = String(req.photographerKey || queryPhotographer || "").trim().toLowerCase();
    const includeAbsences = String(req.query.includeAbsences || "true").toLowerCase() !== "false";

    const photographerRows =
      process.env.DATABASE_URL && typeof db.getAllPhotographerSettings === "function"
        ? await db.getAllPhotographerSettings({ includeInactive: true })
        : PHOTOGRAPHERS_CONFIG.map((p) => ({
            key: p.key,
            name: p.name || p.key,
            event_color: p.event_color || undefined,
          }));

    const photographerNameMap = {};
    const photographerColorMap = {};
    for (const row of photographerRows || []) {
      const key = String(row?.key || "").trim().toLowerCase();
      if (!key) continue;
      photographerNameMap[key] = String(row?.name || key);
      if (row?.event_color) photographerColorMap[key] = String(row.event_color);
    }

    const orders = await loadOrders();
    const events = [];
    for (const order of Array.isArray(orders) ? orders : []) {
      const schedule = order?.schedule && typeof order.schedule === "object" ? order.schedule : {};
      const date = String(schedule?.date || order?.date || "").slice(0, 10);
      const time = String(schedule?.time || order?.time || "").slice(0, 5);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) continue;

      const photographerKeyRaw =
        order?.photographer?.key || schedule?.photographer?.key || schedule?.photographer || "";
      const photographerKey = String(photographerKeyRaw || "").trim().toLowerCase();
      if (photographerKeyFilter && photographerKey !== photographerKeyFilter) continue;

      const startStr = `${date}T${time}:00`;
      const startMs = Date.parse(startStr);
      if (Number.isNaN(startMs)) continue;

      const durationMinRaw =
        Number(order?.durationMin) ||
        Number(order?.schedule?.durationMin) ||
        Number(order?.metadata?.durationMin) ||
        Number(order?.duration) ||
        90;
      const durationMin = Math.max(15, Math.min(24 * 60, Math.round(durationMinRaw)));
      const [hh, mm] = time.split(":").map(Number);
      const endTotal = hh * 60 + mm + durationMin;
      const endHH = String(Math.floor(endTotal / 60) % 24).padStart(2, "0");
      const endMM = String(endTotal % 60).padStart(2, "0");
      const endStr = `${date}T${endHH}:${endMM}:00`;

      const billing = order?.billing && typeof order.billing === "object" ? order.billing : {};
      const photographerName =
        String(order?.photographer?.name || "").trim() ||
        photographerNameMap[photographerKey] ||
        photographerKey;
      const photographerColor = photographerColorMap[photographerKey] || "#64748b";

      const zipcity = String(billing?.zipcity || "").trim();
      const customerName = String(billing?.name || "").trim();
      const displayLabel = [zipcity, customerName].filter(Boolean).join(" \u00b7 ");

      events.push({
        id: `order-${order.orderNo || Math.random().toString(36).slice(2)}`,
        title: displayLabel || String(order?.address || `Auftrag #${order?.orderNo || ""}`),
        start: startStr,
        end: endStr,
        allDay: false,
        status: String(order?.status || "pending"),
        type: "order",
        orderNo: order?.orderNo ?? null,
        address: String(order?.address || ""),
        customerName,
        zipcity,
        photographerKey: photographerKey || undefined,
        photographerName: photographerName || undefined,
        photographerColor,
        color: photographerColor,
        displayLabel,
      });
    }

    if (includeAbsences) {
      const absenceEvents = await loadAbsenceCalendarEvents(photographerColorMap, photographerKeyFilter);
      events.push(...absenceEvents);
    }

    events.sort((a, b) => {
      const at = new Date(a.start).getTime();
      const bt = new Date(b.start).getTime();
      if (!Number.isFinite(at) && !Number.isFinite(bt)) return 0;
      if (!Number.isFinite(at)) return 1;
      if (!Number.isFinite(bt)) return -1;
      return at - bt;
    });

    res.json({ ok: true, events });
  } catch (err) {
    console.error("[calendar-events] admin route error:", err?.message || err);
    res.status(500).json({ error: err.message || "Kalenderdaten konnten nicht geladen werden" });
  }
});

app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      // JSON fallback: Kunden aus Orders ableiten (nur Basisfelder)
      const orders = await loadOrders();
      const byEmail = new Map();
      for (const order of Array.isArray(orders) ? orders : []) {
        const billing = order?.billing && typeof order.billing === "object" ? order.billing : {};
        const email = String(billing?.email || "").trim().toLowerCase();
        if (!email) continue;
        const prev = byEmail.get(email) || {
          id: byEmail.size + 1,
          name: String(billing?.name || ""),
          email,
          company: String(billing?.company || ""),
          phone: String(billing?.phone || ""),
          street: String(billing?.street || ""),
          zipcity: String(billing?.zipcity || ""),
          blocked: false,
          is_admin: false,
          order_count: 0,
          customer_type: "customer",
        };
        prev.order_count += 1;
        byEmail.set(email, prev);
      }
      return res.json({ ok: true, customers: Array.from(byEmail.values()) });
    }

    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });

    const customerSelect = [
      "c.id",
      "c.name",
      "c.email",
      "c.company",
      "c.phone",
      "c.onsite_name",
      "c.onsite_phone",
      "c.street",
      "c.zipcity",
      "c.notes",
      "(to_jsonb(c)->>'nas_customer_folder_base') AS nas_customer_folder_base",
      "(to_jsonb(c)->>'nas_raw_folder_base') AS nas_raw_folder_base",
      "c.blocked",
      "COALESCE(c.is_admin, FALSE) AS is_admin",
      "'customer' AS customer_type",
      "COALESCE(c.salutation, '') AS salutation",
      "COALESCE(c.first_name, '') AS first_name",
      "COALESCE(c.address_addon_1, '') AS address_addon_1",
      "COALESCE(c.address_addon_2, '') AS address_addon_2",
      "COALESCE(c.address_addon_3, '') AS address_addon_3",
      "COALESCE(c.po_box, '') AS po_box",
      "COALESCE(c.zip, '') AS zip",
      "COALESCE(c.city, '') AS city",
      "COALESCE(NULLIF(c.country, ''), 'Schweiz') AS country",
      "COALESCE(c.phone_2, '') AS phone_2",
      "COALESCE(c.phone_mobile, '') AS phone_mobile",
      "COALESCE(c.phone_fax, '') AS phone_fax",
      "COALESCE(c.website, '') AS website",
      "COALESCE(c.exxas_customer_id, '') AS exxas_customer_id",
      "COALESCE(c.exxas_address_id, '') AS exxas_address_id",
      "COALESCE(oc.order_count, 0)::int AS order_count",
    ].join(",\n         ");

    const { rows } = await pool.query(
      `SELECT
         ${customerSelect}
       FROM customers c
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS order_count
         FROM orders o
         WHERE o.customer_id = c.id
            OR LOWER(TRIM(COALESCE(o.billing->>'email', ''))) = LOWER(TRIM(COALESCE(c.email, '')))
            OR LOWER(TRIM(COALESCE(o.object->>'email', ''))) = LOWER(TRIM(COALESCE(c.email, '')))
       ) oc ON TRUE
       ORDER BY c.updated_at DESC NULLS LAST, c.id DESC`
    );

    res.json({ ok: true, customers: rows || [] });
  } catch (err) {
    console.error("[customers] list error:", err?.message || err);
    res.status(500).json({ error: err.message || "Kunden konnten nicht geladen werden" });
  }
});

app.get("/api/admin/customers/:id", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const { rows } = await pool.query(
      `SELECT c.*,
              (to_jsonb(c)->>'nas_customer_folder_base') AS nas_customer_folder_base,
              (to_jsonb(c)->>'nas_raw_folder_base') AS nas_raw_folder_base
       FROM customers c
       WHERE c.id = $1
       LIMIT 1`,
      [customerId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Nicht gefunden" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message || "Kunde konnte nicht geladen werden" });
  }
});

app.get("/api/admin/customers/:id/orders", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    if (!db.getPool?.()) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const { rows: exists } = await db.getPool().query("SELECT 1 FROM customers WHERE id = $1", [customerId]);
    if (!exists.length) return res.status(404).json({ error: "Nicht gefunden" });
    const orders = await db.getOrdersForCustomerId(customerId);
    res.json(orders);
  } catch (err) {
    console.error("[customers/:id/orders]", err?.message || err);
    res.status(500).json({ error: err.message || "Auftraege konnten nicht geladen werden" });
  }
});

app.post("/api/admin/customers/:id/impersonate", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const { rows } = await pool.query("SELECT id, blocked FROM customers WHERE id = $1", [customerId]);
    if (!rows[0]) return res.status(404).json({ error: "Kunde nicht gefunden" });
    if (rows[0].blocked) return res.status(403).json({ error: "Gesperrter Kunde kann nicht impersoniert werden" });

    const token = customerAuth.createSessionToken();
    const tokenHash = customerAuth.hashSha256Hex(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await db.createCustomerSession({ customerId, tokenHash, expiresAt });

    const frontendUrl = String(process.env.FRONTEND_URL || "https://booking.propus.ch/").replace(/\/?$/, "/");
    const url = `${frontendUrl}?impersonate=${encodeURIComponent(token)}`;
    res.json({ ok: true, url });
  } catch (err) {
    res.status(500).json({ error: err.message || "Impersonate fehlgeschlagen" });
  }
});

app.post("/api/admin/customers", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "E-Mail erforderlich" });
    const v = (key, def = "") => (body[key] != null ? String(body[key]) : def);
    const zip = v("zip").trim();
    const city = v("city").trim();
    const zipcity = zip && city ? `${zip} ${city}` : v("zipcity");

    const { rows } = await pool.query(
      `INSERT INTO customers (
         email, name, company, phone, onsite_name, onsite_phone, street, zipcity, notes,
         salutation, first_name, address_addon_1, address_addon_2, address_addon_3, po_box, zip, city, country,
         phone_2, phone_mobile, phone_fax, website, nas_customer_folder_base, nas_raw_folder_base
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,
         $10,$11,$12,$13,$14,$15,$16,$17,$18,
         $19,$20,$21,$22,$23,$24
       )
       RETURNING *`,
      [
        email, v("name"), v("company"), v("phone"), v("onsite_name"), v("onsite_phone"), v("street"), zipcity, v("notes"),
        v("salutation"), v("first_name"), v("address_addon_1"), v("address_addon_2"), v("address_addon_3"), v("po_box"), zip, city, v("country", "Schweiz"),
        v("phone_2"), v("phone_mobile"), v("phone_fax"), v("website"),
        v("nas_customer_folder_base") || null,
        v("nas_raw_folder_base") || null,
      ],
    );
    if (req.companyId && rows[0]?.id) {
      await db.upsertCompanyMember({
        companyId: req.companyId,
        customerId: rows[0].id,
        email,
        role: "company_employee",
        status: "active",
      });
    }
    if (rows[0]?.id) {
      try {
        await rbac.syncCustomerRolesFromDb(Number(rows[0].id));
      } catch (_e) {}
    }
    res.json({ ok: true, customer: rows[0] });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "E-Mail bereits vorhanden" });
    res.status(500).json({ error: err.message || "Kunde konnte nicht erstellt werden" });
  }
});

app.put("/api/admin/customers/:id", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "E-Mail ist erforderlich" });

    const v = (key, def = "") => (body[key] != null ? String(body[key]) : def);
    const zip = v("zip").trim();
    const city = v("city").trim();
    const zipcity = zip && city ? `${zip} ${city}` : v("zipcity");
    const existing = await pool.query("SELECT id FROM customers WHERE LOWER(email)=LOWER($1) AND id<>$2", [email, customerId]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "Diese E-Mail-Adresse wird bereits von einem anderen Kunden verwendet." });
    }

    const { rows } = await pool.query(
      `UPDATE customers
       SET name=$1, company=$2, email=$3, phone=$4, onsite_name=$5, onsite_phone=$6, street=$7, zipcity=$8, notes=$9,
           salutation=$10, first_name=$11, address_addon_1=$12, address_addon_2=$13, address_addon_3=$14, po_box=$15, zip=$16, city=$17, country=$18,
           phone_2=$19, phone_mobile=$20, phone_fax=$21, website=$22, updated_at=NOW()
       WHERE id=$23
       RETURNING *`,
      [
        v("name"), v("company"), email, v("phone"), v("onsite_name"), v("onsite_phone"), v("street"), zipcity, v("notes"),
        v("salutation"), v("first_name"), v("address_addon_1"), v("address_addon_2"), v("address_addon_3"), v("po_box"), zip, city, v("country", "Schweiz"),
        v("phone_2"), v("phone_mobile"), v("phone_fax"), v("website"), customerId,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: "Nicht gefunden" });
    res.json({ ok: true, customer: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message || "Kunde konnte nicht gespeichert werden" });
  }
});

app.patch("/api/admin/customers/:id/email", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "E-Mail ist erforderlich" });
    if (!email.includes("@")) return res.status(400).json({ error: "Ungueltige E-Mail-Adresse" });
    const existing = await pool.query("SELECT id FROM customers WHERE LOWER(email)=LOWER($1) AND id<>$2", [email, customerId]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "Diese E-Mail-Adresse wird bereits von einem anderen Kunden verwendet." });
    }
    const { rows } = await pool.query(
      "UPDATE customers SET email=$1, updated_at=NOW() WHERE id=$2 RETURNING id, email",
      [email, customerId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Nicht gefunden" });
    res.json({ ok: true, email: rows[0].email });
  } catch (err) {
    res.status(500).json({ error: err.message || "E-Mail konnte nicht gespeichert werden" });
  }
});

app.patch("/api/admin/customers/:id/blocked", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const blocked = !!req.body?.blocked;
    await pool.query("UPDATE customers SET blocked=$1, updated_at=NOW() WHERE id=$2", [blocked, customerId]);
    if (blocked) {
      await pool.query("DELETE FROM customer_sessions WHERE customer_id=$1", [customerId]);
    }
    res.json({ ok: true, blocked });
  } catch (err) {
    res.status(500).json({ error: err.message || "Kunde konnte nicht gesperrt werden" });
  }
});

app.patch("/api/admin/customers/:id/admin", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const is_admin = !!req.body?.is_admin;
    const { rows } = await pool.query(
      "UPDATE customers SET is_admin=$1, updated_at=NOW() WHERE id=$2 RETURNING id, is_admin",
      [is_admin, customerId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Nicht gefunden" });
    try {
      await rbac.syncCustomerRolesFromDb(customerId);
    } catch (_e) {}
    res.json({ ok: true, is_admin: rows[0].is_admin });
  } catch (err) {
    res.status(500).json({ error: err.message || "Admin-Status konnte nicht gespeichert werden" });
  }
});

app.post("/api/admin/customers/:id/reset-password", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const newPassword = String(req.body?.newPassword || "").trim();
    if (!newPassword) return res.status(400).json({ error: "Neues Passwort ist erforderlich" });
    let passwordHash;
    try {
      passwordHash = await customerAuth.hashPassword(newPassword);
    } catch (e) {
      return res.status(400).json({ error: e && e.message ? String(e.message) : "Ungueltiges Passwort" });
    }
    const { rowCount } = await pool.query(
      "UPDATE customers SET password_hash=$1, updated_at=NOW() WHERE id=$2",
      [passwordHash, customerId],
    );
    if (!rowCount) return res.status(404).json({ error: "Nicht gefunden" });
    await pool.query("DELETE FROM customer_sessions WHERE customer_id=$1", [customerId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Passwort konnte nicht gesetzt werden" });
  }
});

app.delete("/api/admin/customers/:id", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const force = String(req.query.force || "false").toLowerCase() === "true";
    const { rows: countRows } = await pool.query("SELECT COUNT(*)::int AS cnt FROM orders WHERE customer_id = $1", [customerId]);
    const orderCount = Number(countRows[0]?.cnt || 0);
    if (orderCount > 0 && !force) {
      return res.status(409).json({ error: "Kunde hat verknuepfte Auftraege", orderCount, requiresForce: true });
    }
    await pool.query("DELETE FROM customer_sessions WHERE customer_id = $1", [customerId]);
    await pool.query("DELETE FROM customer_contacts WHERE customer_id = $1", [customerId]);
    if (req.companyId) {
      await pool.query("DELETE FROM company_members WHERE company_id = $1 AND customer_id = $2", [req.companyId, customerId]);
    }
    if (force) {
      await pool.query("UPDATE orders SET customer_id = NULL WHERE customer_id = $1", [customerId]);
    }
    await pool.query("DELETE FROM customers WHERE id = $1", [customerId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message || "Kunde konnte nicht geloescht werden" });
  }
});

app.patch("/api/admin/customers/:id/nas-folder-bases", requireAdmin, async (req, res) => {
  try {
    const customerId = Number(req.params.id);
    if (!Number.isFinite(customerId)) return res.status(400).json({ error: "Ungueltige Kunden-ID" });
    if (!(await ensureCustomerInRequestCompany(req, customerId))) {
      return res.status(404).json({ error: "Nicht gefunden" });
    }
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const { nasCustomerFolderBase, nasRawFolderBase } = req.body || {};
    await db.updateCustomerNasStorageBases(customerId, { nasCustomerFolderBase, nasRawFolderBase });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "NAS-Pfade konnten nicht gespeichert werden" });
  }
});

app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
  try {
    const settings = await listEffectiveDefaults();
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(500).json({ error: err.message || "Settings konnten nicht geladen werden" });
  }
});

app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const payload = req.body?.settings;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ error: "settings object erforderlich" });
    }
    await setSystemSettings(payload);
    const settings = await listEffectiveDefaults();
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(400).json({ error: err.message || "Settings konnten nicht gespeichert werden" });
  }
});

app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const payload = req.body?.settings;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return res.status(400).json({ error: "settings object erforderlich" });
    }
    const entries = Object.entries(payload).map(([key, value]) => ({ key, value }));
    await db.upsertAppSettings(entries);
    const settings = await listEffectiveDefaults();
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(400).json({ error: err.message || "Settings konnten nicht gespeichert werden" });
  }
});

// Backward-compatible single-key patch endpoint
app.patch("/api/admin/settings/:key", requireAdmin, async (req, res) => {
  try {
    const key = String(req.params.key || "").trim();
    if (!key) return res.status(400).json({ error: "key fehlt" });
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, "value")) {
      return res.status(400).json({ error: "value fehlt" });
    }
    await setSystemSettings({ [key]: req.body.value });
    res.json({ ok: true, key, value: req.body.value });
  } catch (err) {
    res.status(400).json({ error: err.message || "Setting konnte nicht gespeichert werden" });
  }
});

app.post("/api/admin/integrations/exxas/fields", requireAdmin, async (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey || "").trim();
    const appPassword = String(req.body?.appPassword || "").trim();
    const endpoint = String(req.body?.endpoint || "").trim();
    const result = await loadExxasFieldCatalog({ apiKey, appPassword, endpoint });
    res.json({
      ok: true,
      source: result.source,
      fields: result.fields,
      categories: result.fields.reduce((acc, field) => {
        const category = String(field.category || "Allgemein");
        if (!acc[category]) acc[category] = [];
        acc[category].push(field);
        return acc;
      }, {}),
    });
  } catch (err) {
    res.status(502).json({ error: err.message || "EXXAS Felder konnten nicht geladen werden" });
  }
});

app.get("/api/admin/discount-codes", requireAdmin, async (req, res) => {
  try {
    const includeInactive = String(req.query.includeInactive || "true").toLowerCase() !== "false";
    const rows = await db.listDiscountCodes({ includeInactive });
    res.json({ ok: true, discountCodes: rows });
  } catch (err) {
    res.status(500).json({ error: err.message || "Discount-Codes konnten nicht geladen werden" });
  }
});

// Shadow-Mode Log - zeigt die letzten Pricing/Assignment-Vergleiche (in-memory)
app.get("/api/admin/shadow-log", requireAdmin, (req, res) => {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || "50", 10)));
  const filterType = req.query.type || null; // "pricing" | "assignment" | null = alle
  const onlyDiffs = String(req.query.onlyDiffs || "false").toLowerCase() === "true";
  let entries = getShadowLog();
  if (filterType) entries = entries.filter((e) => e.type === filterType);
  if (onlyDiffs) entries = entries.filter((e) => !e.equal);
  res.json({
    ok: true,
    count: entries.slice(0, limit).length,
    total: entries.length,
    entries: entries.slice(0, limit),
  });
});

// Shadow-Mode Flags setzen (Admin-Shortcut ohne volle Settings-Page)
app.post("/api/admin/shadow-log/flags", requireAdmin, async (req, res) => {
  try {
    const { pricingShadow, assignmentShadow } = req.body || {};
    const updates = {};
    if (pricingShadow !== undefined) updates["feature.pricingShadow"] = !!pricingShadow;
    if (assignmentShadow !== undefined) updates["feature.assignmentShadow"] = !!assignmentShadow;
    if (!Object.keys(updates).length) return res.status(400).json({ error: "Keine Flags angegeben" });
    await settingsResolverSet(updates);
    res.json({ ok: true, updated: updates });
  } catch (err) {
    res.status(500).json({ error: err.message || "Shadow-Flags konnten nicht gesetzt werden" });
  }
});

app.post("/api/admin/discount-codes", requireAdmin, async (req, res) => {
  try {
    const created = await db.createDiscountCode(req.body || {});
    res.json({ ok: true, discountCode: created });
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "Code existiert bereits" });
    res.status(400).json({ error: err.message || "Discount-Code konnte nicht erstellt werden" });
  }
});

app.patch("/api/admin/discount-codes/:id", requireAdmin, async (req, res) => {
  try {
    const updated = await db.updateDiscountCode(req.params.id, req.body || {});
    res.json({ ok: true, discountCode: updated });
  } catch (err) {
    if (err?.code === "23505") return res.status(409).json({ error: "Code existiert bereits" });
    res.status(400).json({ error: err.message || "Discount-Code konnte nicht gespeichert werden" });
  }
});

app.delete("/api/admin/discount-codes/:id", requireAdmin, async (req, res) => {
  try {
    await db.deleteDiscountCode(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Discount-Code konnte nicht gel-scht werden" });
  }
});

app.get("/api/admin/discount-codes/:id/usages", requireAdmin, async (req, res) => {
  try {
    const rows = await db.listDiscountCodeUsages(req.params.id, { limit: Number(req.query.limit || 200) });
    res.json({ ok: true, usages: rows });
  } catch (err) {
    res.status(400).json({ error: err.message || "Discount-Code-Nutzungen konnten nicht geladen werden" });
  }
});

// Company Workspace
function parseCompanyMemberRoleFromBody(rawRole, actorMemberRole) {
  const r = String(rawRole || "").trim().toLowerCase().replace(/-/g, "_");
  let role = "company_employee";
  if (r === "company_owner" || r === "owner") role = "company_owner";
  else if (r === "company_admin" || r === "admin") role = "company_admin";
  if (role === "company_owner" && actorMemberRole !== "company_owner") {
    return { error: "Nur Hauptkontakt (company_owner) darf diese Rolle vergeben." };
  }
  return { role };
}

app.get("/api/company/me", requireCompanyMember, async (req, res) => {
  try {
    const company = await db.getCompanyById(req.companyId);
    if (!company) return res.status(404).json({ error: "Firma nicht gefunden" });
    res.json({
      ok: true,
      role: req.companyMembership?.role || "company_employee",
      membership: req.companyMembership,
      company,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Firma konnte nicht geladen werden" });
  }
});

app.get("/api/company/members", requireCompanyMember, async (req, res) => {
  try {
    const members = await db.listCompanyMembers(req.companyId);
    res.json({ ok: true, members });
  } catch (err) {
    res.status(500).json({ error: err.message || "Mitglieder konnten nicht geladen werden" });
  }
});

app.post("/api/company/invitations", requireCompanyAdmin, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Gueltige E-Mail erforderlich" });
    const parsed = parseCompanyMemberRoleFromBody(req.body?.role, req.companyMembership?.role);
    if (parsed.error) return res.status(403).json({ error: parsed.error });
    const role = parsed.role;
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await db.createCompanyInvitation({
      companyId: req.companyId,
      email,
      role,
      token,
      expiresAt,
      invitedBy: req.user?.email || req.user?.id || "",
    });
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "company_invite",
      targetType: "company_invitation",
      targetId: String(invitation?.id || email),
      details: { companyId: req.companyId, email, role },
      ipAddress: req.ip,
    });
    res.status(201).json({ ok: true, invitation });
  } catch (err) {
    res.status(400).json({ error: err.message || "Einladung konnte nicht erstellt werden" });
  }
});

app.get("/api/company/invitations", requireCompanyMember, async (req, res) => {
  try {
    const invitations = await db.listCompanyInvitations(req.companyId, {
      includeExpired: String(req.query.includeExpired || "false").toLowerCase() === "true",
    });
    res.json({ ok: true, invitations });
  } catch (err) {
    res.status(500).json({ error: err.message || "Einladungen konnten nicht geladen werden" });
  }
});

app.post("/api/company/invitations/accept", async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Nicht authentifiziert." });
  next();
}, async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ error: "token erforderlich" });
    const result = await db.acceptCompanyInvitation({
      token,
      keycloakSubject: req.user?.id || "",
      email: req.user?.email || "",
    });
    if (!result) return res.status(404).json({ error: "Einladung nicht gefunden" });
    if (result.expired) return res.status(400).json({ error: "Einladung ist abgelaufen" });
    if (result.accepted && result.member) {
      try {
        const co = await db.getCompanyById(Number(result.invitation.company_id));
        if (co) await logtoOrgSync.ensureOrganizationForCompany(co);
        await logtoOrgSync.addCompanyMemberToLogtoOrg(Number(result.invitation.company_id), result.member);
      } catch (_syncErr) {}
    }
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message || "Einladung konnte nicht akzeptiert werden" });
  }
});

app.delete("/api/company/invitations/:id", requireCompanyAdmin, async (req, res) => {
  try {
    const invitations = await db.listCompanyInvitations(req.companyId, { includeExpired: true });
    const target = invitations.find((i) => Number(i.id) === Number(req.params.id));
    if (!target) return res.status(404).json({ error: "Einladung nicht gefunden" });
    if (target.accepted_at) return res.status(400).json({ error: "Bereits akzeptierte Einladung kann nicht geloescht werden" });
    await db.query("DELETE FROM company_invitations WHERE id = $1 AND company_id = $2", [req.params.id, req.companyId]);
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "company_invitation_delete",
      targetType: "company_invitation",
      targetId: String(req.params.id),
      details: { companyId: req.companyId, email: target.email },
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Einladung konnte nicht geloescht werden" });
  }
});

app.post("/api/company/invitations/:id/resend", requireCompanyAdmin, async (req, res) => {
  try {
    const invitations = await db.listCompanyInvitations(req.companyId, { includeExpired: true });
    const target = invitations.find((i) => Number(i.id) === Number(req.params.id));
    if (!target) return res.status(404).json({ error: "Einladung nicht gefunden" });
    if (target.accepted_at) return res.status(400).json({ error: "Bereits akzeptierte Einladung kann nicht erneut gesendet werden" });
    const newToken = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await db.createCompanyInvitation({
      companyId: req.companyId,
      email: target.email,
      role: target.role,
      token: newToken,
      expiresAt,
      invitedBy: req.user?.email || req.user?.id || "",
    });
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "company_invitation_resend",
      targetType: "company_invitation",
      targetId: String(invitation?.id || req.params.id),
      details: { companyId: req.companyId, email: target.email },
      ipAddress: req.ip,
    });
    res.json({ ok: true, invitation });
  } catch (err) {
    res.status(400).json({ error: err.message || "Einladung konnte nicht erneut gesendet werden" });
  }
});

app.patch("/api/company/members/:id/role", requireCompanyAdmin, async (req, res) => {
  try {
    const members = await db.listCompanyMembers(req.companyId);
    const target = members.find((m) => Number(m.id) === Number(req.params.id));
    if (!target) return res.status(404).json({ error: "Mitglied nicht gefunden" });
    if (req.companyMembership && Number(target.id) === Number(req.companyMembership.id)) {
      return res.status(403).json({ error: "Eigene Rolle kann nicht geaendert werden." });
    }
    const parsed = parseCompanyMemberRoleFromBody(req.body?.role, req.companyMembership?.role);
    if (parsed.error) return res.status(403).json({ error: parsed.error });
    const role = parsed.role;
    if (target.role === "company_admin" || target.role === "company_owner") {
      const adminCount = members.filter((m) => m.status === "active" && (m.role === "company_admin" || m.role === "company_owner")).length;
      if (role === "company_employee" && adminCount <= 1) {
        return res.status(403).json({ error: "Mindestens ein Admin muss aktiv bleiben." });
      }
    }
    const updated = await db.updateCompanyMemberRole(req.params.id, role);
    try {
      await rbac.syncCompanyMemberRolesFromDb(Number(req.params.id));
    } catch (_e) {}
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "company_member_role",
      targetType: "company_member",
      targetId: String(req.params.id),
      details: { companyId: req.companyId, role },
      ipAddress: req.ip,
    });
    res.json({ ok: true, member: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || "Rolle konnte nicht gesetzt werden" });
  }
});

app.patch("/api/company/members/:id/active", requireCompanyAdmin, async (req, res) => {
  try {
    const members = await db.listCompanyMembers(req.companyId);
    const target = members.find((m) => Number(m.id) === Number(req.params.id));
    if (!target) return res.status(404).json({ error: "Mitglied nicht gefunden" });
    if (req.companyMembership && Number(target.id) === Number(req.companyMembership.id)) {
      return res.status(403).json({ error: "Eigener Status kann nicht geaendert werden." });
    }
    const status = req.body?.active ? "active" : "disabled";
    if (status === "disabled" && (target.role === "company_admin" || target.role === "company_owner")) {
      const adminCount = members.filter((m) => m.status === "active" && (m.role === "company_admin" || m.role === "company_owner")).length;
      if (adminCount <= 1) {
        return res.status(403).json({ error: "Der letzte Admin kann nicht deaktiviert werden." });
      }
    }
    const updated = await db.updateCompanyMemberStatus(req.params.id, status);
    try {
      const merged = { ...target, ...updated };
      if (status === "disabled") {
        await logtoOrgSync.removeCompanyMemberFromLogtoOrg(req.companyId, merged);
      } else if (status === "active") {
        await logtoOrgSync.addCompanyMemberToLogtoOrg(req.companyId, merged);
      }
    } catch (_e) {}
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "company_member_active",
      targetType: "company_member",
      targetId: String(req.params.id),
      details: { companyId: req.companyId, status },
      ipAddress: req.ip,
    });
    res.json({ ok: true, member: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || "Status konnte nicht gesetzt werden" });
  }
});

app.get("/api/company/orders", requireCompanyMember, async (req, res) => {
  try {
    const orders = await db.listCompanyOrders(req.companyId, {
      limit: Number(req.query.limit || 200),
      offset: Number(req.query.offset || 0),
      member: req.companyMembership,
    });
    res.json({ ok: true, orders });
  } catch (err) {
    res.status(500).json({ error: err.message || "Auftraege konnten nicht geladen werden" });
  }
});

app.get("/api/company/customers", requireCompanyMember, async (req, res) => {
  try {
    const customers = await db.listCompanyCustomers(req.companyId, { member: req.companyMembership });
    res.json({ ok: true, customers });
  } catch (err) {
    res.status(500).json({ error: err.message || "Kunden konnten nicht geladen werden" });
  }
});

app.patch("/api/company/profile", requireCompanyAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name erforderlich" });
    const { rows } = await db.query(
      `UPDATE companies
       SET name = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, slug, billing_customer_id, created_at, updated_at`,
      [req.companyId, name]
    );
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "company_profile_update",
      targetType: "company",
      targetId: String(req.companyId),
      details: { name },
      ipAddress: req.ip,
    });
    const co = rows[0] || null;
    try {
      if (co) await logtoOrgSync.ensureOrganizationForCompany(co);
    } catch (_e) {}
    res.json({ ok: true, company: co });
  } catch (err) {
    res.status(400).json({ error: err.message || "Firmenprofil konnte nicht gespeichert werden" });
  }
});

app.get("/api/admin/company-migration/preview", requireSuperAdmin, async (_req, res) => {
  try {
    const preview = await db.bootstrapCompaniesFromCustomers({ dryRun: true });
    res.json({ ok: true, ...preview });
  } catch (err) {
    res.status(500).json({ error: err.message || "Migration-Preview fehlgeschlagen" });
  }
});

async function syncAllActiveCompanyMembersToProviders() {
  const companies = await db.listCompanies({ limit: 5000, offset: 0, queryText: "" });
  for (const company of companies || []) {
    try {
      await logtoOrgSync.ensureOrganizationForCompany(company);
    } catch (_e) {}
    const members = await db.listCompanyMembers(company.id);
    for (const member of members || []) {
      if (String(member.status || "") !== "active") continue;
      try {
        await logtoOrgSync.addCompanyMemberToLogtoOrg(company.id, member);
      } catch (_e) {}
      try {
        await rbac.syncCompanyMemberRolesFromDb(Number(member.id));
      } catch (_e) {}
    }
  }
}

app.post("/api/admin/company-migration/run", requireSuperAdmin, async (_req, res) => {
  try {
    const result = await db.syncCompaniesFromCustomersAndContacts();
    await syncAllActiveCompanyMembersToProviders();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message || "Migration fehlgeschlagen" });
  }
});

function parseAdminCompanyInviteRole(raw) {
  const r = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (r === "company_owner" || r === "owner" || r === "hauptkontakt") return "company_owner";
  if (r === "company_admin" || r === "admin") return "company_admin";
  return "company_employee";
}

const MANUAL_INVITE_EMAIL_DOMAIN = "invite.buchungstool.invalid";

function sanitizeCompanyInviteLoginName(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 64);
}

function buildSyntheticManualInviteEmail(companyId, loginSlug) {
  return `manual-c${Number(companyId)}-${loginSlug}@${MANUAL_INVITE_EMAIL_DOMAIN}`;
}

function toLegacyUserRole(companyRole) {
  return companyRole === "company_employee" ? "mitarbeiter" : "hauptkontakt";
}

/** Benutzerverwaltung: keine Kunden-/CRM-Felder ausliefern (nur interne Workspace-Mitglieder). */
function mapCompanyMembersForAdminUsersList(members) {
  if (!Array.isArray(members)) return [];
  return members.map((m) => ({
    id: Number(m.id),
    company_id: Number(m.company_id),
    keycloak_subject: String(m.keycloak_subject || ""),
    email: String(m.email || ""),
    role: m.role,
    status: String(m.status || "active"),
    is_primary_contact: Boolean(m.is_primary_contact),
    created_at: m.created_at,
    updated_at: m.updated_at,
  }));
}

async function buildAdminCompaniesPayload({ q = "", status = "alle" } = {}) {
  try {
    await db.syncCompaniesFromCustomersAndContacts();
  } catch (_syncErr) {}
  const rows = await db.listCompanies({ limit: 500, offset: 0, queryText: q });
  const companies = [];
  let haupt = 0;
  let mitarbeiter = 0;
  let pendingInv = 0;
  let aktivFirmen = 0;

  for (const c of rows) {
    const membersRaw = await db.listCompanyMembers(c.id);
    const members = mapCompanyMembersForAdminUsersList(membersRaw);
    const invitations = await db.listCompanyInvitations(c.id, { includeExpired: false });
    const openInv = invitations.filter((i) => !i.accepted_at && new Date(i.expires_at).getTime() > Date.now());
    const activeMain = members.filter(
      (m) => m.status === "active" && (m.role === "company_owner" || m.role === "company_admin"),
    );
    const activeStaff = members.filter((m) => m.status === "active" && m.role === "company_employee");
    const hasMain = activeMain.length > 0;
    const hasActiveAny = members.some((m) => m.status === "active");
    const uiStatus = hasMain ? "aktiv" : (openInv.length > 0 ? "ausstehend" : "inaktiv");
    if (hasMain) aktivFirmen += 1;
    haupt += activeMain.length;
    mitarbeiter += activeStaff.length;
    pendingInv += openInv.length;
    companies.push({
      ...c,
      status: uiStatus,
      uiStatus,
      hauptkontakte_count: activeMain.length,
      mitarbeiter_count: activeStaff.length,
      pending_invitations: openInv.length,
      has_active_any: hasActiveAny,
      members,
      invitations: openInv,
    });
  }

  const filtered = companies.filter((c) => {
    if (status === "alle") return true;
    if (status === "aktiv") return c.status === "aktiv";
    if (status === "ausstehend") return c.status === "ausstehend";
    if (status === "inaktiv") return c.status === "inaktiv";
    return true;
  });

  return {
    stats: {
      aktiveFirmen: aktivFirmen,
      hauptkontakte: haupt,
      mitarbeiterZugaenge: mitarbeiter,
      ausstehendeEinladungen: pendingInv,
      active_companies: aktivFirmen,
      main_contacts: haupt,
      employees: mitarbeiter,
      pending_invitations: pendingInv,
    },
    companies: filtered,
  };
}

app.get("/api/admin/companies", requireAdmin, async (req, res) => {
  try {
    const payload = await buildAdminCompaniesPayload({
      q: String(req.query?.q || req.query?.search || ""),
      status: String(req.query?.status || "alle").toLowerCase(),
    });
    res.json({
      ok: true,
      stats: {
        aktiveFirmen: payload.stats.aktiveFirmen,
        hauptkontakte: payload.stats.hauptkontakte,
        mitarbeiterZugaenge: payload.stats.mitarbeiterZugaenge,
        ausstehendeEinladungen: payload.stats.ausstehendeEinladungen,
      },
      companies: payload.companies,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Firmen konnten nicht geladen werden" });
  }
});

app.post("/api/admin/companies", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Firmenname erforderlich" });
    const standort = String(req.body?.standort || "").trim();
    const notiz = String(req.body?.notiz || "").trim();
    const inviteEmail = String(req.body?.inviteEmail || req.body?.primaryContactEmail || "")
      .trim()
      .toLowerCase();
    const inviteRole = parseAdminCompanyInviteRole(req.body?.inviteRole || "company_owner");
    const company = await db.createCompanyWithMeta({ name, standort, notiz, billingCustomerId: null });
    if (!company) return res.status(500).json({ error: "Firma konnte nicht angelegt werden" });
    let invitation = null;
    if (inviteEmail && inviteEmail.includes("@")) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      invitation = await db.createCompanyInvitation({
        companyId: company.id,
        email: inviteEmail,
        role: inviteRole,
        token,
        expiresAt,
        invitedBy: req.user?.email || req.user?.id || "admin",
      });
    }
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "admin_company_create",
      targetType: "company",
      targetId: String(company.id),
      details: { name, standort, inviteEmail: inviteEmail || null },
      ipAddress: req.ip,
    });
    try {
      await logtoOrgSync.ensureOrganizationForCompany(company);
    } catch (_e) {}
    res.status(201).json({ ok: true, company, invitation });
  } catch (err) {
    res.status(400).json({ error: err.message || "Firma konnte nicht angelegt werden" });
  }
});

app.post("/api/admin/companies/:companyId/invitations", requireAdmin, async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const co = await db.getCompanyById(companyId);
    if (!co) return res.status(404).json({ error: "Firma nicht gefunden" });
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return res.status(400).json({ error: "Gueltige E-Mail erforderlich" });
    const role = parseAdminCompanyInviteRole(req.body?.role || "company_employee");
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await db.createCompanyInvitation({
      companyId,
      email,
      role,
      token,
      expiresAt,
      invitedBy: req.user?.email || req.user?.id || "admin",
    });
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "admin_company_invite",
      targetType: "company_invitation",
      targetId: String(invitation?.id || email),
      details: { companyId, email, role },
      ipAddress: req.ip,
    });
    res.status(201).json({ ok: true, invitation });
  } catch (err) {
    res.status(400).json({ error: err.message || "Einladung konnte nicht erstellt werden" });
  }
});

app.delete("/api/admin/companies/:companyId/invitations/:invitationId", requireAdmin, async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const invitationId = Number(req.params.invitationId);
    const invQ = await db.query(
      "SELECT id, company_id, accepted_at FROM company_invitations WHERE id = $1 LIMIT 1",
      [invitationId]
    );
    const inv = invQ.rows[0];
    if (!inv) return res.status(404).json({ error: "Einladung nicht gefunden" });
    if (Number(inv.company_id) !== companyId) return res.status(400).json({ error: "Ungueltige Firma" });
    if (inv.accepted_at) return res.status(400).json({ error: "Einladung bereits akzeptiert" });
    await db.query("DELETE FROM company_invitations WHERE id = $1", [invitationId]);
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "admin_company_invitation_delete",
      targetType: "company_invitation",
      targetId: String(invitationId),
      details: { companyId },
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Einladung konnte nicht geloescht werden" });
  }
});

app.patch("/api/admin/companies/:companyId/members/:memberId/role", requireAdmin, async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const memberId = Number(req.params.memberId);
    const members = await db.listCompanyMembers(companyId);
    const target = members.find((m) => Number(m.id) === memberId);
    if (!target) return res.status(404).json({ error: "Mitglied nicht gefunden" });
    const role = parseAdminCompanyInviteRole(req.body?.role);
    const updated = await db.updateCompanyMemberRole(memberId, role);
    try {
      await rbac.syncCompanyMemberRolesFromDb(memberId);
    } catch (_e) {}
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "admin_company_member_role",
      targetType: "company_member",
      targetId: String(memberId),
      details: { companyId, role },
      ipAddress: req.ip,
    });
    res.json({ ok: true, member: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || "Rolle konnte nicht gesetzt werden" });
  }
});

app.patch("/api/admin/companies/:companyId/members/:memberId/status", requireAdmin, async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const memberId = Number(req.params.memberId);
    const members = await db.listCompanyMembers(companyId);
    const target = members.find((m) => Number(m.id) === memberId);
    if (!target) return res.status(404).json({ error: "Mitglied nicht gefunden" });
    let st = String(req.body?.status || "").trim();
    if (req.body?.active === true) st = "active";
    if (req.body?.active === false) st = "disabled";
    if (!["active", "disabled", "invited"].includes(st)) {
      return res.status(400).json({ error: "Ungueltiger Status" });
    }
    const updated = await db.updateCompanyMemberStatus(memberId, st);
    const merged = { ...target, ...updated };
    try {
      if (st === "disabled") {
        await logtoOrgSync.removeCompanyMemberFromLogtoOrg(companyId, merged);
      } else if (st === "active") {
        await logtoOrgSync.addCompanyMemberToLogtoOrg(companyId, merged);
      }
    } catch (_e) {}
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "admin_company_member_status",
      targetType: "company_member",
      targetId: String(memberId),
      details: { companyId, status: st },
      ipAddress: req.ip,
    });
    res.json({ ok: true, member: updated });
  } catch (err) {
    res.status(400).json({ error: err.message || "Status konnte nicht gesetzt werden" });
  }
});

app.delete("/api/admin/companies/:companyId", requireSuperAdmin, async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const co = await db.getCompanyById(companyId);
    if (!co) return res.status(404).json({ error: "Firma nicht gefunden" });
    try {
      await logtoOrgSync.deleteOrganizationForCompany(companyId);
    } catch (_e) {}
    await db.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    const authCtx = buildAuthContext(req);
    await db.logAuthAudit({
      actorId: authCtx.userId || authCtx.email,
      actorRole: authCtx.companyRole || authCtx.role,
      action: "admin_company_delete",
      targetType: "company",
      targetId: String(companyId),
      details: {},
      ipAddress: req.ip,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message || "Firma konnte nicht geloescht werden" });
  }
});

// Legacy-compatible alias routes for user management pages.
app.get("/api/admin/users/companies", requireAdmin, async (req, res) => {
  try {
    const payload = await buildAdminCompaniesPayload({
      q: String(req.query?.q || req.query?.search || ""),
      status: String(req.query?.status || "alle").toLowerCase(),
    });
    const companies = payload.companies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      standort: c.standort || "",
      notiz: c.notiz || "",
      status: c.status,
      uiStatus: c.uiStatus,
      hauptkontakte_count: Number(c.hauptkontakte_count || 0),
      mitarbeiter_count: Number(c.mitarbeiter_count || 0),
      pending_invitations: Number(c.pending_invitations || 0),
      members: (c.members || []).map((m) => ({
        ...m,
        role: m.role,
        ui_role: toLegacyUserRole(m.role),
      })),
      invitations: c.invitations || [],
      created_at: c.created_at,
      updated_at: c.updated_at,
    }));
    return res.json({
      ok: true,
      stats: {
        active_companies: payload.stats.active_companies,
        main_contacts: payload.stats.main_contacts,
        employees: payload.stats.employees,
        pending_invitations: payload.stats.pending_invitations,
      },
      companies,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Firmen konnten nicht geladen werden" });
  }
});

app.post("/api/admin/users/companies", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Firmenname erforderlich" });
    const standort = String(req.body?.standort || "").trim();
    const notiz = String(req.body?.notiz || "").trim();
    const inviteEmail = String(req.body?.mainContactEmail || req.body?.inviteEmail || "").trim().toLowerCase();
    const inviteRole = parseAdminCompanyInviteRole(req.body?.inviteRole || req.body?.role || "company_owner");
    const company = await db.createCompanyWithMeta({ name, standort, notiz, billingCustomerId: null });
    if (!company) return res.status(500).json({ error: "Firma konnte nicht angelegt werden" });
    let invitation = null;
    if (inviteEmail && inviteEmail.includes("@")) {
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      invitation = await db.createCompanyInvitation({
        companyId: company.id,
        email: inviteEmail,
        role: inviteRole,
        token,
        expiresAt,
        invitedBy: req.user?.email || req.user?.id || "admin",
      });
    }
    try {
      await logtoOrgSync.ensureOrganizationForCompany(company);
    } catch (_e) {}
    return res.status(201).json({ ok: true, company, invitation });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Firma konnte nicht angelegt werden" });
  }
});

app.post("/api/admin/users/companies/:companyId/invitations", requireAdmin, async (req, res) => {
  try {
    const companyId = Number(req.params.companyId);
    const co = await db.getCompanyById(companyId);
    if (!co) return res.status(404).json({ error: "Firma nicht gefunden" });
    const role = parseAdminCompanyInviteRole(req.body?.role || "company_employee");
    const givenName = String(req.body?.givenName ?? req.body?.vorname ?? "").trim();
    const familyName = String(req.body?.familyName ?? req.body?.nachname ?? "").trim();
    const loginNameRaw = String(req.body?.loginName ?? req.body?.login_name ?? "").trim();
    const loginSlug = sanitizeCompanyInviteLoginName(loginNameRaw);
    let email = String(req.body?.email || "").trim().toLowerCase();

    if (email.includes("@")) {
      // echte E-Mail
    } else if (loginSlug && givenName && familyName) {
      email = buildSyntheticManualInviteEmail(companyId, loginSlug);
    } else {
      return res.status(400).json({
        error:
          "Gueltige E-Mail erforderlich, oder manuell: Vorname, Nachname und Login-Name (nur Buchstaben, Ziffern, . _ -).",
      });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await db.createCompanyInvitation({
      companyId,
      email,
      role,
      token,
      expiresAt,
      invitedBy: req.user?.email || req.user?.id || "admin",
      givenName,
      familyName,
      loginName: loginSlug || String(loginNameRaw).trim().toLowerCase(),
    });
    return res.status(201).json({ ok: true, invitation });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Einladung konnte nicht erstellt werden" });
  }
});

app.patch("/api/admin/users/members/:memberId/role", requireAdmin, async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    const q = await db.query("SELECT id, company_id FROM company_members WHERE id = $1 LIMIT 1", [memberId]);
    const target = q.rows[0];
    if (!target) return res.status(404).json({ error: "Mitglied nicht gefunden" });
    const role = parseAdminCompanyInviteRole(req.body?.role);
    const updated = await db.updateCompanyMemberRole(memberId, role);
    try {
      await rbac.syncCompanyMemberRolesFromDb(memberId);
    } catch (_e) {}
    return res.json({ ok: true, member: updated, companyId: Number(target.company_id) });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Rolle konnte nicht gesetzt werden" });
  }
});

app.patch("/api/admin/users/members/:memberId/status", requireAdmin, async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    const q = await db.query("SELECT * FROM company_members WHERE id = $1 LIMIT 1", [memberId]);
    const target = q.rows[0];
    if (!target) return res.status(404).json({ error: "Mitglied nicht gefunden" });
    let st = String(req.body?.status || "").trim();
    if (req.body?.active === true) st = "active";
    if (req.body?.active === false) st = "disabled";
    if (!["active", "disabled", "invited"].includes(st)) {
      return res.status(400).json({ error: "Ungueltiger Status" });
    }
    const updated = await db.updateCompanyMemberStatus(memberId, st);
    const companyId = Number(target.company_id);
    const merged = { ...target, ...updated };
    try {
      if (st === "disabled") {
        await logtoOrgSync.removeCompanyMemberFromLogtoOrg(companyId, merged);
      } else if (st === "active") {
        await logtoOrgSync.addCompanyMemberToLogtoOrg(companyId, merged);
      }
    } catch (_e) {}
    return res.json({ ok: true, member: updated, companyId });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Status konnte nicht gesetzt werden" });
  }
});

app.post("/api/admin/users/invitations/:invitationId/resend", requireAdmin, async (req, res) => {
  try {
    const invitationId = Number(req.params.invitationId);
    const invQ = await db.query(
      "SELECT id, company_id, email, role, given_name, family_name, login_name FROM company_invitations WHERE id = $1 LIMIT 1",
      [invitationId]
    );
    const inv = invQ.rows[0];
    if (!inv) return res.status(404).json({ error: "Einladung nicht gefunden" });
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await db.createCompanyInvitation({
      companyId: Number(inv.company_id),
      email: String(inv.email || "").toLowerCase(),
      role: parseAdminCompanyInviteRole(inv.role),
      token,
      expiresAt,
      invitedBy: req.user?.email || req.user?.id || "admin",
      givenName: String(inv.given_name || ""),
      familyName: String(inv.family_name || ""),
      loginName: String(inv.login_name || ""),
    });
    return res.json({ ok: true, invitation });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Einladung konnte nicht erneut gesendet werden" });
  }
});

// ─── Interne Benutzer (Logto) ────────────────────────────────────────────────
const logtoClient = require('./logto-client');

const INTERNAL_ROLES = ['admin', 'super_admin', 'photographer'];

// GET /api/admin/internal-users – alle internen Logto-User mit ihren Rollen
app.get("/api/admin/internal-users", requireAdmin, async (req, res) => {
  if (!logtoClient.isConfigured()) return res.json({ users: [] });
  try {
    const users = await logtoClient.mgmtApi('GET', '/users?pageSize=100');
    const result = await Promise.all((users || []).map(async (u) => {
      let roles = [];
      try { roles = await logtoClient.getUserRoles(u.id); } catch (_) {}
      return {
        id: u.id,
        name: u.name || '',
        email: u.primaryEmail || '',
        username: u.username || '',
        roles,
        createdAt: u.createdAt,
        lastSignInAt: u.lastSignInAt,
        isSuspended: u.isSuspended || false,
      };
    }));
    // Nur interne Benutzer zurückgeben (mind. eine interne Rolle)
    const internal = result.filter(u => u.roles.some(r => INTERNAL_ROLES.includes(r)));
    res.json({ users: internal });
  } catch (e) {
    console.error('[internal-users] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/internal-users/:id/roles – Rollen eines Benutzers setzen
app.patch("/api/admin/internal-users/:id/roles", requireAdmin, async (req, res) => {
  if (!logtoClient.isConfigured()) return res.status(503).json({ error: 'Logto nicht konfiguriert' });
  const userId = req.params.id;
  const { roles } = req.body || {};
  if (!Array.isArray(roles)) return res.status(400).json({ error: 'roles muss ein Array sein' });

  // Nur interne Rollen erlaubt
  const allowed = roles.filter(r => INTERNAL_ROLES.includes(r));
  try {
    // Bestehende Rollen holen
    const current = await logtoClient.getUserRoles(userId);
    const toRemove = current.filter(r => INTERNAL_ROLES.includes(r) && !allowed.includes(r));
    const toAdd = allowed.filter(r => !current.includes(r));
    if (toRemove.length) await logtoClient.removeRolesFromUser(userId, toRemove);
    if (toAdd.length) await logtoClient.assignRolesToUser(userId, toAdd);

    // DB sync
    const newRoles = [...current.filter(r => !INTERNAL_ROLES.includes(r)), ...allowed];
    if (newRoles.includes('super_admin') || newRoles.includes('admin')) {
      await db.query(
        `INSERT INTO booking.admin_users (username, email, role, active, created_at, updated_at)
         SELECT u.username, u.primary_email, $2, TRUE, NOW(), NOW()
         FROM (SELECT $1::text AS username, (SELECT primary_email FROM booking.admin_users WHERE username = $1 LIMIT 1) AS primary_email) u
         ON CONFLICT (username) DO UPDATE SET role=$2, active=TRUE, updated_at=NOW()`,
        [userId, newRoles.includes('super_admin') ? 'super_admin' : 'admin']
      ).catch(() => null);
    }

    res.json({ ok: true, userId, roles: allowed });
  } catch (e) {
    console.error('[internal-users] PATCH roles error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/internal-users – neuen internen User in Logto anlegen
app.post("/api/admin/internal-users", requireAdmin, async (req, res) => {
  if (!logtoClient.isConfigured()) return res.status(503).json({ error: 'Logto nicht konfiguriert' });
  const { name, email, username, password, roles = ['photographer'] } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });
  try {
    const user = await logtoClient.mgmtApi('POST', '/users', {
      name: name || email,
      primaryEmail: email.toLowerCase(),
      username: username || email.toLowerCase().split('@')[0].replace(/[^a-z0-9]/g, ''),
      password,
    });
    const allowed = (roles || []).filter(r => INTERNAL_ROLES.includes(r));
    if (allowed.length) await logtoClient.assignRolesToUser(user.id, allowed);
    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.primaryEmail, roles: allowed } });
  } catch (e) {
    console.error('[internal-users] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/admin/internal-users/:id – User in Logto deaktivieren (nicht löschen)
app.delete("/api/admin/internal-users/:id", requireAdmin, async (req, res) => {
  if (!logtoClient.isConfigured()) return res.status(503).json({ error: 'Logto nicht konfiguriert' });
  const userId = req.params.id;
  try {
    await logtoClient.mgmtApi('PATCH', `/users/${userId}/is-suspended`, { isSuspended: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/admin/internal-users/:id/suspend – aktivieren/deaktivieren
app.patch("/api/admin/internal-users/:id/suspend", requireAdmin, async (req, res) => {
  if (!logtoClient.isConfigured()) return res.status(503).json({ error: 'Logto nicht konfiguriert' });
  const userId = req.params.id;
  const { isSuspended } = req.body || {};
  try {
    await logtoClient.mgmtApi('PATCH', `/users/${userId}/is-suspended`, { isSuspended: Boolean(isSuspended) });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/logto-roles – alle Logto-Rollen
app.get("/api/admin/logto-roles", requireAdmin, async (req, res) => {
  if (!logtoClient.isConfigured()) return res.json({ roles: [] });
  try {
    const roles = await logtoClient.mgmtApi('GET', '/roles?pageSize=100');
    const internal = (roles || []).filter(r => INTERNAL_ROLES.includes(r.name));
    res.json({ roles: internal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==============================
// PHOTOGRAPHERS / MITARBEITER
// ==============================

// Mitarbeiter anlegen
app.post("/api/admin/photographers", requireAdmin, async (req, res) => {
  const body = req.body || {};
  const key = String(body.key || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  if (!key || !/^[a-z0-9_-]{2,}$/i.test(key)) {
    return res.status(400).json({ error: "Gueltiger Mitarbeiter-Schluessel erforderlich" });
  }
  if (!name) {
    return res.status(400).json({ error: "Name ist erforderlich" });
  }
  if (!process.env.DATABASE_URL) {
    return res.status(503).json({ error: "Mitarbeiter koennen nur mit aktiver DB angelegt werden" });
  }
  try {
    await db.upsertPhotographer({
      key,
      name,
      email,
      phone: body.phone || "",
      initials: body.initials || "",
      is_admin: Boolean(body.is_admin),
    });
    await db.upsertPhotographerSettings(key, {
      home_address: body.home_address || "",
      home_lat: body.home_lat == null || body.home_lat === "" ? null : Number(body.home_lat),
      home_lon: body.home_lon == null || body.home_lon === "" ? null : Number(body.home_lon),
      max_radius_km:
        body.max_radius_km != null
          ? Number(body.max_radius_km)
          : body.radius_km != null
            ? Number(body.radius_km)
            : 30,
      skills: body.skills && typeof body.skills === "object"
        ? body.skills
        : { foto: 5, matterport: 0, drohne_foto: 0, drohne_video: 0, video: 0 },
      blocked_dates: Array.isArray(body.blocked_dates) ? body.blocked_dates : [],
      depart_times: body.depart_times && typeof body.depart_times === "object" ? body.depart_times : {},
      work_start: body.work_start || null,
      work_end: body.work_end || null,
      workdays: Array.isArray(body.workdays) ? body.workdays : null,
      work_hours_by_day: body.work_hours_by_day && typeof body.work_hours_by_day === "object" ? body.work_hours_by_day : null,
      buffer_minutes: body.buffer_minutes == null || body.buffer_minutes === "" ? null : Number(body.buffer_minutes),
      slot_minutes: body.slot_minutes == null || body.slot_minutes === "" ? null : Number(body.slot_minutes),
      national_holidays: body.national_holidays !== undefined ? Boolean(body.national_holidays) : true,
      languages: Array.isArray(body.languages) ? body.languages : ["de"],
      native_language: body.native_language || "de",
      event_color: body.event_color || "#3b82f6",
    });
    res.status(201).json({ ok: true, key });
  } catch (err) {
    console.error("[photographers POST]", err?.message || err);
    res.status(500).json({ error: err.message || "Mitarbeiter konnte nicht angelegt werden" });
  }
});

// Alle Mitarbeiter abrufen (DB als SSOT, Config als Fallback/Ergaenzung)
app.get("/api/admin/photographers", requirePhotographerOrAdmin, async (req, res) => {
  try {
    const configMap = new Map((PHOTOGRAPHERS_CONFIG || []).map((p) => [p.key, p]));
    const base = (PHOTOGRAPHERS_CONFIG || []).map((p) => ({
      key: p.key,
      name: p.name,
      email: p.email || "",
      phone: p.phone || "",
      initials: p.initials || (p.name || "").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
      active: true,
      is_admin: false,
      skills: {},
    }));

    if (process.env.DATABASE_URL && db.getAllPhotographerSettings) {
      try {
        const rows = await db.getAllPhotographerSettings({ includeInactive: true });
        if (Array.isArray(rows) && rows.length > 0) {
          const dbItems = rows.map((row) => {
            const cfg = configMap.get(row.key) || {};
            return {
              key: row.key,
              name: row.name || cfg.name || row.key,
              email: row.email || cfg.email || "",
              phone: row.phone || cfg.phone || "",
              phone_mobile: row.phone_mobile || "",
              whatsapp: row.whatsapp || "",
              initials:
                row.initials
                || cfg.initials
                || (row.name || cfg.name || row.key).split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase(),
              active: row.active !== false,
              is_admin: Boolean(row.is_admin),
              skills: row.skills && typeof row.skills === "object" ? row.skills : {},
              event_color: row.event_color || undefined,
              home_address: row.home_address || "",
              max_radius_km: row.max_radius_km ?? null,
            };
          });
          const knownKeys = new Set(dbItems.map((item) => item.key));
          for (const item of base) {
            if (!knownKeys.has(item.key)) dbItems.push(item);
          }
          return res.json({ photographers: dbItems });
        }
      } catch (_e) { /* Tabelle evtl. noch nicht vorhanden */ }
    }

    res.json({ photographers: base });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Einzel-Mitarbeiter abrufen
app.get("/api/admin/photographers/:key", requirePhotographerOrAdmin, async (req, res) => {
  const key = req.params.key;
  if (process.env.DATABASE_URL) {
    try {
      const pool = db.getPool ? db.getPool() : null;
      if (pool) {
        const { rows } = await pool.query(
          `SELECT p.key, p.name, p.email, p.phone, p.phone_mobile, p.whatsapp, p.initials, p.is_admin, p.active,
                  ps.home_address, ps.home_lat, ps.home_lon, ps.max_radius_km, ps.skills,
                  ps.blocked_dates, ps.depart_times, ps.work_start,
                  ps.work_end, ps.workdays, ps.buffer_minutes, ps.slot_minutes,
                  ps.languages, ps.native_language, ps.event_color
           FROM photographers p
           LEFT JOIN photographer_settings ps ON ps.photographer_key = p.key
           WHERE p.key = $1
           LIMIT 1`,
          [String(key || "").toLowerCase()]
        );
        if (rows[0]) return res.json({ photographer: rows[0] });
      }
    } catch (_e) { /* fallback below */ }
  }
  const p = (PHOTOGRAPHERS_CONFIG || []).find((ph) => ph.key === key);
  if (!p) return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
  res.json({ photographer: { key: p.key, name: p.name, email: p.email || "", phone: p.phone || "", initials: p.initials || "", active: true } });
});

// Mitarbeiter-Settings lesen (Stammdaten aus photographers mergen)
app.get("/api/admin/photographers/:key/settings", requireAdmin, async (req, res) => {
  const key = String(req.params.key || "").toLowerCase();
  let settings = {};
  if (process.env.DATABASE_URL) {
    try {
      const pool = db.getPool ? db.getPool() : null;
      if (pool) {
        const { rows } = await pool.query(
          `SELECT ps.*,
                  p.name AS core_name,
                  p.email AS core_email,
                  p.phone AS core_phone,
                  p.phone_mobile AS core_phone_mobile,
                  p.whatsapp AS core_whatsapp,
                  p.initials AS core_initials,
                  p.is_admin AS core_is_admin,
                  p.active AS core_active
           FROM photographer_settings ps
           RIGHT JOIN photographers p ON p.key = ps.photographer_key
           WHERE p.key = $1
           LIMIT 1`,
          [key]
        );
        const row = rows[0];
        if (row) {
          const { core_name, core_email, core_phone, core_phone_mobile, core_whatsapp, core_initials, core_is_admin, core_active, ...ps } = row;
          settings = { ...ps };
          if (settings.photographer_key == null) settings.photographer_key = key;
          settings.name = core_name;
          settings.email = core_email;
          settings.phone = core_phone;
          settings.phone_mobile = core_phone_mobile ?? "";
          settings.whatsapp = core_whatsapp ?? "";
          settings.initials = core_initials;
          settings.is_admin = Boolean(core_is_admin);
          settings.active = core_active !== false;
        }
      }
    } catch (_e) { /* Tabelle evtl. noch nicht vorhanden */ }
  }
  res.json({ settings });
});

// Mitarbeiter-Settings speichern (Stammdaten -> photographers, Rest -> photographer_settings)
app.put("/api/admin/photographers/:key/settings", requireAdmin, async (req, res) => {
  const key = String(req.params.key || "").toLowerCase();
  const body = req.body || {};
  if (!process.env.DATABASE_URL) return res.json({ ok: true });
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });

    const core = {};
    if (body.name !== undefined) core.name = body.name;
    if (body.email !== undefined) core.email = body.email;
    if (body.phone !== undefined) core.phone = body.phone;
    if (body.phone_mobile !== undefined) core.phone_mobile = body.phone_mobile;
    if (body.whatsapp !== undefined) core.whatsapp = body.whatsapp;
    if (body.initials !== undefined) core.initials = body.initials;
    if (body.active !== undefined) core.active = Boolean(body.active);
    if (Object.keys(core).length) await db.updatePhotographerCore(key, core);
    if (body.is_admin !== undefined) {
      const isAdmin = Boolean(body.is_admin);
      await db.setPhotographerAdminFlag(key, isAdmin);
      try { await rbac.syncPhotographerRolesFromDb(key); } catch (_e) {}

      // Logto-Rollen synchronisieren
      const logtoClient = require('./logto-client');
      if (logtoClient.isConfigured()) {
        try {
          const { rows } = await pool.query(`SELECT email FROM booking.photographers WHERE key = $1`, [key]);
          const email = rows[0]?.email;
          if (email) {
            const logtoUser = await logtoClient.findUserByEmail(email);
            if (logtoUser) {
              if (isAdmin) {
                await logtoClient.assignRolesToUser(logtoUser.id, ['admin']);
              } else {
                await logtoClient.removeRolesFromUser(logtoUser.id, ['admin', 'super_admin']);
              }
            }
          }
        } catch (e) {
          console.warn('[logto] Rollen-Sync für', key, 'fehlgeschlagen:', e.message);
        }
      }
    }

    const jsonCols = new Set(["workdays", "work_hours_by_day", "languages", "blocked_dates", "skills", "depart_times"]);
    const settingsCols = [
      "home_address",
      "home_lat",
      "home_lon",
      "max_radius_km",
      "event_color",
      "work_start",
      "work_end",
      "workdays",
      "work_hours_by_day",
      "buffer_minutes",
      "slot_minutes",
      "depart_times",
      "native_language",
      "languages",
      "blocked_dates",
      "skills",
    ];
    const patch = {};
    for (const f of settingsCols) {
      if (f in body) patch[f] = body[f];
    }
    if ("radius_km" in body && !("max_radius_km" in body)) {
      const r = body.radius_km;
      patch.max_radius_km =
        r === "" || r == null || (typeof r === "number" && !Number.isFinite(r))
          ? null
          : Math.round(Number(r));
    }
    if ("max_radius_km" in patch && patch.max_radius_km != null) {
      const n = Number(patch.max_radius_km);
      patch.max_radius_km = Number.isFinite(n) ? Math.round(n) : null;
    }
    if ("home_lat" in patch) {
      const n = Number(patch.home_lat);
      patch.home_lat = Number.isFinite(n) ? n : null;
    }
    if ("home_lon" in patch) {
      const n = Number(patch.home_lon);
      patch.home_lon = Number.isFinite(n) ? n : null;
    }

    if (Object.keys(patch).length > 0) {
      const cols = Object.keys(patch);
      const setParts = cols.map((c, i) => `${c}=$${i + 1}`);
      const vals = cols.map((c) => {
        const v = patch[c];
        if (jsonCols.has(c)) {
          if (typeof v === "string") return v;
          const emptyValue = c === "skills" || c === "depart_times" || c === "work_hours_by_day" ? {} : [];
          return JSON.stringify(v ?? emptyValue);
        }
        return v;
      });
      const pkParam = cols.length + 1;
      const u = await pool.query(
        `UPDATE photographer_settings SET ${setParts.join(", ")}, updated_at = NOW() WHERE photographer_key = $${pkParam}`,
        [...vals, key]
      );
      if (u.rowCount === 0) {
        await pool.query(
          `INSERT INTO photographer_settings (photographer_key) VALUES ($1) ON CONFLICT (photographer_key) DO NOTHING`,
          [key]
        );
        await pool.query(
          `UPDATE photographer_settings SET ${setParts.join(", ")}, updated_at = NOW() WHERE photographer_key = $${pkParam}`,
          [...vals, key]
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[photographers/settings PUT]", err?.message || err);
    res.status(500).json({ error: err.message || "Speichern fehlgeschlagen" });
  }
});

// AktivitÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤tslog eines Mitarbeiters
app.get("/api/admin/photographers/:key/activity-log", requireAdmin, async (req, res) => {
  const key = req.params.key;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 80)));
  if (!process.env.DATABASE_URL) return res.json({ logs: [] });
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.json({ logs: [] });
    const { rows } = await pool.query(
      "SELECT * FROM employee_activity_log WHERE employee_key=$1 ORDER BY created_at DESC LIMIT $2",
      [key, limit]
    ).catch(() => ({ rows: [] }));
    res.json({ logs: rows });
  } catch (err) {
    res.json({ logs: [] });
  }
});

// Mitarbeiter deaktivieren
app.delete("/api/admin/photographers/:key", requireAdmin, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ ok: true });
  try {
    const ok = await db.deactivatePhotographer(req.params.key);
    if (!ok) return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mitarbeiter reaktivieren
app.patch("/api/admin/photographers/:key/reactivate", requireAdmin, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ ok: true });
  try {
    const ok = await db.reactivatePhotographer(req.params.key);
    if (!ok) return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Abwesenheits-Kalender-EintrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¤ge abrufen
app.get("/api/admin/photographers/:key/absence-calendar", requireAdmin, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ events: [] });
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.json({ events: [] });
    const { rows } = await pool.query(
      "SELECT * FROM photographer_absences WHERE photographer_key=$1 ORDER BY start_at ASC",
      [req.params.key]
    ).catch(() => ({ rows: [] }));
    res.json({ events: rows });
  } catch (err) {
    res.json({ events: [] });
  }
});

// Abwesenheit hinzufÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼gen
app.post("/api/admin/photographers/:key/absence-calendar", requireAdmin, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ ok: true, eventId: String(Date.now()) });
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const key = String(req.params.key || "").toLowerCase();
    const body = req.body || {};
    const von = String(body.von || body.start || "").trim().slice(0, 10);
    const bis = String(body.bis || body.end || body.von || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(von) || !/^\d{4}-\d{2}-\d{2}$/.test(bis)) {
      return res.status(400).json({ error: "Von und Bis als gueltiges Datum (YYYY-MM-DD) erforderlich" });
    }
    if (von > bis) return res.status(400).json({ error: "Von darf nicht nach Bis liegen" });

    const eventId = require("crypto").randomUUID();
    const entry = {
      id: eventId,
      von,
      bis,
      grund: String(body.grund || "Abwesend").slice(0, 200),
      ganztaegig: body.ganztaegig !== false,
      notiz: String(body.notiz || "").slice(0, 500),
    };
    if (entry.ganztaegig === false) {
      if (body.vonTime) entry.von_time = String(body.vonTime).slice(0, 8);
      if (body.bisTime) entry.bis_time = String(body.bisTime).slice(0, 8);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT blocked_dates FROM photographer_settings WHERE photographer_key = $1 FOR UPDATE",
        [key]
      );
      let arr = [];
      if (rows[0] && Array.isArray(rows[0].blocked_dates)) {
        arr = rows[0].blocked_dates.map((x) => (x && typeof x === "object" ? { ...x } : x));
      }
      arr.push(entry);
      if (rows.length === 0) {
        await client.query(
          `INSERT INTO photographer_settings (photographer_key, blocked_dates) VALUES ($1, $2::jsonb)`,
          [key, JSON.stringify(arr)]
        );
      } else {
        await client.query(
          `UPDATE photographer_settings SET blocked_dates = $1::jsonb, updated_at = NOW() WHERE photographer_key = $2`,
          [JSON.stringify(arr), key]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    res.json({ ok: true, eventId });
  } catch (err) {
    console.error("[absence-calendar POST]", err?.message || err);
    res.status(500).json({ error: err.message || "Speichern fehlgeschlagen" });
  }
});

// Abwesenheit lÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¾ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¶schen
app.delete("/api/admin/photographers/:key/absence-calendar/:eventId", requireAdmin, async (req, res) => {
  if (!process.env.DATABASE_URL) return res.json({ ok: true });
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const key = String(req.params.key || "").toLowerCase();
    const eventId = String(req.params.eventId || "");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT blocked_dates FROM photographer_settings WHERE photographer_key = $1 FOR UPDATE",
        [key]
      );
      if (!rows[0] || !Array.isArray(rows[0].blocked_dates)) {
        await client.query("COMMIT");
        return res.json({ ok: true });
      }
      const arr = rows[0].blocked_dates.filter(
        (x) => !(x && typeof x === "object" && String(x.id) === eventId)
      );
      await client.query(
        `UPDATE photographer_settings SET blocked_dates = $1::jsonb, updated_at = NOW() WHERE photographer_key = $2`,
        [JSON.stringify(arr), key]
      );
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[absence-calendar DELETE]", err?.message || err);
    res.status(500).json({ error: err.message || "Loeschen fehlgeschlagen" });
  }
});

// Passwort setzen (lokaler Hash in photographer_settings)
app.post("/api/admin/photographers/:key/set-password", requireAdmin, async (req, res) => {
  try {
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Passwort muss mindestens 8 Zeichen haben" });
    }
    const key = String(req.params.key || "").toLowerCase();
    const hash = await customerAuth.hashPassword(newPassword);
    await p.query("UPDATE photographer_settings SET password_hash=$1 WHERE photographer_key=$2", [hash, key]);
    await addEmployeeActivity({
      employeeKey: key,
      action: "password_set",
      actor: getActorLabel(req),
      details: {}
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Zugangsdaten per E-Mail an Mitarbeiter senden
app.post("/api/admin/photographers/:key/send-credentials", requireAdmin, async (req, res) => {
  try {
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
    const key = String(req.params.key || "").toLowerCase();
    const { rows } = await p.query(
      `SELECT ph.name, ph.email, ps.password_hash, ps.native_language FROM photographers ph
       LEFT JOIN photographer_settings ps ON ps.photographer_key = ph.key
       WHERE ph.key = $1`, [key]
    );
    if (!rows[0]) return res.status(404).json({ error: "Mitarbeiter nicht gefunden" });
    const { name, email, password_hash, native_language } = rows[0];
    if (!email) return res.status(400).json({ error: "Mitarbeiter hat keine E-Mail-Adresse" });

    const lang = native_language || "de";
    let tempPw = null;
    if (!password_hash) {
      tempPw = Math.random().toString(36).slice(2, 10) + "X9!";
      const hash = await customerAuth.hashPassword(tempPw);
      await p.query("UPDATE photographer_settings SET password_hash=$1 WHERE photographer_key=$2", [hash, key]);
    }

    // Immer einen Reset-Token generieren damit Mitarbeiter Passwort setzen/\u00e4ndern kann
    const rawToken = generateToken();
    const tokenHash = require("crypto").createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h
    await p.query("DELETE FROM photographer_password_resets WHERE photographer_key = $1", [key]);
    await p.query(
      "INSERT INTO photographer_password_resets (token_hash, photographer_key, expires_at) VALUES ($1,$2,$3)",
      [tokenHash, key, expires]
    );

    const frontendUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
    const adminUrl = `${frontendUrl}/admin.html`;
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}&role=photographer`;
    const mail = buildCredentialsEmail({ name, key, email, tempPw, adminUrl, resetUrl }, lang);

    try {
      const graphResult = await sendMailViaGraph(email, mail.subject, mail.html, mail.text);
      assertMailSent(graphResult, `employee-credentials:${key}`);
    } catch (e) {
      try {
        await mailer.sendMail({ from: MAIL_FROM, to: email, subject: mail.subject, html: mail.html, text: mail.text });
      } catch (e2) {
        return res.status(500).json({ error: "E-Mail konnte nicht gesendet werden: " + (e2.message || e.message) });
      }
    }
    await addEmployeeActivity({
      employeeKey: key,
      action: "credentials_sent",
      actor: getActorLabel(req),
      details: { tempPasswordCreated: !!tempPw, to: email }
    });
    res.json({ ok: true, tempPw: !!tempPw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/photographers/:key/activity-log", requireAdmin, async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    const limit = Number(req.query.limit || 100);
    const logs = await listEmployeeActivity(key, limit);
    res.json({ ok: true, logs });
  } catch (err) {
    res.status(500).json({ error: err.message || "Log laden fehlgeschlagen" });
  }
});

// Passwort-Reset fÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¼r Mitarbeiter entfernt ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â wird durch Keycloak verwaltet
app.post("/api/photographer/forgot-password", (_req, res) => {
  res.status(403).json({ error: "Passwort-Reset fuer Fotografen ist aktuell nicht aktiviert." });
});
app.post("/api/photographer/reset-password", (_req, res) => {
  res.status(403).json({ error: "Passwort-Reset fuer Fotografen ist aktuell nicht aktiviert." });
});

// Abwesenheit als Kalender-Blocker erstellen
app.post("/api/admin/photographers/:key/absence-calendar", requireAdmin, async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    const { von, bis, ganztaegig, vonTime, bisTime, grund, notiz, photographerName, photographerEmail } = req.body || {};

    if (!von || !bis) return res.status(400).json({ error: "von und bis sind erforderlich" });
    if (!graphClient) return res.status(503).json({ error: "Kalender nicht konfiguriert (MS Graph fehlt)" });

    let email = photographerEmail || PHOTOGRAPHERS[key];
    if (!email && process.env.DATABASE_URL) {
      const photographer = await db.getPhotographer(key);
      if (photographer?.email) email = photographer.email;
    }
    if (!email) return res.status(404).json({ error: "Fotograf-E-Mail nicht gefunden" });

    const name = photographerName || key;
    const subject = `Geblocked von ${name}`;
    const bodyText = [
      `Abwesenheit: ${grund || "Privat"}`,
      notiz ? `Notiz: ${notiz}` : "",
    ].filter(Boolean).join("\n");

    // showAs: "busy" sorgt daf-r, dass der Eintrag im Kalender als blockiert angezeigt wird
    const baseEvent = {
      subject,
      body: { contentType: "Text", content: bodyText },
      responseRequested: false,
      showAs: "busy",
    };

    if (ganztaegig) {
      const addDaysISO = (isoDate, days) => {
        const dt = new Date(`${isoDate}T00:00:00Z`);
        dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
        return dt.toISOString().slice(0, 10);
      };
      const endExclusive = addDaysISO(bis, 1);
      const event = {
        ...baseEvent,
        isAllDay: true,
        start: { dateTime: `${von}T00:00:00`, timeZone: TIMEZONE },
        // F-r ganzt-gige Events ist das Enddatum exklusiv (Tag nach "bis" um 00:00)
        end: { dateTime: `${endExclusive}T00:00:00`, timeZone: TIMEZONE },
      };
      const created = await graphClient.api(`/users/${email}/events`).post(event);
      await addEmployeeActivity({
        employeeKey: key,
        action: "absence_calendar_created",
        actor: getActorLabel(req),
        details: { von, bis, ganztaegig: true, eventId: created.id || null }
      });
      return res.json({ ok: true, eventId: created.id });
    } else {
      const startTime = vonTime || "08:00";
      const endTime = bisTime || "17:00";
      const event = {
        ...baseEvent,
        start: { dateTime: `${von}T${startTime}:00`, timeZone: TIMEZONE },
        end: { dateTime: `${bis}T${endTime}:00`, timeZone: TIMEZONE },
      };
      const created = await graphClient.api(`/users/${email}/events`).post(event);
      await addEmployeeActivity({
        employeeKey: key,
        action: "absence_calendar_created",
        actor: getActorLabel(req),
        details: { von, bis, ganztaegig: false, vonTime: startTime, bisTime: endTime, eventId: created.id || null }
      });
      return res.json({ ok: true, eventId: created.id });
    }
  } catch (err) {
    const detail = err?.body ? JSON.stringify(err.body) : (err?.message || "");
    console.error("[absence-calendar] full error:", detail);
    res.status(500).json({ error: detail || "Kalender-Eintrag fehlgeschlagen" });
  }
});

// Abwesenheits-Kalendereintrag l-schen
app.delete("/api/admin/photographers/:key/absence-calendar/:eventId", requireAdmin, async (req, res) => {
  try {
    const key = String(req.params.key || "").toLowerCase();
    const eventId = String(req.params.eventId || "").trim();
    if (!eventId) return res.status(400).json({ error: "eventId erforderlich" });

    // Optionaler Override (z.B. wenn Key nicht in config ist)
    const emailOverride = String(req.query.email || "").trim();

    let email = emailOverride || PHOTOGRAPHERS[key];
    if (!email && process.env.DATABASE_URL) {
      const photographer = await db.getPhotographer(key);
      if (photographer?.email) email = photographer.email;
    }
    if (!email) return res.status(404).json({ error: "Fotograf-E-Mail nicht gefunden" });

    if (!graphClient) return res.status(503).json({ error: "Kalender nicht konfiguriert" });

    try {
      await graphClient.api(`/users/${email}/events/${eventId}`).delete();
    } catch (err) {
      // 404 = Event existiert nicht mehr - als ok behandeln
      const code = err?.body?.error?.code || "";
      const statusCode = err?.statusCode || err?.status || 0;
      if (!(statusCode === 404 || code === "ErrorItemNotFound")) throw err;
    }

    await addEmployeeActivity({
      employeeKey: key,
      action: "absence_calendar_deleted",
      actor: getActorLabel(req),
      details: { eventId, email }
    });

    res.json({ ok: true });
  } catch (err) {
    const detail = err?.body ? JSON.stringify(err.body) : (err?.message || "");
    console.error("[absence-calendar-delete] full error:", detail);
    res.status(500).json({ error: detail || "Kalender-Eintrag l\u00f6schen fehlgeschlagen" });
  }
});

// Einzelne Bestellung abrufen
app.get("/api/admin/orders/:orderNo", requireAdmin, async (req, res) => {
  const orderNo = Number(req.params.orderNo);
  let order;
  if (process.env.DATABASE_URL) {
    order = await db.getOrderByNo(orderNo);
  } else {
    const orders = loadOrdersFromJson();
    order = orders.find(o => o.orderNo === orderNo);
  }
  if(!order) return res.status(404).json({ error: "Order not found" });
  res.json({ order });
});

// ==============================
// BOT API - Ein Endpoint, alle Befehle
// ==============================
// POST /api/bot  -  { "action": "...", ...params }
// ==============================

app.post("/api/bot", async (req, res) => {
  const { action } = req.body || {};
  if (!action) return res.status(400).json({ error: "action ist erforderlich", availableActions: ["config","pricing","validate_discount","availability","booking","order_status"] });

  try {
    // - ACTION: config -
    if (action === "config") {
      const products = await db.listProductsWithRules({ includeInactive: false });
      const { packages, addons } = formatCatalogProducts(products);
      const scheduling = await getSchedulingSettings();
      const vatRate = Number((await getSetting("pricing.vatRate")).value || 0.081);
      return res.json({
        action: "config",
        objectTypes: [
          { key: "apartment", label: "Wohnung" },
          { key: "single_house", label: "Einfamilienhaus" },
          { key: "multi_house", label: "Mehrfamilienhaus" },
          { key: "commercial", label: "Gewerbe" },
          { key: "land", label: "Grundst-ck" }
        ],
        packages,
        addons,
        photographers: PHOTOGRAPHERS_CONFIG.map(p => ({ key: p.key, name: p.name })),
        schedule: {
          timezone: TIMEZONE,
          workStart: scheduling.workStart,
          workEnd: scheduling.workEnd,
          slotInterval: scheduling.slotMinutes,
          lookaheadDays: scheduling.lookaheadDays,
          workdays: scheduling.workdays,
          holidays: scheduling.holidays || [],
          nationalHolidaysEnabled: scheduling.nationalHolidaysEnabled !== false,
          workHoursByDay: scheduling.workHoursByDay || {},
          minAdvanceHours: scheduling.minAdvanceHours,
          bufferMinutes: scheduling.bufferMinutes,
        },
        vatRate,
        currency: "CHF",
        steps: [
          { step: 1, name: "Objektdaten", required: ["address","objectType","area"] },
          { step: 2, name: "Dienstleistungen", required: [] },
          { step: 3, name: "Fotograf & Termin", required: ["date","time"] },
          { step: 4, name: "Rechnungsdetails", required: ["name","email"] }
        ]
      });
    }

    // - ACTION: pricing -
    if (action === "pricing") {
      const { package: pkgKey, addons: addonIds, area, floors, discountCode, customerEmail } = req.body;
      const products = await db.listProductsWithRules({ includeInactive: false });
      const productByCode = new Map(products.map((p) => [String(p.code), p]));
      const normalizedAddons = (Array.isArray(addonIds) ? addonIds : []).map((addonInput) => {
        const id = typeof addonInput === "string" ? addonInput : addonInput?.id;
        const product = productByCode.get(String(id || ""));
        return {
          id: String(id || ""),
          qty: typeof addonInput === "object" ? (parseInt(addonInput.qty) || 1) : 1,
          group: product?.group_key || String(id || "").split(":")[0],
          label: product?.name || String(id || ""),
        };
      }).filter((x) => !!x.id);

      const pkgProduct = productByCode.get(String(pkgKey || ""));
      const services = {
        package: pkgProduct ? { key: pkgProduct.code, label: pkgProduct.name } : {},
        addons: normalizedAddons,
      };
      const pricingData = await computePricing({
        services,
        object: { area: parseFloat(area) || 0, floors: Math.max(1, parseInt(floors) || 1) },
        discountCode,
        customerEmail,
      });
      const withPrice = String(pricingData?.serviceListWithPrice || "").split("\n").filter(Boolean);
      const items = withPrice.map((line, idx) => {
        const parts = line.split(" - ");
        const label = parts[0] || line;
        const priceMatch = line.match(/(\d+(?:\.\d+)?)\s*CHF/i);
        return { id: `item_${idx + 1}`, label, price: priceMatch ? Number(priceMatch[1]) : 0 };
      });
      const discountInfo = discountCode ? await validateDiscountCode(discountCode, { customerEmail }) : null;
      return res.json({
        action: "pricing",
        items,
        subtotal: Number(pricingData?.pricing?.subtotal || 0),
        discountCode: discountCode || null,
        discountPercent: discountInfo?.ok && discountInfo?.type === "percent" ? Number(discountInfo?.amount || 0) : 0,
        discountAmount: Number(pricingData?.pricing?.discountAmount || 0),
        vat: Number(pricingData?.pricing?.vat || 0),
        total: Number(pricingData?.pricing?.total || 0),
        currency: "CHF",
      });
    }

    // - ACTION: validate_discount -
    if (action === "validate_discount") {
      const { code, customerEmail } = req.body;
      if (!code) return res.json({ action:"validate_discount", valid:false, reason:"no_code" });
      const result = await validateDiscountCode(code, { customerEmail });
      if (!result?.ok) return res.json({ action:"validate_discount", valid:false, reason:result?.reason || "invalid_code" });
      return res.json({
        action:"validate_discount",
        valid:true,
        type: result.type,
        amount: result.amount,
        percent: result.type === "percent" ? result.amount : null,
      });
    }

    // - ACTION: availability -
    if (action === "availability") {
      const photographer = String(req.body.photographer || "").toLowerCase();
      const date = parseDateFlexible(req.body.date);
      const area = parseFloat(req.body.area) || 0;
      const services = {
        package: req.body?.package ? { key: String(req.body.package || "") } : {},
        addons: Array.isArray(req.body?.addons)
          ? req.body.addons.map((a) => ({ id: typeof a === "string" ? a : a?.id, qty: typeof a === "object" ? a?.qty : undefined }))
          : [],
      };
      const durationMin = await getShootDurationMinutes(area, services);

      if (!date) return res.status(400).json({ error: "date im Format YYYY-MM-DD oder DD.MM.YYYY erforderlich" });

      if (photographer === "any" || !photographer) {
        const perPhotog = {};
        const allFree = new Set();
        for (const p of PHOTOGRAPHERS_CONFIG) {
          const email = PHOTOGRAPHERS[p.key];
          if (!email) continue;
          try {
            const schedulingSettings = await getSchedulingSettings(p.key);
            const daySchedule = resolveScheduleForDate(date, schedulingSettings);
            if (daySchedule.isHoliday || !daySchedule.enabled) {
              perPhotog[p.key] = {
                name: p.name,
                freeSlots: [],
                reason: daySchedule.isHoliday ? "holiday" : "outside_workdays",
              };
              continue;
            }
            const events = await fetchCalendarEvents(email, date, p.key);
            const avail = buildAvailability(events, durationMin, {
              ...schedulingSettings,
              workStart: daySchedule.workStart,
              workEnd: daySchedule.workEnd,
            });
            perPhotog[p.key] = { name: p.name, freeSlots: avail.free || [] };
            (avail.free || []).forEach(s => allFree.add(s));
          } catch (err) { perPhotog[p.key] = { name: p.name, freeSlots: [], error: err?.message }; }
        }
        return res.json({ action:"availability", date, photographer:"any", durationMin, freeSlots:[...allFree].sort(), perPhotographer:perPhotog });
      }

      if (!PHOTOGRAPHERS[photographer]) return res.status(400).json({ error:"Unbekannter Fotograf", availableKeys:Object.keys(PHOTOGRAPHERS) });
      const email = PHOTOGRAPHERS[photographer];
      const schedulingSettings = await getSchedulingSettings(photographer);
      const daySchedule = resolveScheduleForDate(date, schedulingSettings);
      if (daySchedule.isHoliday || !daySchedule.enabled) {
        return res.json({
          action: "availability",
          date,
          photographer,
          photographerName: PHOTOGRAPHERS_CONFIG.find((p) => p.key === photographer)?.name || photographer,
          durationMin,
          freeSlots: [],
          reason: daySchedule.isHoliday ? "holiday" : "outside_workdays",
        });
      }
      const events = await fetchCalendarEvents(email, date, photographer);
      const avail = buildAvailability(events, durationMin, {
        ...schedulingSettings,
        workStart: daySchedule.workStart,
        workEnd: daySchedule.workEnd,
      });
      return res.json({ action:"availability", date, photographer, photographerName:PHOTOGRAPHERS_CONFIG.find(p=>p.key===photographer)?.name||photographer, durationMin, freeSlots:avail.free||[] });
    }

    // - ACTION: booking -
    if (action === "booking") {
      const data = req.body;
      if (!data.billing?.name) return res.status(400).json({ error:"billing.name ist erforderlich" });
      if (!data.billing?.email) return res.status(400).json({ error:"billing.email ist erforderlich" });
      const normalizedBookingDate = parseDateFlexible(data.date);
      if (!normalizedBookingDate) return res.status(400).json({ error:"date im Format YYYY-MM-DD oder DD.MM.YYYY erforderlich" });
      if (!data.time || !/^\d{2}:\d{2}$/.test(data.time)) return res.status(400).json({ error:"time im Format HH:MM erforderlich" });

      const addonLabels = {
        "camera:foto10":"10 Bodenfotos","camera:foto20":"20 Bodenfotos","camera:foto30":"30 Bodenfotos",
        "dronePhoto:foto4":"4 Luftaufnahmen","dronePhoto:foto8":"8 Luftaufnahmen","dronePhoto:foto12":"12 Luftaufnahmen",
        "tour:main":"360- Tour","floorplans:tour":"2D Grundriss von Tour","floorplans:notour":"2D Grundriss ohne Tour","floorplans:sketch":"2D Grundriss nach Skizze",
        "groundVideo:reel30":"Bodenvideo - Reel 30s","groundVideo:clip12":"Bodenvideo - Clip 1-2 Min",
        "droneVideo:reel30":"Drohnenvideo - Reel 30s","droneVideo:clip12":"Drohnenvideo - Clip 1-2 Min",
        "staging:stLiving":"Staging - Wohnbereich","staging:stBusiness":"Staging - Gewerbe","staging:stRenov":"Staging - Renovation",
        "express:24h":"Express 24h","keypickup:main":"Schl-sselabholung"
      };
      const formattedAddons = (Array.isArray(data.addons)?data.addons:[]).map(a => {
        const id = typeof a === "string" ? a : a?.id;
        const qty = typeof a === "object" ? (parseInt(a.qty)||1) : 1;
        const [group] = (id||"").split(":");
        const label = qty > 1 ? `${addonLabels[id]||id} - ${qty}` : (addonLabels[id]||id);
        return { id, group, label, labelKey: id };
      }).filter(a => a.id);

      const floors = Math.max(1, parseInt(data.object?.floors)||1);
      const area = parseFloat(data.object?.area)||0;

      const bookingPayload = {
        address: { text: data.address || "" },
        object: { type: data.object?.type||"apartment", area: String(area||"1"), floors, rooms: data.object?.rooms||"", specials:"", desc:"" },
        services: {
          package: data.package ? { key:data.package, label:{bestseller:"BESTSELLER",cinematic:"CINEMATIC DUO",fullview:"THE FULL VIEW"}[data.package]||data.package } : {key:"",label:""},
          addons: formattedAddons
        },
        schedule: { photographer: { key:data.photographer||"any", name:PHOTOGRAPHERS_CONFIG.find(p=>p.key===data.photographer)?.name||"Egal wer" }, date:normalizedBookingDate, time:data.time },
        billing: { name:data.billing.name, email:data.billing.email, phone:data.billing?.phone||"", company:data.billing?.company||"", street:data.billing?.street||"", zipcity:data.billing?.zipcity||"", onsiteName:data.onsite?.name||"", onsitePhone:data.onsite?.phone||"", notes:data.notes||"" },
        keyPickup: data.keyPickup || {},
        discountCode: data.discountCode || ""
      };

      const pricingResult = await computePricing({ services:bookingPayload.services, object:bookingPayload.object, discountCode:bookingPayload.discountCode, customerEmail:bookingPayload.billing.email });
      bookingPayload.pricing = pricingResult?.pricing || {};

      const fakeReq = { body: bookingPayload, headers: {"content-type":"application/json"} };
      const fakeRes = { statusCode:200, data:null, status(c){this.statusCode=c;return this;}, json(d){this.data=d;} };
      const bookingHandler = app._router.stack.filter(r=>r.route&&r.route.path==="/api/booking"&&r.route.methods.post).map(r=>r.route.stack[0].handle)[0];
      if (!bookingHandler) return res.status(500).json({error:"Booking handler not found"});
      await bookingHandler(fakeReq, fakeRes, ()=>{});
      return res.status(fakeRes.statusCode).json({ action:"booking", ...fakeRes.data, pricing:pricingResult?.pricing||{} });
    }

    // - ACTION: order_status -
    if (action === "order_status") {
      const orderNo = Number(req.body.orderNo);
      if (!orderNo) return res.status(400).json({ error:"orderNo ist erforderlich" });
      const orders = await loadOrders();
      const order = orders.find(o => o.orderNo === orderNo);
      if (!order) return res.status(404).json({ error:"Bestellung nicht gefunden" });
      return res.json({
        action:"order_status",
        orderNo: order.orderNo,
        status: order.status,
        createdAt: order.createdAt,
        address: order.address,
        objectType: translateObjectType(order.object?.type),
        photographer: order.photographer?.name || "-",
        schedule: order.schedule,
        pricing: order.pricing,
        services: { package: order.services?.package?.label||"-", addons: (order.services?.addons||[]).map(a=>a.label) }
      });
    }

    return res.status(400).json({ error: `Unbekannte Action: ${action}`, availableActions: ["config","pricing","validate_discount","availability","booking","order_status"] });
  } catch (err) {
    console.error("[bot] error", err?.message || err);
    res.status(500).json({ error: "Bot-API Fehler", message: err?.message });
  }
});


// ==============================
// Bug Reports
// ==============================
const bugUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.post("/api/bug-report", bugUpload.single("file"), async (req, res) => {
  try {
    const { name, text, page } = req.body;
    if (!name || !text) return res.status(400).json({ ok: false, error: "name und text erforderlich" });
    const file = req.file;
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ ok: false, error: "DB nicht verf\u00fcgbar" });
    await p.query(
      `INSERT INTO bug_reports (name, text, page, file_name, file_data, file_mime)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        name.slice(0, 200),
        text.slice(0, 5000),
        (page || "").slice(0, 500),
        file ? file.originalname : null,
        file ? file.buffer : null,
        file ? file.mimetype : null
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[bug-report] error", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/admin/bug-reports", requireAdmin, async (req, res) => {
  try {
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
    const { rows } = await p.query(
      `SELECT id, name, text, page, file_name, file_mime, status, created_at
       FROM bug_reports ORDER BY created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/admin/bug-reports/:id/status", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["new","in_progress","done"].includes(status))
      return res.status(400).json({ error: "invalid status" });
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
    await p.query("UPDATE bug_reports SET status=$1 WHERE id=$2", [status, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/bug-reports/:id/file", requireAdmin, async (req, res) => {
  try {
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
    const { rows } = await p.query(
      "SELECT file_name, file_data, file_mime FROM bug_reports WHERE id=$1", [req.params.id]
    );
    if (!rows[0] || !rows[0].file_data) return res.status(404).json({ error: "no file" });
    const r = rows[0];
    res.setHeader("Content-Type", r.file_mime || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${r.file_name}"`);
    res.send(r.file_data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fehlerbericht l\u00f6schen
app.delete("/api/admin/bug-reports/:id", requireAdmin, async (req, res) => {
  try {
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
    await p.query("DELETE FROM bug_reports WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fehlerbericht per E-Mail senden
app.post("/api/admin/bug-reports/:id/send-email", requireAdmin, async (req, res) => {
  try {
    const p = db.getPool ? db.getPool() : null;
    if (!p) return res.status(503).json({ error: "DB nicht verf\u00fcgbar" });
    const { rows } = await p.query(
      "SELECT id, name, text, page, file_name, created_at FROM bug_reports WHERE id=$1", [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Fehlerbericht nicht gefunden" });
    const b = rows[0];
    const d = new Date(b.created_at);
    const dateStr = d.toLocaleString("de-CH", { timeZone: "Europe/Zurich" });
    const subject = `Fehlerbericht #${b.id} von ${b.name}`;
    const html = `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f5f3ee;margin:0;padding:24px">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#9e8649,#bfa25a);padding:20px 32px">
  <span style="font-size:20px;font-weight:800;color:#fff">PROPUS</span>
  <span style="font-size:11px;color:rgba(255,255,255,.75);margin-left:10px">Fehlerbericht</span>
</td></tr>
<tr><td style="padding:28px 32px">
  <h2 style="margin:0 0 16px;font-size:18px;color:#111">Fehlerbericht #${b.id}</h2>
  <table style="border-collapse:collapse;width:100%"><tbody>
    <tr><td style="padding:5px 12px 5px 0;color:#777;font-size:13px;width:130px">Von</td><td style="font-size:13px">${b.name || "\u2014"}</td></tr>
    <tr><td style="padding:5px 12px 5px 0;color:#777;font-size:13px">Datum</td><td style="font-size:13px">${dateStr}</td></tr>
    ${b.page ? `<tr><td style="padding:5px 12px 5px 0;color:#777;font-size:13px">Seite</td><td style="font-size:13px">${b.page}</td></tr>` : ""}
    ${b.file_name ? `<tr><td style="padding:5px 12px 5px 0;color:#777;font-size:13px">Datei</td><td style="font-size:13px">${b.file_name}</td></tr>` : ""}
  </tbody></table>
  <div style="margin-top:20px;padding:16px;background:#f9f7f2;border-radius:8px;font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap">${b.text}</div>
</td></tr>
<tr><td style="background:#f9f7f2;border-top:1px solid #ede9e0;padding:14px 32px;text-align:center">
  <p style="margin:0;font-size:12px;color:#aaa">&copy; 2026 Propus GmbH</p>
</td></tr>
</table></td></tr></table></body></html>`;
    const textBody = `Fehlerbericht #${b.id}\nVon: ${b.name}\nDatum: ${dateStr}\n${b.page ? "Seite: " + b.page + "\n" : ""}${b.file_name ? "Datei: " + b.file_name + "\n" : ""}\n${b.text}`;
    const toAddr = OFFICE_EMAIL || process.env.MAIL_FROM || "office@propus.ch";
    try {
      const graphResult = await sendMailViaGraph(toAddr, subject, html, textBody);
      assertMailSent(graphResult, `bug-report:${b.id}`);
    } catch (e) {
      try { await mailer.sendMail({ from: MAIL_FROM, to: toAddr, subject, html, text: textBody }); } catch(e2) {
        return res.status(500).json({ error: "E-Mail senden fehlgeschlagen: " + (e2.message || e.message) });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// Backup-Verwaltung (Admin)
// ==============================
const BACKUP_ROOT = process.env.BACKUP_ROOT || "/data/backups";
const BACKUP_RESTORE_TARGET = process.env.BACKUP_RESTORE_TARGET || "/opt";

app.get("/api/admin/backups", requireAdmin, async (req, res) => {
  try {
    const fsP = require("fs").promises;
    const path = require("path");

    async function dirSize(dirPath) {
      let total = 0;
      try {
        const files = await fsP.readdir(dirPath);
        for (const f of files) {
          try {
            const s = await fsP.stat(path.join(dirPath, f));
            if (s.isFile()) total += s.size;
          } catch (_) {}
        }
      } catch (_) {}
      return total;
    }

    async function dirContents(dirPath) {
      const known = {
        "files.tar": "Projektdateien",
        "backend_orders.tar": "Bestellungen (Volume)",
        "orders.json": "Bestellungen (JSON)",
        "docker-ps.txt": "Docker-Status",
        "docker-compose-ls.txt": "Compose-Status",
      };
      const result = [];
      try {
        const files = await fsP.readdir(dirPath);
        for (const f of files) {
          try {
            const s = await fsP.stat(path.join(dirPath, f));
            if (s.isFile()) {
              result.push({ file: f, label: known[f] || f, size: s.size });
            }
          } catch (_) {}
        }
      } catch (_) {}
      return result;
    }

    let entries = [];
    try {
      const items = await fsP.readdir(BACKUP_ROOT);
      for (const item of items) {
        try {
          const fullPath = path.join(BACKUP_ROOT, item);
          const stat = await fsP.stat(fullPath);
          const isDir = stat.isDirectory();
          const isSql = item.endsWith(".sql");
          if (!isDir && !isSql) continue;

          let size, contents;
          if (isDir) {
            size = await dirSize(fullPath);
            contents = await dirContents(fullPath);
          } else {
            size = stat.size;
            contents = null;
          }

          entries.push({
            name: item,
            type: isDir ? "folder" : "sql",
            size,
            contents,
            createdAt: stat.mtime.toISOString(),
          });
        } catch (_) {}
      }
    } catch (_) {}
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    res.json({ ok: true, backups: entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/backups/create", requireAdmin, async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const { execFile } = require("child_process");
    // backup-container.sh l-uft direkt im Backend-Container (kein Docker-CLI n-tig)
    const scriptPath = process.env.BACKUP_SCRIPT_PATH || "/volume1/docker/Buchungstool/scripts/backup-container.sh";
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({
        error: `Backup-Script nicht gefunden: ${scriptPath}`,
        hint: "Setze BACKUP_SCRIPT_PATH auf den korrekten Pfad oder f-hre das Backend in der NAS/Docker-Umgebung aus.",
      });
    }

    const shellCandidates = [];
    if (process.env.BACKUP_SHELL) shellCandidates.push(process.env.BACKUP_SHELL);
    if (process.platform === "win32") {
      shellCandidates.push(
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files\\Git\\usr\\bin\\sh.exe",
        "bash",
        "sh"
      );
    } else {
      shellCandidates.push("/bin/sh", "sh", "bash");
    }

    const env = {
      ...process.env,
      POSTGRES_HOST: process.env.POSTGRES_HOST || "postgres",
      POSTGRES_DB: process.env.POSTGRES_DB || "buchungstool",
      POSTGRES_USER: process.env.POSTGRES_USER || "propus",
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || (process.env.DATABASE_URL || "").match(/:[^:@]+@/)?.[0]?.replace(/^:|@$/g,"") || "propus2024",
    };

    const triedShells = [];
    function tryShell(index) {
      if (index >= shellCandidates.length) {
        return res.status(500).json({
          error: "Keine geeignete Shell f-r das Backup-Script gefunden.",
          scriptPath,
          triedShells,
          hint: process.platform === "win32"
            ? "Installiere Git Bash/WSL oder setze BACKUP_SHELL auf eine g-ltige sh/bash-Binary."
            : "Pr-fe, ob /bin/sh vorhanden ist oder setze BACKUP_SHELL.",
        });
      }

      const shell = shellCandidates[index];
      if (path.isAbsolute(shell) && !fs.existsSync(shell)) {
        triedShells.push(`${shell} (nicht gefunden)`);
        return tryShell(index + 1);
      }

      execFile(shell, [scriptPath], { timeout: 120000, env }, (err, stdout, stderr) => {
        if (!err) return res.json({ ok: true, output: stdout, shell });

        if (err && err.code === "ENOENT") {
          triedShells.push(`${shell} (ENOENT)`);
          return tryShell(index + 1);
        }

        return res.status(500).json({ error: err.message, stderr, stdout, shell, scriptPath });
      });
    }

    tryShell(0);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/backups/:name/download", requireAdmin, async (req, res) => {
  try {
    const path = require("path");
    const fs = require("fs");
    const name = path.basename(req.params.name);
    const fullPath = path.join(BACKUP_ROOT, name);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Backup nicht gefunden" });
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      // Ordner als tar.gz streamen
      const { spawn } = require("child_process");
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${name}.tar.gz"`);
      const tar = spawn("tar", ["-czf", "-", "-C", BACKUP_ROOT, name]);
      tar.stdout.pipe(res);
      tar.stderr.on("data", () => {});
      tar.on("error", (e) => res.status(500).end(e.message));
    } else {
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/backups/:name", requireAdmin, async (req, res) => {
  try {
    const path = require("path");
    const fs = require("fs");
    const name = path.basename(req.params.name);
    const fullPath = path.join(BACKUP_ROOT, name);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Backup nicht gefunden" });
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/backups/:name/restore", requireAdmin, async (req, res) => {
  try {
    const path = require("path");
    const fs = require("fs");
    const { execFile, spawn } = require("child_process");
    const name = path.basename(req.params.name);
    const fullPath = path.join(BACKUP_ROOT, name);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "Backup nicht gefunden" });

    // SQL-Dump wiederherstellen
    if (name.endsWith(".sql")) {
      const pgHost = process.env.POSTGRES_HOST || "postgres";
      const pgDb = process.env.POSTGRES_DB || "buchungstool";
      const pgUser = process.env.POSTGRES_USER || "buchungstool";
      const pgPass = process.env.POSTGRES_PASSWORD || "";
      const env = { ...process.env, PGPASSWORD: pgPass };
      execFile("psql", ["-h", pgHost, "-U", pgUser, "-d", pgDb, "-f", fullPath],
        { env, timeout: 60000 },
        (err, stdout, stderr) => {
          if (err) return res.status(500).json({ error: err.message, stderr });
          res.json({ ok: true, message: "SQL-Dump wiederhergestellt", output: stdout });
        }
      );
      return;
    }

    // Ordner-Backup: files.tar wiederherstellen
    if (fs.statSync(fullPath).isDirectory()) {
      const filesTar = path.join(fullPath, "files.tar");
      if (!fs.existsSync(filesTar)) return res.status(400).json({ error: "files.tar nicht im Backup-Ordner gefunden" });
      const restoreTarget = process.env.BACKUP_RESTORE_TARGET || "/volume1/docker";
      execFile("tar", ["-xf", filesTar, "-C", restoreTarget],
        { timeout: 60000 },
        (err, stdout, stderr) => {
          if (err) return res.status(500).json({ error: err.message, stderr });
          res.json({
            ok: true,
            message: "Dateien wiederhergestellt. Backend-Neustart empfohlen.",
            output: stdout,
            restoreTarget,
          });
        }
      );
      return;
    }

    res.status(400).json({ error: "Backup-Typ nicht unterst\u00fctzt" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==============================
// Server starten
// ==============================
// -
// E-MAIL-TEMPLATE CRUD
// -

// Alle Templates listen
app.get("/api/admin/email-templates", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const templates = await templateRenderer.listTemplates(pool);
    res.json({ ok: true, templates, placeholders: templateRenderer.AVAILABLE_PLACEHOLDERS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Einzelnes Template laden
app.get("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const { rows } = await pool.query(
      "SELECT id, key, label, subject, body_html, body_text, placeholders, active, updated_at FROM email_templates WHERE key=$1",
      [req.params.key]
    );
    if (!rows[0]) return res.status(404).json({ error: "Template nicht gefunden" });
    const history = await templateRenderer.getTemplateHistory(pool, req.params.key);
    res.json({ ok: true, template: rows[0], history, placeholders: templateRenderer.AVAILABLE_PLACEHOLDERS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/email-workflow-config", requireAdmin, async (_req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    await seedEmailWorkflowConfig(pool);
    const { rows } = await pool.query(
      `SELECT id, status_to, template_key, role, active, ics_customer, ics_office, updated_at
       FROM email_workflow_config
       ORDER BY status_to, role, template_key`
    );
    res.json({ ok: true, config: rows || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/api/admin/email-workflow-config/:id", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verfuegbar" });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Ungueltige ID" });
    const body = req.body || {};
    const fields = [];
    const values = [id];
    if (body.active !== undefined) { values.push(!!body.active); fields.push(`active = $${values.length}`); }
    if (body.ics_customer !== undefined) { values.push(!!body.ics_customer); fields.push(`ics_customer = $${values.length}`); }
    if (body.ics_office !== undefined) { values.push(!!body.ics_office); fields.push(`ics_office = $${values.length}`); }
    if (fields.length === 0) return res.status(400).json({ error: "Keine Felder zum Aktualisieren" });
    fields.push("updated_at = NOW()");
    const { rows } = await pool.query(
      `UPDATE email_workflow_config SET ${fields.join(", ")} WHERE id = $1
       RETURNING id, status_to, template_key, role, active, ics_customer, ics_office, updated_at`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: "Eintrag nicht gefunden" });
    res.json({ ok: true, entry: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function extractHeadStyleAssets(html) {
  const headMatch = String(html || "").match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return "";
  const inner = headMatch[1];
  const styles = inner.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
  const links = inner.match(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi) || [];
  return styles.concat(links).join("\n");
}

function extractBodyContent(html) {
  if (!html) return html;
  const bodyMatch = String(html).match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return html;
  const bodyInner = bodyMatch[1].trim();
  const headAssets = extractHeadStyleAssets(html);
  return headAssets ? `${headAssets}\n${bodyInner}` : bodyInner;
}

// Template anlegen oder aktualisieren
app.put("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const { subject, body_html: rawBodyHtml, body_text, label, active } = req.body || {};
    const body_html = extractBodyContent(rawBodyHtml);
    const key = req.params.key;
    if (!key) return res.status(400).json({ error: "Template-Key fehlt" });

    // History sichern falls vorhanden
    const existing = await pool.query("SELECT id, subject, body_html FROM email_templates WHERE key=$1", [key]);
    if (existing.rows[0]) {
      await pool.query(
        "INSERT INTO email_template_history (template_id, template_key, subject, body_html, changed_by) VALUES ($1,$2,$3,$4,$5)",
        [existing.rows[0].id, key, existing.rows[0].subject, existing.rows[0].body_html, "admin"]
      );
    }

    const { rows } = await pool.query(
      `INSERT INTO email_templates (key, label, subject, body_html, body_text, active, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())
       ON CONFLICT (key) DO UPDATE SET
         label=$2, subject=$3, body_html=$4, body_text=$5, active=$6, updated_at=NOW()
       RETURNING *`,
      [key, label || key, subject || "", body_html || "", body_text || "", active !== false]
    );
    res.json({ ok: true, template: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Template aktiv/inaktiv schalten
app.patch("/api/admin/email-templates/:key/toggle", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const { rows } = await pool.query(
      "UPDATE email_templates SET active=NOT active, updated_at=NOW() WHERE key=$1 RETURNING key, active",
      [req.params.key]
    );
    if (!rows[0]) return res.status(404).json({ error: "Template nicht gefunden" });
    res.json({ ok: true, key: rows[0].key, active: rows[0].active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview: Template mit Order-Daten rendern
app.post("/api/admin/email-templates/:key/preview", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const { orderNo } = req.body || {};
    const key = req.params.key;

    // Template laden
    const tmplRow = await pool.query(
      "SELECT subject, body_html FROM email_templates WHERE key=$1",
      [key]
    );
    if (!tmplRow.rows[0]) return res.status(404).json({ error: "Template nicht gefunden" });
    const tmpl = tmplRow.rows[0];

    // Order laden fuer Preview-Variablen
    let order = {};
    if (orderNo) {
      const o = process.env.DATABASE_URL ? await db.getOrderByNo(Number(orderNo)) : (await loadOrders()).find(ord => ord.orderNo === Number(orderNo));
      if (o) order = o;
    }

    const vars = templateRenderer.buildTemplateVars(order, {
      reviewLink: (process.env.FRONTEND_URL || "https://admin-booking.propus.ch") + "/review/preview-token",
      googleReviewLink: "https://g.page/r/CSQ5RnWmJOumEAE/review",
      confirmationLink: (process.env.FRONTEND_URL || "https://admin-booking.propus.ch") + "/confirm/preview",
    });

    const renderedSubject = templateRenderer.renderTemplate(tmpl.subject, vars);
    const renderedHtml = templateRenderer.renderTemplate(tmpl.body_html, vars);

    res.json({ ok: true, subject: renderedSubject, body_html: renderedHtml, vars });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Testversand: IMMER an eingeloggten Admin
app.post("/api/admin/email-templates/:key/test-send", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const { orderNo, toEmail, includeCustomerIcs, includeOfficeIcs } = req.body || {};
    const key = req.params.key;

    const tmplRow = await pool.query("SELECT subject, body_html FROM email_templates WHERE key=$1", [key]);
    if (!tmplRow.rows[0]) return res.status(404).json({ error: "Template nicht gefunden" });
    const tmpl = tmplRow.rows[0];

    let order = {};
    if (orderNo) {
      const o = process.env.DATABASE_URL ? await db.getOrderByNo(Number(orderNo)) : (await loadOrders()).find(ord => ord.orderNo === Number(orderNo));
      if (o) order = o;
    }

    const vars = templateRenderer.buildTemplateVars(order, {
      reviewLink: (process.env.FRONTEND_URL || "https://admin-booking.propus.ch") + "/review/test",
      googleReviewLink: "https://g.page/r/CSQ5RnWmJOumEAE/review",
      confirmationLink: (process.env.FRONTEND_URL || "https://admin-booking.propus.ch") + "/confirm/test",
    });

    const targetEmail = String(toEmail || req.user?.email || MAIL_FROM || "").trim();
    if (!targetEmail) return res.status(400).json({ error: "Empfaenger-E-Mail fehlt" });
    const subject = "[TEST] " + templateRenderer.renderTemplate(tmpl.subject, vars);
    const html = templateRenderer.renderTemplate(tmpl.body_html, vars);
    const icsAttachments = [];
    const hasSched = order && order.schedule && order.schedule.date && order.schedule.time;
    if (hasSched && (includeCustomerIcs === true || includeOfficeIcs === true)) {
      const orderNoForIcs = order.orderNo || order.order_no || orderNo || "TEST";
      const evTypeTest = String(order.status || "").toLowerCase() === "confirmed" ? "confirmed" : undefined;
      let title = buildCalendarSubject({
        title: order.address || vars.addressLine || "Termin",
        orderNo: orderNoForIcs,
      });
      let description = `Testversand fuer Template ${key}`;
      try {
        const rTest = await pool.query("SELECT 1 FROM calendar_templates WHERE key='customer_event' LIMIT 1");
        if (rTest.rows.length) {
          const rIcs = await renderStoredCalendarTemplate(pool, "customer_event", order, { eventType: evTypeTest });
          title = rIcs.subject || title;
          description = rIcs.body || description;
        }
      } catch (_e) {}
      const icsBase = buildIcsEvent({
        title,
        description,
        location: order.address || "-",
        date: order.schedule.date,
        time: order.schedule.time,
        durationMin: order.schedule.durationMin || 60,
      });
      if (includeCustomerIcs === true) {
        icsAttachments.push({
          filename: `kunde-${orderNoForIcs}.ics`,
          content: icsBase.icsContent,
          contentType: "text/calendar; method=REQUEST",
        });
      }
      if (includeOfficeIcs === true) {
        icsAttachments.push({
          filename: `buero-${orderNoForIcs}.ics`,
          content: icsBase.icsContent,
          contentType: "text/calendar; method=REQUEST",
        });
      }
    }

    if (graphClient || mailer) {
      const sendResult = await sendMailWithFallback({
        to: targetEmail,
        subject,
        html,
        text: "",
        icsAttachments,
        context: `template-test:${key}:${targetEmail}`,
      });
      assertMailSent(sendResult, `template-test:${key}:${targetEmail}`);
      console.log("[template-test] Testmail gesendet:", { to: targetEmail, template: key, ics: icsAttachments.length });
      res.json({ ok: true, sentTo: targetEmail, subject });
    } else {
      res.status(503).json({ error: "Mail-Versand nicht konfiguriert (graphClient/smtp fehlt)" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// History-Eintrag wiederherstellen
app.post("/api/admin/email-templates/:key/restore/:historyId", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const entry = await templateRenderer.restoreTemplateVersion(pool, Number(req.params.historyId), "admin");
    res.json({ ok: true, restored: entry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Template l-schen
app.delete("/api/admin/email-templates/:key", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const key = req.params.key;
    const { rows } = await pool.query(
      "DELETE FROM email_templates WHERE key=$1 RETURNING key",
      [key]
    );
    if (!rows[0]) return res.status(404).json({ error: "Template nicht gefunden" });
    res.json({ ok: true, deleted: rows[0].key });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -
// REVIEWS / BEWERTUNGEN
// -

// KPI-Dashboard
app.get("/api/admin/reviews/kpi", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });

    const [faellig, gesendet, beantwortet, avgRating] = await Promise.all([
      pool.query("SELECT COUNT(*) AS cnt FROM orders WHERE status='done' AND done_at IS NOT NULL AND done_at <= NOW() - INTERVAL '5 days' AND review_request_sent_at IS NULL"),
      pool.query("SELECT COUNT(*) AS cnt FROM orders WHERE review_request_sent_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_reviews r WHERE r.order_no=orders.order_no AND r.submitted_at IS NOT NULL)"),
      pool.query("SELECT COUNT(*) AS cnt FROM orders WHERE EXISTS (SELECT 1 FROM order_reviews r WHERE r.order_no=orders.order_no AND r.submitted_at IS NOT NULL)"),
      pool.query("SELECT AVG(rating)::numeric(3,1) AS avg FROM order_reviews WHERE submitted_at IS NOT NULL AND rating IS NOT NULL"),
    ]);

    const sentCount = Number(gesendet.rows[0].cnt);
    const answeredCount = Number(beantwortet.rows[0].cnt);
    const responseRate = (sentCount + answeredCount) > 0
      ? Math.round(answeredCount / (sentCount + answeredCount) * 100)
      : 0;

    res.json({
      ok: true,
      kpi: {
        faellig: Number(faellig.rows[0].cnt),
        gesendet: sentCount,
        beantwortet: answeredCount,
        responseRate,
        avgRating: avgRating.rows[0].avg ? Number(avgRating.rows[0].avg) : null,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reviews-Liste
app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const limit = Math.min(Number(req.query.limit || 200), 500);
    const { rows } = await pool.query(`
      SELECT
        o.order_no, o.billing->>'name' AS customer_name, o.billing->>'email' AS customer_email,
        o.done_at, o.review_request_sent_at, o.review_request_count,
        r.id AS review_id, r.rating, r.comment, r.submitted_at, r.created_at AS review_created_at,
        CASE
          WHEN r.submitted_at IS NOT NULL THEN 'responded'
          WHEN o.review_request_sent_at IS NOT NULL THEN 'sent'
          WHEN o.done_at IS NOT NULL AND o.done_at <= NOW() - INTERVAL '5 days' THEN 'pending'
          ELSE 'not_due'
        END AS review_status
      FROM orders o
      LEFT JOIN order_reviews r ON r.order_no = o.order_no
      WHERE o.status IN ('done', 'archived')
        OR o.review_request_sent_at IS NOT NULL
      ORDER BY o.done_at DESC NULLS LAST
      LIMIT $1
    `, [limit]);
    res.json({ ok: true, reviews: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Review-Anfrage jetzt/erneut senden
app.post("/api/admin/orders/:orderNo/review/resend", requireAdmin, async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const orderNo = Number(req.params.orderNo);
    const order = process.env.DATABASE_URL ? await db.getOrderByNo(orderNo) : (await loadOrders()).find(o => o.orderNo === orderNo);
    if (!order) return res.status(404).json({ error: "Auftrag nicht gefunden" });

    // Cooldown pr-fen (7 Tage)
    if (order.reviewRequestSentAt) {
      const lastSent = new Date(order.reviewRequestSentAt);
      const cooldownMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastSent.getTime() < cooldownMs) {
        const daysLeft = Math.ceil((cooldownMs - (Date.now() - lastSent.getTime())) / (24 * 60 * 60 * 1000));
        return res.status(429).json({ error: `Cooldown aktiv. Erneut senden in ${daysLeft} Tag(en).` });
      }
    }

    // Token generieren
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query(
      "INSERT INTO order_reviews (order_no, token) VALUES ($1,$2) ON CONFLICT DO NOTHING",
      [orderNo, token]
    );

    const frontendUrl = process.env.FRONTEND_URL || "https://admin-booking.propus.ch";
    const reviewLink = `${frontendUrl}/review/${token}`;
    const googleReviewLink = "https://g.page/r/CSQ5RnWmJOumEAE/review";

    // Mail versenden
    const customerEmail = order.billing?.email || "";
    let reviewMailSent = false;
    if (graphClient && customerEmail) {
      const subject = `Wie war Ihr Shooting? Auftrag #${orderNo}`;
      const html = `<p>Guten Tag ${order.billing?.name || ""},</p>
<p>wir hoffen, dass alles zu Ihrer Zufriedenheit war. Wir freuen uns -ber Ihr Feedback:</p>
<p><a href="${reviewLink}">Jetzt bewerten (1-5 Sterne)</a></p>
<p><a href="${googleReviewLink}">Auf Google bewerten</a></p>
<p>Herzliche Gr-sse, Ihr Propus-Team</p>`;
      const mailResult = await sendMailWithFallback({
        to: customerEmail,
        subject,
        html,
        text: "",
        context: `manual-review-request:${orderNo}`,
      });
      reviewMailSent = mailResult && mailResult.sent === true;
    }

    // Timestamp + Count nur bei bestaetigtem Versand aktualisieren
    if (reviewMailSent && process.env.DATABASE_URL) {
      const nowIso = new Date().toISOString();
      await db.updateOrderFields(orderNo, {
        review_request_sent_at: nowIso,
        review_request_count: (order.reviewRequestCount || 0) + 1,
      });
    }

    res.json({ ok: true, orderNo, reviewLink, sentTo: order.billing?.email || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Review als erledigt markieren (ohne Mail)
app.patch("/api/admin/orders/:orderNo/review/dismiss", requireAdmin, async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const orderNo = Number(req.params.orderNo);
    const nowIso = new Date().toISOString();
    await db.updateOrderFields(orderNo, { review_request_sent_at: nowIso, review_request_count: 1 });
    res.json({ ok: true, orderNo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -ffentlich: Review-Token abrufen (kein Login)
app.get("/api/review/:token", async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const { rows } = await pool.query(
      "SELECT r.id, r.order_no, r.rating, r.submitted_at, o.billing->>'name' AS customer_name FROM order_reviews r JOIN orders o ON o.order_no=r.order_no WHERE r.token=$1",
      [req.params.token]
    );
    if (!rows[0]) return res.status(404).json({ error: "Ung-ltiger oder abgelaufener Link" });
    if (rows[0].submitted_at) return res.json({ ok: true, alreadySubmitted: true, rating: rows[0].rating });
    res.json({ ok: true, alreadySubmitted: false, orderNo: rows[0].order_no, customerName: rows[0].customer_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -ffentlich: Review absenden
app.post("/api/review/:token", async (req, res) => {
  try {
    const pool = db.getPool ? db.getPool() : null;
    if (!pool) return res.status(503).json({ error: "DB nicht verf-gbar" });
    const { rating, comment } = req.body || {};
    if (!rating || Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({ error: "Bewertung muss zwischen 1 und 5 liegen" });
    }
    const { rows } = await pool.query(
      "UPDATE order_reviews SET rating=$1, comment=$2, submitted_at=NOW() WHERE token=$3 AND submitted_at IS NULL RETURNING order_no",
      [Number(rating), comment || null, req.params.token]
    );
    if (!rows[0]) return res.status(404).json({ error: "Token ung-ltig oder bereits verwendet" });
    res.json({ ok: true, orderNo: rows[0].order_no });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ZusÃ¤tzliche Admin-Routen, die das Frontend erwartet (Kontakte/Reviews/Templates/etc.)
registerCustomerContactsRoutes(app, db, requireAdmin, ensureCustomerInRequestCompany);
registerAccessRoutes(app, { db, requireAdmin, ensureCustomerInRequestCompany, rbac });
registerAdminUsersRoutes(app, { db, requireAdmin, rbac });
registerExxasReconcileRoutes(app, db, requireAdmin, ensureCustomerInRequestCompany);
registerAdminMissingRoutes(app, db, requireAdmin, mailer);

// ─── Admin-Panel SPA (React/Vite Build) ─────────────────────────────────────
// Liefert das gebaute Frontend aus admin-panel/dist aus.
// Alle nicht-API-Routen geben index.html zurück (SPA-Routing).
const ADMIN_PANEL_DIST = process.env.ADMIN_PANEL_DIST
  ? path.resolve(process.env.ADMIN_PANEL_DIST)
  : path.join(__dirname, "admin-panel", "dist");
if (require("fs").existsSync(ADMIN_PANEL_DIST)) {
  app.use(express.static(ADMIN_PANEL_DIST));
  app.get(/^(?!\/api|\/auth).*$/, (_req, res) => {
    res.sendFile(path.join(ADMIN_PANEL_DIST, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.send("<h2>Admin Panel nicht gebaut – bitte <code>npm run build</code> in <code>admin-panel/</code> ausführen.</h2>");
  });
}

async function ensureDatabaseBootstrapped() {
  if (!process.env.DATABASE_URL) return;
  try {
    if (db.initSchema) await db.initSchema();
    if (db.runMigrations) await db.runMigrations();
  } catch (e) {
    console.error("[boot] DB init/migrations failed:", e?.message || e);
  }
}

async function startServer() {
  await ensureDatabaseBootstrapped();
  await initOrderCounter();
  try {
    await rbac.seedRbacIfNeeded();
    await rbac.syncAllLegacySubjects();
  } catch (e) {
    console.warn("[boot] rbac init:", e?.message || e);
  }
  if (process.env.DATABASE_URL && db.bootstrapAdminUserFromEnvIfMissing) {
    try {
      const boot = await db.bootstrapAdminUserFromEnvIfMissing();
      if (boot?.created || boot?.updated) {
        console.log("[boot] admin_users", boot.created ? "angelegt:" : "Passwort synchronisiert:", boot.username);
      }
    } catch (e) {
      console.warn("[boot] admin_users Bootstrap:", e?.message || e);
    }
  }
  if (process.env.PROPUS_PLATFORM_MERGED !== "1") {
    app.listen(PORT, () => {
      console.log(`[boot] ${getBuildId()}`);
      console.log(`Availability API running on http://localhost:${PORT}`);
    });
  }

  // Hintergrund-Jobs starten (hinter feature.backgroundJobs Flag)
  try {
    await startJobs({
      db,
      getSetting,
      graphClient,
      OFFICE_EMAIL,
      PHOTOG_PHONES,
      sendMail: sendMailViaGraph,
    });
  } catch (jobErr) {
    console.error("[boot] Jobs konnten nicht gestartet werden:", jobErr && jobErr.message);
  }
}

if (process.env.DATABASE_URL) {
  setTimeout(() => {
    resumePendingTransfers(db, {
      loadOrder: async (orderNo) => db.getOrderByNo(orderNo),
      notifyCompleted: typeof notifyCompletedUploadBatch === "function" ? notifyCompletedUploadBatch : () => {},
    })
      .then((count) => { if (count > 0) console.log("[upload-batch] resumed pending transfers", { count }); })
      .catch((err) => { console.warn("[upload-batch] resume failed:", err?.message || err); });
  }, 2500);

  setTimeout(() => {
    syncWebsizeForAllCustomerFolders(db, console)
      .then((stats) => { if (stats.created || stats.updated || stats.deleted) console.log("[websize-sync] initial sync completed", stats); })
      .catch((err) => { console.warn("[websize-sync] initial sync failed:", err?.message || err); });
  }, 6000);

  setInterval(() => {
    syncWebsizeForAllCustomerFolders(db, console)
      .then((stats) => { if (stats.created || stats.updated || stats.deleted) console.log("[websize-sync] periodic sync completed", stats); })
      .catch((err) => { console.warn("[websize-sync] periodic sync failed:", err?.message || err); });
  }, 10 * 60 * 1000);
}

async function runIfMain() {
  if (process.env.PROPUS_PLATFORM_MERGED === "1") return;
  try {
    await startServer();
  } catch (err) {
    console.error("[boot] fatal error", err.message);
    process.exit(1);
  }
}

runIfMain();

module.exports = { app, startServer };
