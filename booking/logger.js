const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const winston = require("winston");

const isProduction = process.env.NODE_ENV === "production";
const wantsFileLogging = parseBoolean(process.env.LOG_FILE_ENABLED, isProduction);
const wantsConsoleLogging = parseBoolean(process.env.LOG_CONSOLE_ENABLED, !isProduction);
const retentionDays = normalizeRetentionDays(process.env.LOG_RETENTION_DAYS);
const logDir = process.env.LOG_DIR || path.join(__dirname, "logs");

function parseBoolean(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  return value === true || String(value).toLowerCase() === "true" || String(value) === "1";
}

function normalizeRetentionDays(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 30;
  return Math.floor(parsed);
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanupOldLogs(dirPath, maxAgeDays) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".log")) continue;
      const fullPath = path.join(dirPath, entry.name);
      const stats = fs.statSync(fullPath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (_err) {
    // Ignore cleanup failures
  }
}

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, module: mod, ...meta }) => {
    const modStr = mod ? `[${mod}] ` : "";
    const metaKeys = Object.keys(meta).filter(
      (k) => k !== "service" && k !== "splat"
    );
    const metaStr = metaKeys.length ? " " + JSON.stringify(
      Object.fromEntries(metaKeys.map((k) => [k, meta[k]]))
    ) : "";
    return `${timestamp} ${level}: ${modStr}${message}${metaStr}`;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  // Redact sensitive fields
  winston.format((info) => {
    if (info.password) info.password = "[Redacted]";
    if (info.token) info.token = "[Redacted]";
    if (info.secret) info.secret = "[Redacted]";
    return info;
  })(),
  winston.format.json()
);

const transports = [];

if (wantsConsoleLogging || !isProduction) {
  transports.push(
    new winston.transports.Console({
      format: isProduction ? jsonFormat : consoleFormat,
      level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
    })
  );
}

if (wantsFileLogging) {
  ensureDirectory(logDir);
  cleanupOldLogs(logDir, retentionDays);
  transports.push(
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      format: jsonFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, "backend.log"),
      format: jsonFormat,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 10,
    })
  );
}

// Fallback: always have at least console transport
if (transports.length === 0) {
  transports.push(
    new winston.transports.Console({
      format: isProduction ? jsonFormat : consoleFormat,
    })
  );
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? "info" : "debug"),
  defaultMeta: { service: "buchungstool-backend" },
  transports,
  exitOnError: false,
});

/**
 * createModuleConsole – Drop-in replacement for console.log/warn/error
 * scoped to a named module. Parses "[ModuleName] message" format.
 */
function createModuleConsole(targetLogger) {
  const log = targetLogger || logger;
  function write(level, args) {
    if (!args.length) return log[level]("");
    const [first, ...rest] = args;
    if (typeof first !== "string") {
      log[level](first, ...rest);
      return;
    }
    const match = first.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!match) {
      log[level](first, ...rest);
      return;
    }
    const moduleName = match[1];
    const message = match[2] || first;
    const extra = rest.length === 1 && typeof rest[0] === "object" ? rest[0] : {};
    log[level](message, { module: moduleName, ...extra });
  }
  return {
    log: (...args) => write("info", args),
    warn: (...args) => write("warn", args),
    error: (...args) => write("error", args),
  };
}

/**
 * httpLoggerOptions – Express HTTP request logging middleware (Winston).
 * Used in booking/server.js as: app.use(logger.httpLoggerOptions.middleware)
 */
const httpLoggerOptions = {
  // Kept for API compatibility – booking/server.js destructures this
  logger,
  middleware: function winstonHttpMiddleware(req, res, next) {
    const start = Date.now();
    const reqId =
      req.headers["x-request-id"] ||
      randomUUID();
    res.setHeader("x-request-id", reqId);

    res.on("finish", () => {
      const ms = Date.now() - start;
      const isHealthCheck =
        req.url === "/api/health" || (req.url || "").startsWith("/api/health?");
      if (isHealthCheck) return;

      const level =
        res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger[level](`${req.method} ${req.url} ${res.statusCode} ${ms}ms`, {
        module: "http",
        method: req.method,
        url: req.url,
        path: req.path,
        status: res.statusCode,
        ms,
        reqId,
        ip: req.ip,
      });
    });
    next();
  },
};

module.exports = logger;
module.exports.createModuleConsole = createModuleConsole;
module.exports.httpLoggerOptions = httpLoggerOptions;
