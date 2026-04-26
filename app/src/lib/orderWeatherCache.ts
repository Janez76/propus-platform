/**
 * Per-Order Wetter-Cache in localStorage.
 * Forecast-Werte sind 3 h gültig, Archive-Werte 30 Tage (sind ja effektiv gemessen).
 * Schlüssel rastert lat/lng auf 3 Nachkommastellen (~110 m), damit nahe Adressen
 * im selben Auftragsbündel den Cache teilen.
 */

import type { OrderWeather } from "../api/weatherProvider";

const PREFIX = "propus.weather.v1.";
const TTL_FORECAST_MS = 3 * 60 * 60 * 1000;
const TTL_ARCHIVE_MS = 30 * 24 * 60 * 60 * 1000;

type StoredEntry = { v: OrderWeather; ts: number };

function safeWindow(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function gridKey(lat: number, lng: number, date: string): string {
  const r = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3);
  return `${PREFIX}${r(lat)},${r(lng)}@${date}`;
}

function ttlFor(source: OrderWeather["source"]): number {
  return source === "archive" ? TTL_ARCHIVE_MS : TTL_FORECAST_MS;
}

export function loadOrderWeather(
  lat: number,
  lng: number,
  date: string,
): OrderWeather | null {
  const ls = safeWindow();
  if (!ls) return null;
  const raw = ls.getItem(gridKey(lat, lng, date));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredEntry;
    if (!parsed || typeof parsed.ts !== "number" || !parsed.v) return null;
    if (Date.now() - parsed.ts > ttlFor(parsed.v.source)) return null;
    return parsed.v;
  } catch {
    return null;
  }
}

export function saveOrderWeather(
  lat: number,
  lng: number,
  date: string,
  v: OrderWeather,
): void {
  const ls = safeWindow();
  if (!ls) return;
  try {
    ls.setItem(gridKey(lat, lng, date), JSON.stringify({ v, ts: Date.now() } satisfies StoredEntry));
  } catch {
    /* Quota voll — Best-Effort. */
  }
}

/** Hilfs-Funktion: alle abgelaufenen Forecast-Einträge wegschmeissen. */
export function pruneExpiredOrderWeather(): void {
  const ls = safeWindow();
  if (!ls) return;
  const now = Date.now();
  const stale: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    const raw = ls.getItem(k);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as StoredEntry;
      if (!parsed?.v || typeof parsed.ts !== "number") {
        stale.push(k);
        continue;
      }
      if (now - parsed.ts > ttlFor(parsed.v.source)) stale.push(k);
    } catch {
      stale.push(k);
    }
  }
  for (const k of stale) {
    try { ls.removeItem(k); } catch { /* ignore */ }
  }
}
