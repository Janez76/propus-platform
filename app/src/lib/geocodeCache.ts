/**
 * Geocoding-Cache in localStorage. Adressen ändern sich kaum,
 * deshalb 30-Tage-TTL und Versions-Prefix.
 */

const PREFIX = "propus.geocode.v1.";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type GeoEntry = { lat: number; lng: number } | "fail";

type StoredEntry = { v: GeoEntry; ts: number };

function safeWindow(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function key(addr: string): string {
  return PREFIX + addr;
}

export function loadGeocodeCache(): Map<string, GeoEntry> {
  const map = new Map<string, GeoEntry>();
  const ls = safeWindow();
  if (!ls) return map;

  const now = Date.now();
  const stale: string[] = [];
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (!k || !k.startsWith(PREFIX)) continue;
    const raw = ls.getItem(k);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as StoredEntry;
      if (!parsed || typeof parsed.ts !== "number") continue;
      if (now - parsed.ts > TTL_MS) {
        stale.push(k);
        continue;
      }
      map.set(k.slice(PREFIX.length), parsed.v);
    } catch {
      stale.push(k);
    }
  }
  for (const k of stale) {
    try { ls.removeItem(k); } catch { /* ignore quota errors */ }
  }
  return map;
}

export function saveGeocodeEntry(addr: string, entry: GeoEntry): void {
  const ls = safeWindow();
  if (!ls) return;
  try {
    ls.setItem(key(addr), JSON.stringify({ v: entry, ts: Date.now() } satisfies StoredEntry));
  } catch {
    /* Quota voll oder Privacy-Modus — Cache ist Best-Effort. */
  }
}
