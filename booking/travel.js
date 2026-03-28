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
const DEFAULT_OSRM_URL = process.env.ROUTING_OSRM_URL || "https://router.project-osrm.org";
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
const routeCache = makeCache(24 * 60 * 60 * 1000); // 1d

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Number.isFinite(HTTP_TIMEOUT_MS) ? HTTP_TIMEOUT_MS : 8000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Nominatim verlangt üblicherweise einen UA; OSRM stört sich nicht daran.
        "User-Agent": "Buchungstool/1.0 (availability-travel)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function normalizeText(q) {
  return String(q || "").trim().replace(/\s+/g, " ");
}

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

function routeKey(from, to) {
  const f = `${from.lat.toFixed(6)},${from.lon.toFixed(6)}`;
  const t = `${to.lat.toFixed(6)},${to.lon.toFixed(6)}`;
  return `${f}->${t}`;
}

async function routeMinutes(from, to) {
  if (!from || !to) return null;
  const key = routeKey(from, to);
  const cached = routeCache.get(key);
  if (cached != null) return cached;

  const url =
    `${DEFAULT_OSRM_URL}/route/v1/driving/` +
    `${from.lon},${from.lat};${to.lon},${to.lat}` +
    `?overview=false&alternatives=false&steps=false`;
  const data = await fetchJson(url);
  const seconds = Number(data?.routes?.[0]?.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.ceil(seconds / 60);
  routeCache.set(key, minutes);
  return minutes;
}

module.exports = {
  geocodeSwiss,
  routeMinutes,
};

