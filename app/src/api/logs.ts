import { API_BASE } from "./client";

export type FrontendLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export type FrontendLogPayload = {
  level: FrontendLogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp?: string;
  url?: string;
  userAgent?: string;
};

function normalizeContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export async function postFrontendLog(payload: FrontendLogPayload): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        context: normalizeContext(payload.context),
      }),
      // keepalive helps send logs on page unload/navigation.
      keepalive: true,
    });
  } catch {
    // Logging must never break app behavior.
  }
}
