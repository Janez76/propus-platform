import winston from "winston";
import path from "path";
import fs from "fs";

const isDev = process.env.NODE_ENV !== "production";

const redactFields = winston.format((info) => {
  if (info.password) info.password = "[REDACTED]";
  if (info.token) info.token = "[REDACTED]";
  if (info.secret) info.secret = "[REDACTED]";
  return info;
});

const consoleFormat = winston.format.combine(
  redactFields(),
  winston.format.colorize(),
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const { service: _s, ...rest } = meta;
    const metaStr = Object.keys(rest).length ? " " + JSON.stringify(rest) : "";
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

const jsonFormat = winston.format.combine(
  redactFields(),
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isDev ? consoleFormat : jsonFormat,
    level: isDev ? "debug" : "info",
  }),
];

if (!isDev) {
  const logDir = process.env.LOG_DIR || "/app/logs";
  try {
    fs.mkdirSync(logDir, { recursive: true });
    transports.push(
      new winston.transports.File({
        filename: path.join(logDir, "error.log"),
        level: "error",
        format: jsonFormat,
        maxsize: 10 * 1024 * 1024,
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logDir, "combined.log"),
        format: jsonFormat,
        maxsize: 20 * 1024 * 1024,
        maxFiles: 10,
      }),
    );
  } catch {
    /* log dir not accessible, file logging disabled */
  }
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  defaultMeta: { service: "propus-nextjs" },
  transports,
  exitOnError: false,
});

/** Express/Next.js HTTP request logging middleware */
export function httpLogger() {
  return (
    req: { method: string; url: string; ip?: string },
    res: { statusCode: number; on: (event: string, cb: () => void) => void },
    next: () => void,
  ) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      logger.log(level, `${req.method} ${req.url} ${res.statusCode} ${ms}ms`, {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        ms,
        ip: req.ip,
      });
    });
    next();
  };
}

export default logger;
