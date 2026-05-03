/**
 * core/lib/safe-fetch.js
 *
 * Globaler Fetch-Wrapper mit Timeout, strukturierten Fehlern und
 * konsistenter Error-Klassifizierung (Timeout vs. Network vs. HTTP).
 *
 * Hintergrund (Bug-Hunt T07/T09): mehrere Stellen in tours/booking rufen
 * `fetch(...)` ohne `AbortSignal.timeout`. Bei haengendem Backend bleibt
 * der gesamte Worker blockiert. Dieser Helper erzwingt einen Timeout und
 * liefert eine vorhersehbare Fehler-Form, sodass Aufrufer ohne eigenes
 * try/catch sicher sind.
 *
 * @example
 *   const { ok, status, data, error } = await safeFetch(url, { timeoutMs: 5000 });
 *   if (!ok) console.warn('fetch failed:', error);
 */

"use strict";

const DEFAULT_TIMEOUT_MS = 10_000;
// AbortSignal.timeout wirft RangeError bei Werten ueber ~24 Tage.
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function clampTimeout(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  if (n > MAX_TIMEOUT_MS) return MAX_TIMEOUT_MS;
  return n;
}

/**
 * Wrapper um globales fetch.
 *
 * @param {string|URL} url
 * @param {object} [options]
 * @param {number} [options.timeoutMs=10000]   - Hard-Timeout in ms.
 * @param {string} [options.method='GET']
 * @param {object} [options.headers]
 * @param {*}      [options.body]
 * @param {AbortSignal} [options.signal]       - Externes Signal (zusaetzlich zum Timeout).
 * @param {'json'|'text'|'arraybuffer'|'none'} [options.responseType='json']
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   status: number,
 *   statusText: string,
 *   data: any | null,
 *   error: string | null,
 *   timedOut: boolean,
 *   networkError: boolean,
 * }>}
 */
async function safeFetch(url, options = {}) {
  const {
    timeoutMs,
    method = 'GET',
    headers = {},
    body,
    signal: externalSignal,
    responseType = 'json',
  } = options;

  const timeout = clampTimeout(timeoutMs);
  const timeoutSignal = AbortSignal.timeout(timeout);
  // Wenn externes Signal mitgegeben wurde, kombinieren (Node 18+).
  let signal;
  if (externalSignal) {
    if (typeof AbortSignal.any === 'function') {
      signal = AbortSignal.any([timeoutSignal, externalSignal]);
    } else {
      // Node < 20: AbortSignal.any nicht verfuegbar -> Timeout greift, externes
      // Signal wird ignoriert. Debug-loggen damit das in CI/Logs sichtbar ist.
      // eslint-disable-next-line no-console
      (console.debug || console.log).call(
        console,
        '[safeFetch] AbortSignal.any nicht verfuegbar, externes Signal wird ignoriert',
      );
      signal = timeoutSignal;
    }
  } else {
    signal = timeoutSignal;
  }

  let response;
  try {
    response = await fetch(url, { method, headers, body, signal });
  } catch (err) {
    const name = err && err.name;
    // Unterscheide Timeout vs. externer User-Abort:
    //   - timeoutSignal.aborted === true  -> echter Timeout (504-Klassifizierung)
    //   - externes Signal aborted         -> Caller-Cancel (kein Timeout, kein Network-Error)
    //   - TimeoutError                    -> immer Timeout
    const isTimeoutError = name === 'TimeoutError';
    const timeoutFired = isTimeoutError || (timeoutSignal && timeoutSignal.aborted);
    const externallyAborted = name === 'AbortError' && !timeoutFired;
    return {
      ok: false,
      status: 0,
      statusText: '',
      data: null,
      error: timeoutFired
        ? `timeout after ${timeout}ms`
        : externallyAborted
          ? 'aborted'
          : (err && err.message) || String(err),
      timedOut: !!timeoutFired,
      aborted: !!externallyAborted,
      networkError: !timeoutFired && !externallyAborted,
    };
  }

  let data = null;
  if (responseType !== 'none') {
    try {
      if (responseType === 'json') {
        data = await response.json();
      } else if (responseType === 'text') {
        data = await response.text();
      } else if (responseType === 'arraybuffer') {
        data = await response.arrayBuffer();
      }
    } catch (err) {
      // Sonderfall: das `timeoutSignal` laeuft nach fetch()-Return weiter und
      // kann waehrend response.json()/.text() feuern (grosser Body). Solche
      // Faelle sind echte Timeouts, keine Body-Parse-Fehler.
      const name = err && err.name;
      const isAbortLike = name === 'TimeoutError' || name === 'AbortError';
      if (isAbortLike && timeoutSignal && timeoutSignal.aborted) {
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
          error: 'aborted',
          timedOut: false,
          aborted: true,
          networkError: false,
        };
      }
      // Echter Body-Parse-Fehler (z.B. invalid JSON): Status bleibt erhalten.
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        data: null,
        error: `body_parse_failed: ${(err && err.message) || String(err)}`,
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

module.exports = {
  safeFetch,
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
};
