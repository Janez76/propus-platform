// Upload Server - Backend API
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import cors from "cors";
import morgan from "morgan";
import { spawn } from "child_process";
import sharp from "sharp";
import { exiftool } from "exiftool-vendored";
import nodemailer from "nodemailer";
import { shouldSend as utShouldSend, keyFor as utKeyFor } from "./mail_dedupe.js";
import { initNasQueue, enqueue as nasEnqueue, resumeOnStartup as nasResumeOnStartup, getQueueStatus, releaseQueue as nasReleaseQueue, ensureQueueReleased } from "./nas_transfer_queue.js";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import session from "express-session";
import passport from "passport";
import { setupOIDC, ensureAuthenticated } from "./oidc-auth.js";

// Load environment variables
dotenv.config();

const fsp = fs.promises;

// ====== CONSTANTS ======
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || "development";
const SSO_ENABLED = String(process.env.SSO_ENABLED || "false").toLowerCase() === "true";

// Upload Configuration
const MAX_UPLOAD_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || "64", 10);
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const CHUNK_SIZE_MB = parseInt(process.env.CHUNK_SIZE_MB || "32", 10);
const TEMP_CLEANUP_AGE_HOURS = parseInt(process.env.TEMP_CLEANUP_AGE_HOURS || "24", 10);

// Rate Limiting
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10); // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100", 10);
const UPLOAD_RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.UPLOAD_RATE_LIMIT_MAX_REQUESTS || "5000", 10);

// Request Timeouts
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "3600000", 10); // 1 hour
const UPLOAD_TIMEOUT_MS = parseInt(process.env.UPLOAD_TIMEOUT_MS || "3600000", 10); // 1 hour

// Path Validation
const MAX_FILENAME_LENGTH = parseInt(process.env.MAX_FILENAME_LENGTH || "255", 10);
const MAX_CUSTOMER_LENGTH = parseInt(process.env.MAX_CUSTOMER_LENGTH || "100", 10);
const MAX_PROJECT_LENGTH = parseInt(process.env.MAX_PROJECT_LENGTH || "100", 10);

// Thumbnail Configuration
const THUMBNAIL_SIZE_PX = 512;
const THUMBNAIL_QUALITY = 86;
const RAW_PARTIAL_SLICE_SIZES = [
  4 * 1024 * 1024,   // 4MB
  8 * 1024 * 1024,   // 8MB
  16 * 1024 * 1024,  // 16MB
  32 * 1024 * 1024,  // 32MB
  64 * 1024 * 1024   // 64MB
];

// File Type Lists
const RAW_LIST = ["cr2", "cr3", "nef", "arw", "raf", "rw2", "dng", "orf", "srw", "pef"];
const IMG_LIST = ["jpg", "jpeg", "png", "webp", "tif", "tiff"];
const VID_LIST = ["mp4", "mov", "m4v", "avi", "mkv", "webm"];
const PDF_LIST = ["pdf"];

const RAW_EXT = new Set([".cr2", ".cr3", ".nef", ".arw", ".raf", ".rw2", ".dng", ".orf", ".srw", ".pef"]);
const ALLOWED_EXT = new Set([...RAW_LIST, ...IMG_LIST, ...VID_LIST, ...PDF_LIST]);

// Directory Configuration
const ROOT = process.cwd();
const TMP_DIR = path.join(ROOT, "uploads_tmp");
const OUT_DIR = process.env.UPLOAD_OUTPUT_DIR || path.join(ROOT, "uploads");
const LOCAL_STAGING_DIR = process.env.LOCAL_STAGING_DIR || path.join(ROOT, "uploads_local");
const NAS_QUEUE_DIR = process.env.NAS_QUEUE_DIR || path.join(ROOT, "nas_queue");
const LOG_DIR = process.env.LOG_DIR ? path.resolve(process.env.LOG_DIR) : path.join(ROOT, "logs");
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === "development" ? "debug" : "info");
const REPORTS_DIR = process.env.REPORTS_DIR ? path.resolve(process.env.REPORTS_DIR) : path.join(ROOT, "reports");
const REPORT_RETENTION_DAYS = parseInt(process.env.REPORT_RETENTION_DAYS || "30", 10);
const MAX_REPORT_TOTAL_MB = parseInt(process.env.MAX_REPORT_TOTAL_MB || "25", 10);
const MAX_REPORT_TOTAL_BYTES = MAX_REPORT_TOTAL_MB * 1024 * 1024;

// Ensure log dir exists before logger setup
await fsp.mkdir(LOG_DIR, { recursive: true }).catch((err) => {
  console.error("Failed to create LOG_DIR:", err);
});
await fsp.mkdir(LOCAL_STAGING_DIR, { recursive: true }).catch(() => {});
await fsp.mkdir(NAS_QUEUE_DIR, { recursive: true }).catch(() => {});

const logLevels = {
  levels: { error: 0, warn: 1, info: 2, http: 3, debug: 4 },
};

const logger = winston.createLogger({
  levels: logLevels.levels,
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "app-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      zippedArchive: true,
      level: "http",
    }),
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles: "30d",
      zippedArchive: true,
      level: "error",
      handleExceptions: true,
    }),
    new winston.transports.Console({
      level: NODE_ENV === "development" ? "debug" : "info",
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

const morganStream = {
  write: (message) => logger.http(message.trim()),
};

// Mail Notification (SMTP + Graph API Fallback)
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || "office@propus.ch";
const OFFICE_EMAIL = process.env.OFFICE_EMAIL || SMTP_USER || "office@propus.ch";

/** Nextcloud Files (?dir=…) — Pfad bis zum UPLOAD_OUTPUT_DIR-Wurzel in NC (External Storage). Ohne diese beiden ENV kein Link in der Mail. */
const NEXTCLOUD_URL = String(process.env.NEXTCLOUD_URL || "").trim().replace(/\/$/, "");
const NEXTCLOUD_UPLOAD_TOOL_PREFIX = String(process.env.NEXTCLOUD_UPLOAD_TOOL_PREFIX || "")
  .trim()
  .replace(/\\/g, "/")
  .replace(/\/$/, "");

// Graph API Config
const MS_GRAPH_TENANT_ID = process.env.MS_GRAPH_TENANT_ID || "";
const MS_GRAPH_CLIENT_ID = process.env.MS_GRAPH_CLIENT_ID || "";
const MS_GRAPH_CLIENT_SECRET = process.env.MS_GRAPH_CLIENT_SECRET || "";

let graphClient = null;
if (MS_GRAPH_TENANT_ID && MS_GRAPH_CLIENT_ID && MS_GRAPH_CLIENT_SECRET) {
  import("@azure/identity").then(({ ClientSecretCredential }) => {
    import("@microsoft/microsoft-graph-client").then(({ Client }) => {
      import("@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js").then(({ TokenCredentialAuthenticationProvider }) => {
        const credential = new ClientSecretCredential(MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET);
        const authProvider = new TokenCredentialAuthenticationProvider(credential, { scopes: ["https://graph.microsoft.com/.default"] });
        graphClient = Client.initWithMiddleware({ authProvider });
        logger.info("Graph API Client initialized for fallback mail");
      });
    });
  }).catch(e => logger.warn("Failed to init Graph API: " + e.message));
}

async function sendMailWithFallback({ to, subject, html, text }) {
  let mailed = false;
  // Versuch 1: Graph API
  if (graphClient && OFFICE_EMAIL) {
    try {
      const message = {
        subject,
        body: { contentType: "HTML", content: html || text },
        toRecipients: [{ emailAddress: { address: to } }]
      };
      await graphClient.api(`/users/${OFFICE_EMAIL}/sendMail`).post({ message, saveToSentItems: true });
      logger.info("Mail sent via Graph API", { to, subject });
      return true;
    } catch (e) {
      logger.warn("Graph API mail failed, trying SMTP", { error: e.message });
    }
  }

  // Versuch 2: SMTP
  if (smtpTransporter) {
    try {
      await smtpTransporter.sendMail({ from: MAIL_FROM, to, subject, html, text });
      logger.info("Mail sent via SMTP", { to, subject });
      return true;
    } catch (e) {
      logger.error("SMTP mail failed", { error: e.message });
      throw e; // Wenn beides scheitert
    }
  }
  
  if (!graphClient && !smtpTransporter) {
    logger.warn("No mail transport configured");
  }
  return false;
}

// CORS Configuration
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:4455")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin) {
  if (!origin) return true;
  if (origin === "null") return true;

  return ALLOWED_ORIGINS.some((rule) => {
    if (rule === "*") return true;
    if (rule === origin) return true;

    // Support wildcard host patterns like:
    // https://*.trycloudflare.com
    if (rule.includes("*")) {
      try {
        const originUrl = new URL(origin);
        const ruleUrl = new URL(rule.replace("*.", ""));

        if (originUrl.protocol !== ruleUrl.protocol) return false;
        if (!originUrl.hostname.endsWith(`.${ruleUrl.hostname}`)) return false;
        return true;
      } catch {
        return false;
      }
    }

    return false;
  });
}

// ====== INITIALIZATION ======
const app = express();
app.set("trust proxy", 1);

if (SSO_ENABLED) {
  app.use(session({
    secret: process.env.SESSION_SECRET || "uploadtool_sso_session_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: String(process.env.SESSION_COOKIE_SECURE || "false").toLowerCase() === "true" }
  }));
  setupOIDC(app, passport, { frontendUrl: process.env.FRONTEND_URL || "http://localhost:8092" });
}

// Ensure directories exist
await fsp.mkdir(TMP_DIR, { recursive: true }).catch(err => {
  logger.error("Failed to create TMP_DIR", { err: err?.message || String(err) });
});
await fsp.mkdir(OUT_DIR, { recursive: true }).catch(err => {
  logger.error("Failed to create OUT_DIR", { err: err?.message || String(err) });
});
await fsp.mkdir(REPORTS_DIR, { recursive: true }).catch(err => {
  logger.error("Failed to create REPORTS_DIR", { err: err?.message || String(err), REPORTS_DIR });
});

// ====== MIDDLEWARE ======
// CORS with specific origins
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      logger.warn("CORS rejected origin", { origin, allowedOrigins: ALLOWED_ORIGINS });
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

// Request timeout
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    res.status(408).json({ error: "Request timeout" });
  });
  next();
});

// Body parser
app.use(express.json({ limit: "1mb" }));

if (SSO_ENABLED) {
  app.use("/api", (req, res, next) => {
    if (req.path === "/health") return next();
    return ensureAuthenticated(req, res, next);
  });
}

// Correlate all logs for a request
app.use((req, res, next) => {
  const incoming = String(req.get("x-request-id") || "").trim();
  const requestId = incoming && incoming.length <= 120 ? incoming : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});

// Logging (access log -> file)
morgan.token("id", (req) => req.requestId || "-");
app.use(morgan(":id :remote-addr :method :url :status :res[content-length] - :response-time ms", { stream: morganStream }));

// Keep-Alive für bessere Connection-Wiederverwendung bei parallelen Uploads
app.use((req, res, next) => {
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Keep-Alive", "timeout=60, max=1000");
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/upload/"),
});

const uploadLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: UPLOAD_RATE_LIMIT_MAX_REQUESTS,
  message: { error: "Too many upload requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/upload/", uploadLimiter);
app.use("/api/", limiter);

// Multer configuration
const upload = multer({ dest: TMP_DIR });
const uploadThumb = multer({ dest: TMP_DIR, limits: { fileSize: MAX_UPLOAD_SIZE_BYTES } });
const uploadIssue = multer({
  dest: TMP_DIR,
  limits: {
    // Limit per file; we also enforce total size manually.
    fileSize: MAX_REPORT_TOTAL_BYTES,
    files: 12,
  },
});

// ====== VALIDATION FUNCTIONS ======
function sanitizeName(s = "") {
  if (typeof s !== "string") return "";
  return String(s).trim().replace(/[^\p{L}\p{N} .,_-]/gu, "").replace(/  +/g, " ").trim();
}

function validateCustomer(customer) {
  if (!customer || typeof customer !== "string") return false;
  const sanitized = sanitizeName(customer);
  if (sanitized.length === 0 || sanitized.length > MAX_CUSTOMER_LENGTH) return false;
  if (sanitized.startsWith(".")) return false;
  return sanitized;
}

function validateProject(project) {
  if (!project || typeof project !== "string") return false;
  const sanitized = sanitizeName(project);
  if (sanitized.length === 0 || sanitized.length > MAX_PROJECT_LENGTH) return false;
  if (sanitized.startsWith(".")) return false;
  return sanitized;
}

function validateFilename(filename) {
  if (!filename || typeof filename !== "string") return false;
  if (filename.length === 0 || filename.length > MAX_FILENAME_LENGTH) return false;
  if (filename === "." || filename === ".." || filename.includes("/") || filename.includes("\\")) return false;
  return true;
}

function validateSubPath(subPath) {
  if (!subPath || typeof subPath !== "string") return "";
  const parts = subPath.split("/").map(p => sanitizeName(p)).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length > 10) return false;
  if (parts.some(p => p === "." || p === ".." || p.startsWith("."))) return false;
  return parts.join("/");
}

function validatePath(pathToCheck, baseDir) {
  try {
    const resolved = path.resolve(pathToCheck);
    const baseResolved = path.resolve(baseDir);
    return resolved.startsWith(baseResolved);
  } catch {
    return false;
  }
}

function subdirForExt(ext) {
  const e = (ext || "").toLowerCase();
  if (RAW_LIST.includes(e)) return "raw";
  if (IMG_LIST.includes(e)) return "images";
  if (VID_LIST.includes(e)) return "videos";
  if (PDF_LIST.includes(e)) return "pdf";
  return "images";
}

function getExtLower(filename) {
  const e = path.extname(String(filename || "")).toLowerCase();
  return e.startsWith(".") ? e.slice(1) : e;
}

function isAllowedUploadExt(ext) {
  const e = String(ext || "").toLowerCase();
  return !!e && ALLOWED_EXT.has(e);
}

function assertNoGaps(parts) {
  if (!parts || parts.length === 0) return null;
  const idxs = new Set(parts.map(p => p.i));
  const max = parts[parts.length - 1].i;
  for (let k = 0; k <= max; k++) {
    if (!idxs.has(k)) return k;
  }
  return null;
}

const isRawExt = (filename) => RAW_EXT.has(path.extname(filename || "").toLowerCase());

// ====== UTILITY FUNCTIONS ======
async function waitForFinish(stream) {
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
    stream.end();
  });
}

async function rmDirRecursiveRetry(dir, tries = 5, delayMs = 120) {
  for (let t = 0; t < tries; t++) {
    try {
      // Remove stray files first (.DS_Store, thumbs.db, etc.)
      try {
        const entries = await fsp.readdir(dir);
        await Promise.all(entries.map(async (n) => {
          const p = path.join(dir, n);
          try {
            const st = await fsp.lstat(p);
            if (st.isDirectory()) {
              await rmDirRecursiveRetry(p, 1, delayMs);
            } else {
              await fsp.unlink(p);
            }
          } catch (err) {
            console.warn(`Failed to remove ${p}:`, err.message);
          }
        }));
      } catch (err) {
        console.warn(`Failed to readdir ${dir}:`, err.message);
      }
      await fsp.rm(dir, { recursive: true, force: true });
      return;
    } catch (e) {
      if (t === tries - 1) throw e;
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, t)));
    }
  }
}

let smtpTransporter = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS required)");
  }

  smtpTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });

  return smtpTransporter;
}

function buildUploadtoolNextcloudFolderUrl(customer, project) {
  if (!NEXTCLOUD_URL || !NEXTCLOUD_UPLOAD_TOOL_PREFIX) return null;
  const c = String(customer || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const p = String(project || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const segments = [NEXTCLOUD_UPLOAD_TOOL_PREFIX, c, p].join("/").split("/").filter(Boolean);
  const norm = "/" + segments.join("/");
  return `${NEXTCLOUD_URL}/apps/files/?dir=${encodeURIComponent(norm)}`;
}

function escapeHtmlAttr(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function countFilesByType(files) {
  const counters = { images: 0, raw: 0, videos: 0, pdf: 0, other: 0 };
  for (const f of files) {
    const ext = String(f || "").split(".").pop()?.toLowerCase() || "";
    if (RAW_LIST.includes(ext)) counters.raw += 1;
    else if (IMG_LIST.includes(ext)) counters.images += 1;
    else if (VID_LIST.includes(ext)) counters.videos += 1;
    else if (PDF_LIST.includes(ext)) counters.pdf += 1;
    else counters.other += 1;
  }
  return counters;
}

async function sendUploadMail({ customer, project, count, files, senderName, comment }) {
  const transporter = getSmtpTransporter();
  const counters = countFilesByType(files || []);
  const now = new Date();
  const dateStr = now.toLocaleString("de-CH", { timeZone: "Europe/Zurich", hour12: false });
  const ncFolderUrl = buildUploadtoolNextcloudFolderUrl(customer, project);

  const plainLines = [
    "Es wurde neues Material hochgeladen.",
    "",
    `Upload von: ${senderName || "Unbekannt"}`,
    `Hauptordner: ${customer}`,
    `Unterordner: ${project}`,
    `Datum: ${dateStr}`,
    `Anzahl Dateien gesamt: ${count}`,
    `  Bilder: ${counters.images}`,
    `  RAW:    ${counters.raw}`,
    `  Videos: ${counters.videos}`,
    `  PDF:    ${counters.pdf}`,
    `  Andere: ${counters.other}`,
    ...(ncFolderUrl ? ["", `Nextcloud (Ordner): ${ncFolderUrl}`] : []),
    ...(comment ? ["", `Kommentar: ${comment}`] : [])
  ];

  // Deduplicate quick-check
  try {
    const key = utKeyFor(OFFICE_EMAIL, "Neuer Upload", plainLines.join("\n"));
    if (!utShouldSend(key)) {
      logger.info("Dedup prevented sendUploadMail duplicate", { to: OFFICE_EMAIL, subject: "Neuer Upload" });
      return;
    }
  } catch (e) { /* ignore */ }

  // Build HTML email
  const fileRows = (files || []).slice(0, 30).map((f, i) =>
    `<tr><td style="padding:7px 14px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#0f0f0f;font-family:monospace;background:${i%2===0?'#fff':'#fafafa'};">${f}</td></tr>`
  ).join("");
  const moreFiles = count > 30 ? `<tr><td style="padding:8px 14px;font-size:12px;color:#b8956a;font-weight:600;">+ ${count - 30} weitere Dateien</td></tr>` : "";
  const commentBlock = comment
    ? `<tr><td style="background:#ffffff;padding:0 32px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;border-left:3px solid #b8956a;">
          <tr><td style="padding:14px 18px;">
            <div style="font-size:10px;font-weight:700;color:#b8956a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Kommentar / Hinweis</div>
            <p style="margin:0;font-size:14px;color:#0f0f0f;line-height:1.6;white-space:pre-wrap;">${comment.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>
          </td></tr>
        </table>
      </td></tr>` : "";
  const statsHtml = [
    { label: "Bilder",  val: counters.images, icon: "&#x1F5BC;" },
    { label: "RAW",     val: counters.raw,    icon: "&#x25A3;" },
    { label: "Videos",  val: counters.videos, icon: "&#x25B6;" },
    { label: "PDF",     val: counters.pdf,    icon: "&#x1F4C4;" },
    { label: "Andere",  val: counters.other,  icon: "&#x1F4C1;" },
  ].filter(s => s.val > 0).map(s =>
    `<td style="text-align:center;padding:14px 10px;">
      <div style="font-size:20px;font-weight:800;color:#b8956a;line-height:1;">${s.val}</div>
      <div style="font-size:10px;color:#9c9c97;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">${s.label}</div>
     </td>`
  ).join('<td style="width:1px;background:#e5e5e5;"></td>');

  const ncLinkRow = ncFolderUrl
    ? `<tr>
        <td style="padding:12px 16px;">
          <a href="${escapeHtmlAttr(ncFolderUrl)}" style="display:inline-block;background:#b8956a;color:#ffffff;padding:10px 20px;border-radius:10px;text-decoration:none;font-weight:700;font-size:13px;">Ordner in Nextcloud öffnen</a>
        </td>
      </tr>`
    : "";

  const htmlBody = `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Neuer Upload</title>
</head>
<body style="margin:0;padding:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:40px 16px;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header: Propus Gold Bar -->
  <tr><td style="background:#0f0f0f;padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:24px 32px 20px;">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:12px;vertical-align:middle;">
              <div style="width:36px;height:36px;background:#b8956a;border-radius:8px;display:inline-block;text-align:center;line-height:36px;">
                <span style="color:#fff;font-size:18px;font-weight:800;">P</span>
              </div>
            </td>
            <td style="vertical-align:middle;">
              <div style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-.3px;line-height:1;">PROPUS</div>
              <div style="font-size:11px;color:#9c9c97;margin-top:2px;letter-spacing:.08em;text-transform:uppercase;">Upload-System</div>
            </td>
            <td align="right" style="vertical-align:middle;">
              <span style="background:#b8956a;color:#fff;font-size:11px;font-weight:700;padding:5px 12px;border-radius:20px;letter-spacing:.04em;text-transform:uppercase;">&#x2713; Erfolgreich</span>
            </td>
          </tr></table>
        </td>
      </tr>
      <!-- Gold divider line -->
      <tr><td style="height:3px;background:linear-gradient(90deg,#b8956a 0%,#c9a77a 50%,#b8956a 100%);"></td></tr>
    </table>
  </td></tr>

  <!-- Title Section -->
  <tr><td style="background:#ffffff;padding:28px 32px 0;">
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f0f0f;letter-spacing:-.4px;">Neues Material hochgeladen</h1>
    <p style="margin:6px 0 0;font-size:14px;color:#5a5a5a;">${customer} &rsaquo; ${project}</p>
  </td></tr>

  <!-- Info Cards -->
  <tr><td style="background:#ffffff;padding:20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;">
          <div style="font-size:10px;font-weight:700;color:#9c9c97;text-transform:uppercase;letter-spacing:.08em;">Von</div>
          <div style="font-size:14px;color:#0f0f0f;font-weight:600;margin-top:3px;">${senderName || "Unbekannt"}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;border-bottom:1px solid #f0f0f0;">
          <div style="font-size:10px;font-weight:700;color:#9c9c97;text-transform:uppercase;letter-spacing:.08em;">Datum &amp; Uhrzeit</div>
          <div style="font-size:14px;color:#0f0f0f;margin-top:3px;">${dateStr}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:12px 16px;">
          <div style="font-size:10px;font-weight:700;color:#9c9c97;text-transform:uppercase;letter-spacing:.08em;">Dateien gesamt</div>
          <div style="font-size:20px;color:#b8956a;font-weight:800;margin-top:3px;">${count}</div>
        </td>
      </tr>
      ${ncLinkRow}
    </table>
  </td></tr>

  <!-- Stats Row -->
  ${statsHtml ? `<tr><td style="background:#ffffff;padding:0 32px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;border-radius:12px;padding:4px;">
      <tr>${statsHtml}</tr>
    </table>
  </td></tr>` : ""}

  <!-- Kommentar -->
  ${commentBlock}

  <!-- Dateiliste -->
  ${fileRows || moreFiles ? `<tr><td style="background:#ffffff;padding:0 32px 24px;">
    <div style="font-size:10px;font-weight:700;color:#9c9c97;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;">Hochgeladene Dateien</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e5e5;border-radius:10px;overflow:hidden;">
      ${fileRows}${moreFiles}
    </table>
  </td></tr>` : ""}

  <!-- Footer -->
  <tr><td style="background:#0f0f0f;padding:18px 32px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9c9c97;">
      <span style="color:#b8956a;font-weight:700;">PROPUS</span> GmbH
      &nbsp;&bull;&nbsp; Automatische Benachrichtigung
      &nbsp;&bull;&nbsp; <a href="https://propus.ch" style="color:#b8956a;text-decoration:none;">propus.ch</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  await transporter.sendMail({
    from: MAIL_FROM,
    to: OFFICE_EMAIL,
    subject: `Neuer Upload – ${customer} / ${project}`,
    text: plainLines.join("\n"),
    html: htmlBody
  });
}

// Cleanup old temporary uploads
async function cleanupOldUploads() {
  try {
    const entries = await fsp.readdir(TMP_DIR);
    const now = Date.now();
    const maxAge = TEMP_CLEANUP_AGE_HOURS * 60 * 60 * 1000;

    for (const entry of entries) {
      const entryPath = path.join(TMP_DIR, entry);
      try {
        const stat = await fsp.stat(entryPath);
        const age = now - stat.mtimeMs;
        if (age > maxAge) {
          logger.info("Cleaning up old upload", { entry, ageHours: Math.round(age / 3600000) });
          await rmDirRecursiveRetry(entryPath);
        }
      } catch (err) {
        logger.warn("Failed to cleanup entry", { entry, err: err?.message || String(err) });
      }
    }
  } catch (err) {
    logger.error("Cleanup error", { err: err?.message || String(err) });
  }
}

// Run cleanup every hour
setInterval(cleanupOldUploads, 60 * 60 * 1000);
cleanupOldUploads(); // Run immediately on startup

async function cleanupOldReports() {
  try {
    const days = Number.isFinite(REPORT_RETENTION_DAYS) ? REPORT_RETENTION_DAYS : 30;
    const now = Date.now();
    const entries = await fsp.readdir(REPORTS_DIR).catch(() => []);
    for (const d of entries) {
      // Expect YYYY-MM-DD directories
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const p = path.join(REPORTS_DIR, d);
      try {
        const st = await fsp.stat(p);
        if (!st.isDirectory()) continue;
      } catch {
        continue;
      }
      const t = Date.parse(`${d}T00:00:00Z`);
      if (!Number.isFinite(t)) continue;
      const ageDays = (now - t) / 86400000;
      if (ageDays > days) {
        logger.info("Cleaning up old reports folder", { folder: d, ageDays: Math.round(ageDays) });
        await rmDirRecursiveRetry(p);
      }
    }
  } catch (err) {
    logger.error("Report cleanup error", { err: err?.message || String(err) });
  }
}

// Run report cleanup every 6 hours
setInterval(cleanupOldReports, 6 * 60 * 60 * 1000);
cleanupOldReports();

// ====== RAW PREVIEW FUNCTIONS ======
async function extractEmbeddedPreview(filePath) {
  try {
    const buf = await exiftool.extractBinaryTagToBuffer("PreviewImage", filePath);
    if (buf && buf.length > 0) return buf;
  } catch (err) {
    // No embedded preview in PreviewImage tag
  }
  // Some cameras store "JpgFromRaw" instead
  try {
    const buf = await exiftool.extractBinaryTagToBuffer("JpgFromRaw", filePath);
    if (buf && buf.length > 0) return buf;
  } catch (err) {
    // No embedded preview
  }
  return null;
}

async function dcrawToTiffBuffer(filePath) {
  const run = (bin) => new Promise((resolve, reject) => {
    const args = ["-c", "-w", "-q", "3", "-H", "0", "-o", "1", "-6", "-T", filePath];
    const p = spawn(bin, args);
    const chunks = [];
    let err = "";
    p.stdout.on("data", (d) => chunks.push(d));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0 && chunks.length) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(err || `${bin} exited with code ${code}`));
      }
    });
  });
  try {
    return await run("dcraw");
  } catch {
    return await run("dcraw_emu");
  }
}

async function toThumbJpeg(inputBuffer, size = THUMBNAIL_SIZE_PX) {
  return sharp(inputBuffer)
    .rotate()
    .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: THUMBNAIL_QUALITY, progressive: true })
    .toBuffer();
}

// ====== API ROUTES ======

// Initialize upload
app.post("/api/upload/init", async (req, res) => {
  try {
    const { filename, size, type, lastModified } = req.body || {};
    
    if (!validateFilename(filename)) {
      logger.warn("upload.init invalid filename", { requestId: req.requestId, filename: String(filename || "") });
      return res.status(400).json({ error: "Invalid or missing filename" });
    }

    const ext = getExtLower(filename);
    if (!isAllowedUploadExt(ext)) {
      logger.warn("upload.init unsupported type", { requestId: req.requestId, filename, ext });
      return res.status(415).json({ error: "Unsupported file type", allowed: Array.from(ALLOWED_EXT).sort() });
    }
    
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_SIZE_BYTES) {
      logger.warn("upload.init invalid size", { requestId: req.requestId, filename, size, maxSize: MAX_UPLOAD_SIZE_BYTES });
      return res.status(400).json({ 
        error: "Invalid size", 
        maxSize: MAX_UPLOAD_SIZE_BYTES 
      });
    }

    const uploadId = crypto.randomUUID();
    const dir = path.join(TMP_DIR, uploadId);
    await fsp.mkdir(dir, { recursive: true });
    
    const meta = {
      filename: sanitizeName(filename),
      size: Number(size),
      type: type || "application/octet-stream",
      lastModified: Number.isFinite(Number(lastModified)) && Number(lastModified) > 0 ? Number(lastModified) : null
    };
    
    await fsp.writeFile(
      path.join(dir, "meta.json"),
      JSON.stringify(meta),
      "utf8"
    );

    logger.info("upload.init", {
      event: "upload.init",
      requestId: req.requestId,
      uploadId,
      filename: meta.filename,
      size: meta.size,
      type: meta.type,
      origin: req.get("origin") || null,
      userAgent: req.get("user-agent") || null,
      ip: req.ip,
    });
    
    res.json({ uploadId });
  } catch (err) {
    logger.error("Upload init error", { requestId: req.requestId, err: err?.message || String(err) });
    res.status(500).json({ error: "Failed to initialize upload", detail: err.message });
  }
});

// Get upload status
app.post("/api/upload/status", async (req, res) => {
  try {
    const { uploadId } = req.body || {};
    if (!uploadId || typeof uploadId !== "string") {
      return res.status(400).json({ error: "uploadId required" });
    }

    const dir = path.join(TMP_DIR, uploadId);
    const completed = {};
    
    try {
      const entries = await fsp.readdir(dir);
      for (const name of entries) {
        const m = /^(\d+)\.part$/.exec(name);
        if (m) {
          completed[Number(m[1])] = true;
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        logger.error("Status check error", { requestId: req.requestId, uploadId, err: err?.message || String(err) });
        return res.status(500).json({ error: "Failed to check status" });
      }
    }
    
    res.json({ completed });
  } catch (err) {
    logger.error("Upload status error", { requestId: req.requestId, err: err?.message || String(err) });
    res.status(500).json({ error: "Failed to get status", detail: err.message });
  }
});

// Upload part
app.post("/api/upload/part", upload.single("chunk"), async (req, res) => {
  let uploadId = null;
  let idx = null;
  try {
    ({ uploadId } = req.body || {});
    const { index } = req.body || {};
    
    if (!req.file) {
      return res.status(400).json({ error: "No chunk provided" });
    }
    
    if (!uploadId || typeof uploadId !== "string" || index == null) {
      await fsp.unlink(req.file.path).catch(() => { });
      return res.status(400).json({ error: "uploadId and index required" });
    }

    const dir = path.join(TMP_DIR, uploadId);
    let dirExists = false;
    try {
      const stat = await fsp.stat(dir);
      dirExists = stat.isDirectory();
    } catch {
      dirExists = false;
    }
    
    if (!dirExists) {
      await fsp.unlink(req.file.path).catch(() => { });
      return res.status(404).json({ error: "uploadId not found" });
    }

    idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0) {
      await fsp.unlink(req.file.path).catch(() => { });
      return res.status(400).json({ error: "invalid index" });
    }

    const dest = path.join(dir, `${idx}.part`);
    await fsp.rename(req.file.path, dest);
    res.json({ ok: true });
  } catch (err) {
    logger.error("Upload part error", { requestId: req.requestId, uploadId, index: idx, err: err?.message || String(err) });
    if (req.file?.path) {
      await fsp.unlink(req.file.path).catch(() => { });
    }
    res.status(500).json({ error: "Failed to save chunk", detail: err.message });
  }
});

// Complete upload
app.post("/api/upload/complete", async (req, res) => {
  let out = null;
  const startedAt = Date.now();
  try {
    const { uploadId, customer, project, subPath } = req.body || {};
    
    if (!uploadId || typeof uploadId !== "string") {
      return res.status(400).json({ error: "uploadId required" });
    }
    
    const customerSafe = validateCustomer(customer);
    const projectSafe = validateProject(project);
    
    if (!customerSafe || !projectSafe) {
      return res.status(400).json({ 
        error: "Invalid customer or project", 
        details: {
          customer: customerSafe ? "valid" : "invalid",
          project: projectSafe ? "valid" : "invalid"
        }
      });
    }

    const dir = path.join(TMP_DIR, uploadId);
    let dirExists = false;
    try {
      const stat = await fsp.stat(dir);
      dirExists = stat.isDirectory();
    } catch {
      dirExists = false;
    }
    
    if (!dirExists) {
      return res.status(404).json({ error: "uploadId not found" });
    }

    const metaPath = path.join(dir, "meta.json");
    let meta;
    try {
      const metaContent = await fsp.readFile(metaPath, "utf8");
      meta = JSON.parse(metaContent);
    } catch (err) {
      return res.status(400).json({ error: "meta missing or invalid" });
    }

    const expectedTotal = Number(meta.size || 0);
    if (!expectedTotal || expectedTotal <= 0) {
      return res.status(400).json({ error: "Invalid file size in meta" });
    }

    // Collect parts
    const entries = await fsp.readdir(dir);
    const parts = entries
      .map(n => {
        const m = /^(\d+)\.part$/.exec(n);
        return m ? { i: Number(m[1]), path: path.join(dir, n) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.i - b.i);

    if (parts.length === 0) {
      return res.status(400).json({ error: "no parts uploaded" });
    }

    // Check for gaps
    const missing = assertNoGaps(parts);
    if (missing !== null) {
      return res.status(400).json({ error: "missing parts", missing: [missing] });
    }

    // Prepare destination
    const origName = sanitizeName(meta.filename || `file_${Date.now()}`);
    if (!validateFilename(origName)) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    
    const ext = (origName.split(".").pop() || "").toLowerCase();
    if (!isAllowedUploadExt(ext)) {
      return res.status(415).json({ error: "Unsupported file type", allowed: Array.from(ALLOWED_EXT).sort() });
    }
    const folder = subdirForExt(ext);

    const subPathSafe = validateSubPath(subPath);
    if (subPathSafe === false) {
      return res.status(400).json({ error: "Invalid subPath" });
    }

    const finalName = `${Date.now()}_${origName}`;

    // Lokales Staging-Verzeichnis (VPS-SSD, schnell)
    const localStagingPath = path.join(LOCAL_STAGING_DIR, customerSafe, projectSafe,
      ...(subPathSafe ? [subPathSafe] : []), folder);
    await fsp.mkdir(localStagingPath, { recursive: true });
    const localOutPath = path.join(localStagingPath, finalName);

    // Validate local staging path
    if (!validatePath(localOutPath, LOCAL_STAGING_DIR)) {
      return res.status(400).json({ error: "Invalid output path" });
    }

    // Fast path: single part → direct rename to local staging (no re-read needed)
    if (parts.length === 1) {
      try {
        await fsp.rename(parts[0].path, localOutPath);
      } catch {
        await fsp.copyFile(parts[0].path, localOutPath);
        await fsp.unlink(parts[0].path).catch(() => {});
      }
    } else {
      // Multi-part: streaming merge → local SSD (fast, no SMB latency)
      out = fs.createWriteStream(localOutPath, { highWaterMark: 2 * 1024 * 1024 });
      for (const p of parts) {
        await new Promise((ok, fail) => {
          const rs = fs.createReadStream(p.path, { highWaterMark: 2 * 1024 * 1024 });
          rs.on("error", fail);
          rs.on("end", async () => {
            try { await fsp.unlink(p.path); } catch (err) {
              logger.warn("Failed to delete part", { path: p.path, err: err.message });
            }
            ok();
          });
          rs.pipe(out, { end: false });
        });
      }
      await waitForFinish(out);
      out = null;
    }

    // Verify size
    if (expectedTotal) {
      const { size } = await fsp.stat(localOutPath);
      if (size !== expectedTotal) {
        await fsp.unlink(localOutPath).catch(() => { });
        return res.status(409).json({ 
          error: "size_mismatch", 
          expected: expectedTotal, 
          got: size 
        });
      }
    }

    // Preserve original file datetime from client file metadata (mtime).
    if (meta.lastModified) {
      const originalDate = new Date(meta.lastModified);
      if (!Number.isNaN(originalDate.getTime())) {
        try {
          await fsp.utimes(localOutPath, originalDate, originalDate);
        } catch (err) {
          console.warn("Failed to apply original file datetime:", err.message);
        }
      }
    }

    // Cleanup temp directory
    try {
      await fsp.unlink(metaPath);
    } catch (err) {
      console.warn(`Failed to delete meta:`, err.message);
    }
    await rmDirRecursiveRetry(dir);

    logger.info("upload.complete", {
      event: "upload.complete",
      requestId: req.requestId,
      uploadId,
      customer: customerSafe,
      project: projectSafe,
      ...(subPathSafe ? { subPath: subPathSafe } : {}),
      bucket: folder,
      outPath: localOutPath,
      filename: finalName,
      size: expectedTotal,
      durationMs: Date.now() - startedAt,
    });

    // NAS-Transfer-Job in Queue einstellen
    const nasDestDir = path.join(OUT_DIR, customerSafe, projectSafe,
      ...(subPathSafe ? [subPathSafe] : []), folder);
    const nasDestPath = path.join(nasDestDir, finalName);
    await nasEnqueue({
      id: crypto.randomUUID(),
      srcPath:  localOutPath,
      destPath: nasDestPath,
      filename: finalName,
      customer: customerSafe,
      project:  projectSafe,
      size:     expectedTotal,
      addedAt:  new Date().toISOString(),
    });

    res.json({
      ok: true,
      absPath: nasDestPath,
      bucket: folder,
      filename: finalName,
      customer: customerSafe,
      project:  projectSafe
    });
  } catch (err) {
    logger.error("Upload complete error", {
      requestId: req.requestId,
      err: err?.message || String(err),
      durationMs: Date.now() - startedAt,
    });
    if (out) {
      try {
        out.destroy();
      } catch {}
    }
    res.status(500).json({ error: "merge_failed", detail: err.message });
  }
});


// ── MOBILE UPLOAD ─────────────────────────────────────────────────────────────
// Gleiche Logik wie /api/upload/complete aber mit "objekt" statt customer/project
// Ziel: MOBILE_OUT_DIR/<objekt>/<YYYY-MM-DD>/<bucket>/<timestamp>_<filename>

const MOBILE_OUT_DIR   = process.env.MOBILE_OUT_DIR   || "/app/uploads_mobile";
const LOCAL_MOBILE_DIR = process.env.LOCAL_MOBILE_DIR || path.join(ROOT, "uploads_local_mobile");

function validateObjekt(objekt) {
  if (!objekt || typeof objekt !== "string") return false;
  const s = objekt.trim().replace(/[^a-zA-Z0-9 _\-äöüÄÖÜ]/g, "").trim().slice(0, 80);
  if (s.length < 1) return false;
  return s.replace(/ /g, "_");
}

app.post("/api/upload/mobile-complete", async (req, res) => {
  let out = null;
  const startedAt = Date.now();
  try {
    const { uploadId, objekt, releaseQueue: doRelease } = req.body || {};

    if (!uploadId || typeof uploadId !== "string")
      return res.status(400).json({ error: "uploadId required" });

    const objektSafe = validateObjekt(objekt);
    if (!objektSafe)
      return res.status(400).json({ error: "Ungültiges oder fehlendes objekt" });

    const dir = path.join(TMP_DIR, uploadId);
    let dirExists = false;
    try { dirExists = (await fsp.stat(dir)).isDirectory(); } catch {}
    if (!dirExists) return res.status(404).json({ error: "uploadId not found" });

    const metaPath = path.join(dir, "meta.json");
    let meta;
    try { meta = JSON.parse(await fsp.readFile(metaPath, "utf8")); }
    catch { return res.status(400).json({ error: "meta missing or invalid" }); }

    const expectedTotal = Number(meta.size || 0);
    if (!expectedTotal || expectedTotal <= 0)
      return res.status(400).json({ error: "Invalid file size in meta" });

    const entries = await fsp.readdir(dir);
    const parts = entries
      .map(n => { const m = /^(\d+)\.part$/.exec(n); return m ? { i: Number(m[1]), path: path.join(dir, n) } : null; })
      .filter(Boolean).sort((a, b) => a.i - b.i);

    if (!parts.length) return res.status(400).json({ error: "no parts uploaded" });

    const missing = assertNoGaps(parts);
    if (missing !== null) return res.status(400).json({ error: "missing parts", missing: [missing] });

    const origName = sanitizeName(meta.filename || `file_${Date.now()}`);
    if (!validateFilename(origName)) return res.status(400).json({ error: "Invalid filename" });

    const ext = (origName.split(".").pop() || "").toLowerCase();
    if (!isAllowedUploadExt(ext))
      return res.status(415).json({ error: "Unsupported file type", allowed: Array.from(ALLOWED_EXT).sort() });

    const folder   = subdirForExt(ext);
    const dateDir  = new Date().toISOString().slice(0, 10);
    const finalName = `${Date.now()}_${origName}`;

    // Lokales Staging auf VPS NVMe (schnell)
    const localStagingPath = path.join(LOCAL_MOBILE_DIR, objektSafe, dateDir, folder);
    await fsp.mkdir(localStagingPath, { recursive: true });
    const localOutPath = path.join(localStagingPath, finalName);
    if (!validatePath(localOutPath, LOCAL_MOBILE_DIR))
      return res.status(400).json({ error: "Invalid output path" });

    if (parts.length === 1) {
      try { await fsp.rename(parts[0].path, localOutPath); }
      catch { await fsp.copyFile(parts[0].path, localOutPath); await fsp.unlink(parts[0].path).catch(() => {}); }
    } else {
      out = fs.createWriteStream(localOutPath, { highWaterMark: 2 * 1024 * 1024 });
      for (const p of parts) {
        await new Promise((ok, fail) => {
          const rs = fs.createReadStream(p.path, { highWaterMark: 2 * 1024 * 1024 });
          rs.on("error", fail);
          rs.on("end", async () => { try { await fsp.unlink(p.path); } catch {} ok(); });
          rs.pipe(out, { end: false });
        });
      }
      await waitForFinish(out); out = null;
    }

    if (expectedTotal) {
      const { size } = await fsp.stat(localOutPath);
      if (size !== expectedTotal) {
        await fsp.unlink(localOutPath).catch(() => {});
        return res.status(409).json({ error: "size_mismatch", expected: expectedTotal, got: size });
      }
    }

    if (meta.lastModified) {
      const d = new Date(meta.lastModified);
      if (!isNaN(d)) await fsp.utimes(localOutPath, d, d).catch(() => {});
    }

    await fsp.unlink(metaPath).catch(() => {});
    await rmDirRecursiveRetry(dir);

    logger.info("mobile_upload.complete", {
      uploadId, objekt: objektSafe, folder,
      filename: finalName, size: expectedTotal,
      durationMs: Date.now() - startedAt,
    });

    // DIREKT_NAS: Datei ist bereits auf der NAS (LOCAL_MOBILE_DIR = MOBILE_OUT_DIR = NAS-Mount)
    const nasDestPath = localOutPath;

    logger.info("mobile_upload.nas_direct", {
      path: nasDestPath, objekt: objektSafe, size: expectedTotal,
    });

    res.json({ ok: true, absPath: nasDestPath, bucket: folder, filename: finalName, objekt: objektSafe });
  } catch (err) {
    logger.error("mobile_upload.error", { err: err?.message || String(err), durationMs: Date.now() - startedAt });
    if (out) { try { out.destroy(); } catch {} }
    res.status(500).json({ error: "merge_failed", detail: err.message });
  }
});
// ── ENDE MOBILE UPLOAD ────────────────────────────────────────────────────────
// NAS Queue Status (intern, kein Auth nötig da nur lokal via Docker-Netz erreichbar)
app.get("/api/nas-queue/status", async (req, res) => {
  try {
    const status = await getQueueStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview thumbnail
app.post("/api/preview_thumb", uploadThumb.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  try {
    // Enforce RAW only
    if (!isRawExt(file.originalname)) {
      await fsp.unlink(file.path).catch(() => { });
      return res.status(422).json({ error: "Preview only available for RAW files" });
    }

    // Partial slice request
    if ((req.get("x-partial") || "").toString() === "1") {
      try {
        const buf = await fsp.readFile(file.path);
        const soiSig = Buffer.from([0xff, 0xd8, 0xff]);
        const soi = buf.indexOf(soiSig);
        if (soi === -1) {
          await fsp.unlink(file.path).catch(() => { });
          return res.status(206).json({ need_more: true, reason: "SOI not found in slice" });
        }
        
        let eoi = -1;
        for (let i = buf.length - 2; i >= Math.max(soi, 0); i--) {
          if (buf[i] === 0xff && buf[i + 1] === 0xd9) {
            eoi = i + 2;
            break;
          }
        }
        if (eoi === -1) {
          await fsp.unlink(file.path).catch(() => { });
          return res.status(206).json({ need_more: true, reason: "EOI not found in slice" });
        }
        
        const carved = buf.slice(soi, eoi);
        const thumb = await toThumbJpeg(carved, THUMBNAIL_SIZE_PX);
        const b64 = thumb.toString("base64");
        await fsp.unlink(file.path).catch(() => { });
        return res.json({ ok: true, data_url: `data:image/jpeg;base64,${b64}` });
      } catch (err) {
        await fsp.unlink(file.path).catch(() => { });
        return res.status(206).json({ need_more: true, reason: "error carving slice" });
      }
    }

    // Full file path
    let imgBuf = await extractEmbeddedPreview(file.path);

    if (!imgBuf) {
      try {
        const tiffBuf = await dcrawToTiffBuffer(file.path);
        imgBuf = tiffBuf;
      } catch (err) {
        await fsp.unlink(file.path).catch(() => { });
        return res.status(422).json({ 
          error: "No preview available (no embedded JPEG, dcraw/dcraw_emu missing/failed)" 
        });
      }
    }

    const thumb = await toThumbJpeg(imgBuf, THUMBNAIL_SIZE_PX);
    const b64 = thumb.toString("base64");
    return res.json({ ok: true, data_url: `data:image/jpeg;base64,${b64}` });
  } catch (err) {
    logger.error("RAW preview error", { requestId: req.requestId, err: err?.message || String(err) });
    return res.status(500).json({ error: "Preview generation failed", detail: err.message });
  } finally {
    if (file?.path) {
      await fsp.unlink(file.path).catch(() => { });
    }
  }
});

// Delete file
app.delete("/api/file", async (req, res) => {
  try {
    const { customer, project, bucket, filename } = req.body || {};
    
    const customerSafe = validateCustomer(customer);
    const projectSafe = validateProject(project);
    const safeFile = validateFilename(filename) ? sanitizeName(filename) : null;
    const safeBucket = sanitizeName(bucket || "");

    if (!customerSafe || !projectSafe || !safeBucket || !safeFile) {
      return res.status(400).json({ error: "Invalid customer, project, bucket, or filename" });
    }

    const abs = path.join(OUT_DIR, customerSafe, projectSafe, safeBucket, safeFile);
    
    if (!validatePath(abs, OUT_DIR)) {
      return res.status(400).json({ error: "Invalid path" });
    }

    await fsp.unlink(abs).catch((e) => {
      if (e.code === "ENOENT") {
        return; // File already deleted
      }
      throw e;
    });

    res.json({ ok: true, deleted: path.relative(OUT_DIR, abs) });
  } catch (err) {
    logger.error("Delete error", { requestId: req.requestId, err: err?.message || String(err) });
    res.status(500).json({ error: "delete_failed", detail: err.message });
  }
});

// Issue report (mail + optional attachments stored on disk)
app.post("/api/report/issue", uploadIssue.array("files", 12), async (req, res) => {
  const reportId = crypto.randomUUID();
  const dateStr = new Date().toISOString().slice(0, 10);
  const reportDir = path.join(REPORTS_DIR, dateStr, reportId);

  const cleanupTmp = async () => {
    const files = Array.isArray(req.files) ? req.files : [];
    await Promise.all(files.map(async (f) => {
      if (f?.path) await fsp.unlink(f.path).catch(() => {});
    }));
  };

  try {
    const name = String(req.body?.name || "").trim().slice(0, 120);
    const description = String(req.body?.description || "").trim().slice(0, 6000);
    const url = String(req.body?.url || "").trim().slice(0, 1000);
    const lang = String(req.body?.lang || "").trim().slice(0, 12);
    const customer = sanitizeName(String(req.body?.customer || "")).slice(0, MAX_CUSTOMER_LENGTH);
    const project = sanitizeName(String(req.body?.project || "")).slice(0, MAX_PROJECT_LENGTH);
    const uploaderName = String(req.body?.uploaderName || "").trim().slice(0, 120);
    const fileErrorsRaw = String(req.body?.fileErrors || "").trim();
    let fileErrors = null;
    try {
      if (fileErrorsRaw) fileErrors = JSON.parse(fileErrorsRaw);
    } catch {
      fileErrors = null;
    }

    if (!name) {
      await cleanupTmp();
      return res.status(400).json({ error: "name required" });
    }
    if (!description) {
      await cleanupTmp();
      return res.status(400).json({ error: "description required" });
    }

    await fsp.mkdir(reportDir, { recursive: true });

    const files = Array.isArray(req.files) ? req.files : [];
    const moved = [];
    let totalBytes = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      totalBytes += Number(f.size || 0);
      const orig = String(f.originalname || `file_${i + 1}`);
      const safe = sanitizeName(orig) || `file_${i + 1}${path.extname(orig) || ""}`;
      const final = `${String(i + 1).padStart(2, "0")}_${safe}`;
      if (!validateFilename(final)) {
        throw new Error("Invalid attachment filename");
      }

      const dest = path.join(reportDir, final);
      await fsp.rename(f.path, dest);
      moved.push({
        name: final,
        original: orig,
        size: Number(f.size || 0),
        mimetype: String(f.mimetype || ""),
      });
    }

    if (totalBytes > MAX_REPORT_TOTAL_BYTES) {
      // remove saved report dir (including moved attachments)
      await rmDirRecursiveRetry(reportDir).catch(() => {});
      return res.status(413).json({ error: "attachments_too_large", maxBytes: MAX_REPORT_TOTAL_BYTES });
    }

    const meta = {
      reportId,
      requestId: req.requestId,
      receivedAt: new Date().toISOString(),
      name,
      description,
      url,
      lang,
      customer: customer || null,
      project: project || null,
      uploaderName: uploaderName || null,
      origin: req.get("origin") || null,
      userAgent: req.get("user-agent") || null,
      ip: req.ip,
      files: moved,
      fileErrors,
    };
    await fsp.writeFile(path.join(reportDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

    logger.info("issue.report", {
      event: "issue.report",
      requestId: req.requestId,
      reportId,
      customer: customer || null,
      project: project || null,
      fileCount: moved.length,
      totalBytes,
    });

    // Send mail (fixed recipient as requested)
    let mailed = false;
    try {
      const transporter = getSmtpTransporter();
      const lines = [
        "Neue Fehlermeldung aus Upload-Tool",
        "",
        `Report-ID: ${reportId}`,
        `Zeit: ${meta.receivedAt}`,
        `Name: ${name}`,
        `Uploader-Name: ${uploaderName || "-"}`,
        `Kunde: ${customer || "-"}`,
        `Projekt: ${project || "-"}`,
        `URL: ${url || "-"}`,
        `Sprache: ${lang || "-"}`,
        `IP: ${meta.ip || "-"}`,
        `User-Agent: ${meta.userAgent || "-"}`,
        "",
        "Beschreibung:",
        description,
        "",
        `Anhaenge gespeichert unter: ${path.relative(ROOT, reportDir)}`,
        moved.length ? "Dateien:" : "Dateien: -",
        ...moved.map((f) => `- ${f.name} (${f.size} bytes, ${f.mimetype || "unknown"})`),
      ];

      try {
        const repKey = utKeyFor("office@propus.ch", `Fehler melden: ${name} (${dateStr})`, lines.join("\n"));
        if (!utShouldSend(repKey)) {
          logger.info("Dedup prevented issue report mail duplicate", { reportId, to: "office@propus.ch", subject: `Fehler melden: ${name} (${dateStr})` });
        } else {
          mailed = await sendMailWithFallback({
            to: "office@propus.ch",
            subject: `Fehler melden: ${name} (${dateStr})`,
            text: lines.join("\n"),
            html: lines.join("<br>")
          });
        }
      } catch (e) {
        logger.error("Dedup/send error for issue report mail", { err: e?.message || String(e) });
      }
    } catch (err) {
      logger.error("Issue report mail failed", { requestId: req.requestId, reportId, err: err?.message || String(err) });
      mailed = false;
    }

    return res.json({ ok: true, reportId, mailed });
  } catch (err) {
    logger.error("Issue report failed", { requestId: req.requestId, reportId, err: err?.message || String(err) });
    await cleanupTmp().catch(() => {});
    return res.status(500).json({ error: "issue_report_failed", detail: err.message });
  }
});

// Notify all uploaded (mail)
app.post("/api/notify/all-uploaded", async (req, res) => {
  try {
    const { customer, project, count, files, senderName, comment } = req.body || {};
    const customerSafe = validateCustomer(customer);
    const projectSafe = validateProject(project);
    const n = Number(count || 0);
    
    if (!customerSafe || !projectSafe || !n || n <= 0) {
      return res.status(400).json({ error: "Invalid customer, project, or count" });
    }
    
    const safeFiles = Array.isArray(files) ? files.map((f) => sanitizeName(String(f || ""))).filter(Boolean) : [];
    const safeSenderName = String(senderName || "").trim().slice(0, 120);
    const safeComment = String(comment || "").trim().slice(0, 2000);

    // Kommentar als TXT auf NAS speichern
    if (safeComment) {
      try {
        const now = new Date();
        const dateStr = now.toLocaleString("de-CH", { timeZone: "Europe/Zurich", hour12: false })
          .replace(/[/:]/g, "-").replace(/,/g, "").replace(/\s+/g, "_");
        const commentDir = path.join(OUT_DIR, customerSafe, projectSafe);
        await fsp.mkdir(commentDir, { recursive: true });
        const commentFile = path.join(commentDir, `Kommentar_${dateStr}.txt`);
        const commentContent = [
          `Datum:     ${now.toLocaleString("de-CH", { timeZone: "Europe/Zurich", hour12: false })}`,
          `Absender:  ${safeSenderName || "Unbekannt"}`,
          `Kunde:     ${customerSafe}`,
          `Projekt:   ${projectSafe}`,
          `Dateien:   ${n}`,
          ``,
          `Kommentar:`,
          safeComment
        ].join("\n");
        await fsp.writeFile(commentFile, commentContent, "utf8");
        logger.info("comment.saved", { file: commentFile, customer: customerSafe, project: projectSafe });
      } catch (err) {
        logger.warn("comment.save_failed", { err: err.message });
      }
    }

    // NAS-Transfer-Queue freigeben
    ensureQueueReleased("notify_all_uploaded");
    logger.info("nas_queue.triggered_by_notify", { customer: customerSafe, project: projectSafe, count: n });

    await sendUploadMail({
      customer: customerSafe,
      project: projectSafe,
      count: n,
      files: safeFiles,
      senderName: safeSenderName,
      comment: safeComment
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error("Mail notify error", { requestId: req.requestId, err: err?.message || String(err) });
    res.status(500).json({ error: "notify_failed", detail: err.message });
  }
});

app.post("/api/nas-queue/release", async (req, res) => {
  try {
    const { reason } = req.body || {};
    const released = ensureQueueReleased(String(reason || "api_release").slice(0, 120) || "api_release");
    const status = await getQueueStatus();
    res.json({ ok: true, released, status });
  } catch (err) {
    logger.error("NAS queue manual release failed", { requestId: req.requestId, err: err?.message || String(err) });
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    version: "1.1.4"
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error", {
    requestId: req?.requestId,
    method: req?.method,
    url: req?.originalUrl || req?.url,
    err: err?.message || String(err),
    stack: err?.stack,
  });
  res.status(err.status || 500).json({ 
    error: err.message || "Internal server error" 
  });
});

// Start server
app.listen(PORT, () => {
  logger.info("Uploader API listening", { port: PORT, env: NODE_ENV, TMP_DIR, OUT_DIR, LOG_DIR });
  logger.info("Mail notify configured", { configured: !!(SMTP_HOST && SMTP_USER && SMTP_PASS) });

  // Initialize NAS transfer queue (async, non-blocking)
  initNasQueue(logger, sendMailWithFallback);
  nasResumeOnStartup()
    .then(() => logger.info("NAS transfer queue initialized"))
    .catch((err) => logger.error("NAS queue resume failed", { err: err.message }));
});

