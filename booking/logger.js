const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const pino = require("pino");

const isProduction = process.env.NODE_ENV === "production";
const wantsPretty = parseBoolean(process.env.LOG_PRETTY, !isProduction);
const wantsRedaction = parseBoolean(process.env.LOG_REDACT, true);
const wantsFileLogging = parseBoolean(process.env.LOG_FILE_ENABLED, isProduction);
const wantsRotation = parseBoolean(process.env.LOG_FILE_ROTATE, true);
const wantsConsoleLogging = parseBoolean(process.env.LOG_CONSOLE_ENABLED, !isProduction);
const retentionDays = normalizeRetentionDays(process.env.LOG_RETENTION_DAYS);
const logDir = process.env.LOG_DIR || path.join(__dirname, "logs");
const logFilePath = process.env.LOG_FILE_PATH || path.join(logDir, "backend.log");

const loggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  base: { service: "buchungstool-backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    }
  }
};

if (wantsRedaction) {
  loggerOptions.redact = {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-api-key",
      "res.headers.set-cookie",
      "*.password",
      "*.token",
      "*.secret"
    ],
    censor: "[Redacted]"
  };
}

const streams = buildStreams();
const logger = streams.length ? pino(loggerOptions, pino.multistream(streams)) : pino(loggerOptions);

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
    // Ignore cleanup failures so logging itself stays available.
  }
}

function buildStreams() {
  const streamList = [];

  if (wantsConsoleLogging) {
    if (wantsPretty) {
      try {
        const pinoPretty = require("pino-pretty");
        streamList.push({
          stream: pinoPretty({
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname"
          })
        });
      } catch {
        streamList.push({ stream: process.stdout });
      }
    } else {
      streamList.push({ stream: process.stdout });
    }
  }

  if (wantsFileLogging) {
    ensureDirectory(logDir);
    cleanupOldLogs(logDir, retentionDays);
    // Keep runtime stable on recent Node versions by using direct file streams.
    // Rotation stays configurable externally (or via log shipping) if needed.
    streamList.push({
      stream: pino.destination({
        dest: logFilePath,
        mkdir: true,
        sync: false
      })
    });
  }

  if (wantsRotation && !process.env.LOG_ROTATION_FREQUENCY) {
    // no-op: variable is accepted for compatibility with previous setup.
  }

  return streamList;
}

function createModuleConsole(targetLogger = logger) {
  function write(level, args) {
    if (!args.length) return targetLogger[level]("");
    const [first, ...rest] = args;
    if (typeof first !== "string") {
      targetLogger[level](first, ...rest);
      return;
    }

    const match = first.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (!match) {
      targetLogger[level](first, ...rest);
      return;
    }

    const moduleName = match[1];
    const message = match[2] || first;
    targetLogger[level]({ module: moduleName }, message, ...rest);
  }

  return {
    log: (...args) => write("info", args),
    warn: (...args) => write("warn", args),
    error: (...args) => write("error", args)
  };
}

const httpLoggerOptions = {
  logger,
  quietReqLogger: true,
  autoLogging: {
    ignore(req) {
      return req.url === "/api/health" || req.url.startsWith("/api/health?");
    }
  },
  genReqId(req, res) {
    const incoming = req.headers["x-request-id"];
    const requestId =
      typeof incoming === "string" && incoming.trim()
        ? incoming.trim()
        : randomUUID();
    res.setHeader("x-request-id", requestId);
    return requestId;
  },
  customProps(req) {
    return { module: "http", path: req.path };
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  }
};

module.exports = logger;
module.exports.createModuleConsole = createModuleConsole;
module.exports.httpLoggerOptions = httpLoggerOptions;
