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
  aborted: boolean;
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
  const hasAbortSignalAny =
    typeof (AbortSignal as unknown as { any?: unknown }).any === "function";
  let signal: AbortSignal;
  if (externalSignal) {
    if (hasAbortSignalAny) {
      signal = (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([
        timeoutSignal,
        externalSignal,
      ]);
    } else {
      // Node < 20 / Browser-Fallback: AbortSignal.any unverfuegbar -> Timeout
      // greift, externes Signal wird ignoriert. Debug-Log damit das nicht
      // stillschweigend passiert.
      // eslint-disable-next-line no-console
      (console.debug ?? console.log).call(
        console,
        "[safeFetch] AbortSignal.any nicht verfuegbar, externes Signal wird ignoriert",
      );
      signal = timeoutSignal;
    }
  } else {
    signal = timeoutSignal;
  }

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal, cache, redirect });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const isTimeoutError = name === "TimeoutError";
    const timeoutFired = isTimeoutError || timeoutSignal.aborted;
    const externallyAborted = name === "AbortError" && !timeoutFired;
    return {
      ok: false,
      status: 0,
      statusText: "",
      data: null,
      error: timeoutFired
        ? `timeout after ${timeout}ms`
        : externallyAborted
          ? "aborted"
          : err instanceof Error
            ? err.message
            : String(err),
      timedOut: timeoutFired,
      aborted: externallyAborted,
      networkError: !timeoutFired && !externallyAborted,
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
      // Timeout/Abort kann auch waehrend des Body-Parsings feuern (grosser Body).
      const name = err instanceof Error ? err.name : "";
      const isAbortLike = name === "TimeoutError" || name === "AbortError";
      if (isAbortLike && timeoutSignal.aborted) {
        return {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          data: null,
          error: `timeout after ${timeout}ms`,
          timedOut: true,
          aborted: false,
          networkError: false,
        };
      }
      if (isAbortLike) {
        return {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          data: null,
          error: "aborted",
          timedOut: false,
          aborted: true,
          networkError: false,
        };
      }
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: null,
        error: `body_parse_failed: ${err instanceof Error ? err.message : String(err)}`,
        timedOut: false,
        aborted: false,
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
    aborted: false,
    networkError: false,
  };
}

export { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS };
