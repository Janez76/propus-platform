/**
 * geocoder.js — Geocoding via Nominatim (OpenStreetMap)
 *
 * Extrahiert aus travel.js für saubere Trennung von Routing und Geocoding.
 * Backward-compat: travel.js re-exportiert geocodeSwiss für bestehende Aufrufe
 * via travel.geocodeSwiss(...) in server.js.
 */

function resolveNominatimUrl(value) {
  const fallback = "https://nominatim.openstreetmap.org";
  const raw = String(value || "").trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "null" || raw.toLowerCase() === "undefined") {
    return fallback;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fallback;
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

const DEFAULT_NOMINATIM_URL = resolveNominatimUrl(process.env.NOMINATIM_URL);
const HTTP_TIMEOUT_MS = parseInt(process.env.TRAVEL_HTTP_TIMEOUT_MS || "8000", 10);

function makeCache(ttlMs) {
  const map = new Map();
  return {
    get(key) {
      const hit = map.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= Date.now()) {
        map.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key, value) {
      map.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

const geocodeCache = makeCache(24 * 60 * 60 * 1000); // 1d

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number.isFinite(HTTP_TIMEOUT_MS) ? HTTP_TIMEOUT_MS : 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Buchungstool/1.0 (geocoder)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function normalizeText(q) {
  return String(q || "").trim().replace(/\s+/g, " ");
}

/**
 * Geocodiert eine Schweizer Adresse via Nominatim.
 * @param {string} queryText  z.B. "Musterstrasse 1, 8001 Zürich, Schweiz"
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
async function geocodeSwiss(queryText) {
  const q = normalizeText(queryText);
  if (!q) return null;
  const key = `ch:${q.toLowerCase()}`;
  const cached = geocodeCache.get(key);
  if (cached) return cached;

  const url =
    `${DEFAULT_NOMINATIM_URL}/search` +
    `?format=jsonv2&limit=1&countrycodes=ch&q=${encodeURIComponent(q)}`;
  const data = await fetchJson(url);
  const item = Array.isArray(data) ? data[0] : null;
  const lat = item ? Number(item.lat) : NaN;
  const lon = item ? Number(item.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const coord = { lat, lon };
  geocodeCache.set(key, coord);
  return coord;
}

/**
 * Geocodiert eine Adresse aus Buchungs-Payload-Feldern.
 * Nicht buchungskritisch — gibt null zurück wenn Geocoding fehlschlägt.
 * @param {{ street?: string, zip?: string, city?: string }} obj
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
async function geocodeBookingObject(obj) {
  const addr = [
    obj?.street,
    obj?.zip,
    obj?.city,
    "Schweiz",
  ].filter(Boolean).join(", ");

  if (!addr) return null;

  try {
    return await geocodeSwiss(addr);
  } catch {
    return null;
  }
}

module.exports = { geocodeSwiss, geocodeBookingObject };
