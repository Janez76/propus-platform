export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ParsedApiErrorPayload = {
  error?: string;
  message?: string;
  code?: string;
  canOverride?: boolean;
  hint?: string;
  slot?: string;
  date?: string;
};

function detectApiBase() {
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    // In Produktion/staging immer relativen API-Pfad verwenden.
    // So verhindert man fehlerhafte, eingebettete VITE_API_BASE-Werte im Build.
    if (!isLocalhost) return "";

    if (process.env.NEXT_PUBLIC_API_BASE !== undefined && process.env.NEXT_PUBLIC_API_BASE !== "") {
      return String(process.env.NEXT_PUBLIC_API_BASE);
    }

    // In der Entwicklung: relativer Pfad nutzen, damit Next.js /api und /auth ans Backend proxied.
    if (process.env.NODE_ENV === "development") return ""; 
    // SPA wird vom Backend selbst ausgeliefert → immer relativer Pfad
    // (gilt für Port 3100 = propus-platform Docker, 8090/8091/8092 = alte Nginx-Setups)
    if (["3100", "3200", "8090", "8091", "8092"].includes(url.port)) return "";
    return "";
  }

  if (process.env.NEXT_PUBLIC_API_BASE !== undefined && process.env.NEXT_PUBLIC_API_BASE !== "") {
    return String(process.env.NEXT_PUBLIC_API_BASE);
  }

  return "";
}

export const API_BASE = detectApiBase();

/** Adress-Autocomplete: EINZIGE Stelle – nur Google (Backend /api/address-suggest) */
export const ADDRESS_AUTOCOMPLETE_ENDPOINT = "/api/address-suggest";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;
const pendingRequests = new Map<string, Promise<unknown>>();

function humanizeApiError(raw: string, status: number, path: string) {
  const text = String(raw || "").trim();
  const lower = text.toLowerCase();
  const normalizedPath = String(path || "").toLowerCase();

  if (status === 404 && normalizedPath.includes("/api/admin/pricing/preview")) {
    return "Pricing-Preview API nicht verfügbar. Bitte Backend neu starten.";
  }
  if (!text) return `HTTP ${status}`;
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      const errorText = String(parsed?.error || "").trim();
      const messageText = String(parsed?.message || "").trim();
      const combined = [errorText, messageText].filter(Boolean).join(": ");
      if (combined) {
        if (combined.toLowerCase().includes("no database connection")) {
          return "Datenbank nicht verbunden. Lesen ist möglich, Speichern benötigt eine aktive DB-Verbindung.";
        }
        return combined;
      }
    } catch (_) {}
  }
  if (lower.includes("cannot post /api/admin/pricing/preview")) {
    return "Pricing-Preview API nicht verfügbar. Bitte Backend neu starten.";
  }
  if (lower.startsWith("<!doctype") || lower.startsWith("<html")) {
    return `API-Fehler (HTTP ${status}). Server antwortet mit HTML statt JSON. Mögliche Ursachen: Backend läuft nicht, falsche API-URL (z. B. VITE_API_BASE), oder die Anfrage trifft den Frontend-Server statt das Backend (Proxy/Deployment prüfen).`;
  }
  return text;
}

function parseApiErrorPayload(raw: string): ParsedApiErrorPayload | null {
  const text = String(raw || "").trim();
  if (!text || !(text.startsWith("{") && text.endsWith("}"))) return null;
  try {
    const parsed = JSON.parse(text) as ParsedApiErrorPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

class ApiHttpError extends Error {
  status: number;
  path: string;
  responseText: string;
  payload: ParsedApiErrorPayload | null;

  constructor(status: number, path: string, responseText: string) {
    super(humanizeApiError(responseText, status, path));
    this.name = "ApiHttpError";
    this.status = status;
    this.path = path;
    this.responseText = responseText;
    this.payload = parseApiErrorPayload(responseText);
  }
}

type ApiRequestOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  dedupe?: boolean;
};

function makeRequestKey(path: string, method: HttpMethod, token?: string, body?: unknown) {
  const tokenPart = token ? "auth" : "anon";
  const bodyPart = body === undefined ? "" : JSON.stringify(body);
  return `${method}:${path}:${tokenPart}:${bodyPart}`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shouldRetry(error: unknown) {
  if (error instanceof ApiHttpError) return error.status >= 500 || error.status === 429;
  // Fetch throws TypeError for network failures in browsers.
  return error instanceof TypeError || error instanceof DOMException;
}

async function fetchJson<T>(
  path: string,
  method: HttpMethod,
  token?: string,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const bodyText = await res.text();
      throw new ApiHttpError(res.status, path, bodyText);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("API-Request Timeout. Bitte erneut versuchen.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function apiRequest<T>(
  path: string,
  method: HttpMethod = "GET",
  token?: string,
  body?: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  if (typeof window !== "undefined" && !window.navigator.onLine) {
    throw new Error("Keine Internetverbindung. Bitte Verbindung prüfen.");
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const dedupe = options?.dedupe ?? method === "GET";
  const requestKey = dedupe ? makeRequestKey(path, method, token, body) : "";

  if (dedupe && pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey) as Promise<T>;
  }

  const run = (async () => {
    let attempt = 0;
    while (true) {
      try {
        return await fetchJson<T>(path, method, token, body, timeoutMs);
      } catch (error) {
        if (attempt >= maxRetries || !shouldRetry(error)) {
          if (error instanceof ApiHttpError) {
            const enriched = new Error(error.message) as Error & {
              status?: number;
              code?: string;
              canOverride?: boolean;
              hint?: string;
              slot?: string;
              date?: string;
            };
            enriched.status = error.status;
            if (error.payload) {
              if (typeof error.payload.code === "string") enriched.code = error.payload.code;
              if (typeof error.payload.canOverride === "boolean") enriched.canOverride = error.payload.canOverride;
              if (typeof error.payload.hint === "string") enriched.hint = error.payload.hint;
              if (typeof error.payload.slot === "string") enriched.slot = error.payload.slot;
              if (typeof error.payload.date === "string") enriched.date = error.payload.date;
            }
            throw enriched;
          }
          if (error instanceof Error) throw error;
          const fallbackMsg =
            error != null && typeof error === "object" && "message" in error
              ? String((error as { message?: unknown }).message).trim()
              : typeof error === "string"
                ? error.trim()
                : "";
          throw new Error(fallbackMsg || "Unbekannter API-Fehler");
        }
        attempt += 1;
        const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
        await sleep(delay);
      }
    }
  })();

  if (!dedupe) return run;
  pendingRequests.set(requestKey, run);
  try {
    return await run;
  } finally {
    pendingRequests.delete(requestKey);
  }
}
