/**
 * Globaler Fetch-Wrapper mit Timeout und strukturierten Fehlern für die
 * Next-App. Spiegelt das Verhalten von `core/lib/safe-fetch.js`, aber mit
 * TypeScript-Typen.
 *
 * Siehe Bug-Hunt T07/T09: mehrere `fetch(...)`-Stellen ohne Timeout
 * blockieren bei haengendem Backend ganze Worker. Dieser Wrapper erzwingt
 * einen Hard-Timeout und liefert eine vorhersehbare Antwort-Form.
 */

const DEFAULT_TIMEOUT_MS = 10_000;
// AbortSignal.timeout wirft RangeError bei Werten > ~24 Tage.
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function clampTimeout(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  if (n > MAX_TIMEOUT_MS) return MAX_TIMEOUT_MS;
  return n;
}

export type SafeFetchResponseType = "json" | "text" | "arraybuffer" | "none";

export interface SafeFetchOptions {
  timeoutMs?: number;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  signal?: AbortSignal;
  responseType?: SafeFetchResponseType;
  cache?: RequestCache;
  redirect?: RequestRedirect;
}

export interface SafeFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  data: T | null;
  error: string | null;
  timedOut: boolean;
  networkError: boolean;
}

export async function safeFetch<T = unknown>(
  url: string | URL,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult<T>> {
  const {
    timeoutMs,
    method = "GET",
    headers,
    body,
    signal: externalSignal,
    responseType = "json",
    cache,
    redirect,
  } = options;

  const timeout = clampTimeout(timeoutMs);
  const timeoutSignal = AbortSignal.timeout(timeout);
  const signal: AbortSignal =
    externalSignal && typeof (AbortSignal as unknown as { any?: unknown }).any === "function"
      ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
          timeoutSignal,
          externalSignal,
        ])
      : timeoutSignal;

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal, cache, redirect });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const timedOut = name === "TimeoutError" || name === "AbortError";
    return {
      ok: false,
      status: 0,
      statusText: "",
      data: null,
      error: timedOut
        ? `timeout after ${timeout}ms`
        : err instanceof Error
          ? err.message
          : String(err),
      timedOut,
      networkError: !timedOut,
    };
  }

  let data: T | null = null;
  if (responseType !== "none") {
    try {
      if (responseType === "json") {
        data = (await response.json()) as T;
      } else if (responseType === "text") {
        data = (await response.text()) as unknown as T;
      } else if (responseType === "arraybuffer") {
        data = (await response.arrayBuffer()) as unknown as T;
      }
    } catch (err) {
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: null,
        error: `body_parse_failed: ${err instanceof Error ? err.message : String(err)}`,
        timedOut: false,
        networkError: false,
      };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    data,
    error: response.ok ? null : `http_${response.status}`,
    timedOut: false,
    networkError: false,
  };
}

export { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
