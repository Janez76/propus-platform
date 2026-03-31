import { postFrontendLog, type FrontendLogLevel } from "../api/logs";

type LogContext = Record<string, unknown> | undefined;

const isDev = process.env.NODE_ENV === "development";
const logLevel = (process.env.NEXT_PUBLIC_LOG_LEVEL || (isDev ? "debug" : "info")) as FrontendLogLevel;
const remoteLogLevel = (process.env.NEXT_PUBLIC_LOG_REMOTE_LEVEL || "warn") as FrontendLogLevel;
const remoteEnabled = !isDev || String(process.env.NEXT_PUBLIC_LOG_REMOTE || "false") === "true";

const levelRank: Record<FrontendLogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

function shouldLogToConsole(level: FrontendLogLevel): boolean {
  return levelRank[level] >= levelRank[logLevel];
}

function safeContext(input: unknown): LogContext {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  return input as Record<string, unknown>;
}

function sendRemote(level: FrontendLogLevel, message: string, context?: LogContext) {
  if (!remoteEnabled || levelRank[level] < levelRank[remoteLogLevel]) return;
  void postFrontendLog({
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
    url: typeof window !== "undefined" ? window.location.href : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  });
}

function formatPayload(context?: LogContext, message?: string): string {
  if (!context || Object.keys(context).length === 0) return message || "";
  return message ? `${message} ${JSON.stringify(context)}` : JSON.stringify(context);
}

function log(level: FrontendLogLevel, message: string, context?: unknown) {
  const normalizedContext = safeContext(context);
  sendRemote(level, message, normalizedContext);
  if (typeof console === "undefined" || !shouldLogToConsole(level)) return;
  const payload = formatPayload(normalizedContext, message);
  switch (level) {
    case "trace":
    case "debug":
      console.debug(payload);
      break;
    case "info":
      console.info(payload);
      break;
    case "warn":
      console.warn(payload);
      break;
    case "error":
    case "fatal":
      console.error(payload);
      break;
    default:
      console.log(payload);
  }
}

export const logger = {
  trace(message: string, context?: unknown) {
    log("trace", message, context);
  },
  debug(message: string, context?: unknown) {
    log("debug", message, context);
  },
  info(message: string, context?: unknown) {
    log("info", message, context);
  },
  warn(message: string, context?: unknown) {
    log("warn", message, context);
  },
  error(message: string, context?: unknown) {
    log("error", message, context);
  },
  fatal(message: string, context?: unknown) {
    log("fatal", message, context);
  },
};

declare global {
  interface Window {
    __buchungstoolGlobalLogHandlersInstalled?: boolean;
    __buchungstoolLogger?: typeof logger;
  }
}

export function exposeLoggerOnWindow() {
  if (typeof window === "undefined") return;
  window.__buchungstoolLogger = logger;
}

export function setupGlobalErrorLogging() {
  if (typeof window === "undefined") return;
  if (window.__buchungstoolGlobalLogHandlersInstalled) return;
  window.__buchungstoolGlobalLogHandlersInstalled = true;

  window.addEventListener("error", (event) => {
    logger.error("Unhandled window error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    logger.error("Unhandled promise rejection", {
      reason:
        reason instanceof Error
          ? { message: reason.message, stack: reason.stack }
          : String(reason),
    });
  });
}
