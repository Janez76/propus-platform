/**
 * travel.js — Routing-Service
 *
 * Fallback-Kette:
 *   1. Google Maps Distance Matrix (departure_time → traffic-aware)
 *   2. Google Maps Distance Matrix (ohne departure_time → historischer Schnitt)
 *   3. OSRM lokal
 *   4. Haversine × 1.4 (letzter Ausweg)
 *
 * Jede Stufe hat einen konfigurierbaren Timeout (routing.timeoutMs, default 2000ms).
 * Cache: geohash6 + weekday + hour, TTL routing.cacheHours (default 6h).
 */

const { getSetting } = require("./settings-resolver");

// ── Geohash (Precision 6 ≈ ~1km) ─────────────────────────────────────────────

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

function encodeGeohash(lat, lon, precision = 6) {
  let idx = 0, bit = 0, evenBit = true, geohash = "";
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (lon >= lonMid) { idx = idx * 2 + 1; lonMin = lonMid; }
      else               { idx = idx * 2;     lonMax = lonMid; }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) { idx = idx * 2 + 1; latMin = latMid; }
      else               { idx = idx * 2;     latMax = latMid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

// ── In-Memory Cache ───────────────────────────────────────────────────────────

const _cache = new Map();

function cacheKey(origin, dest, weekday, hour) {
  const oh = encodeGeohash(origin.lat, origin.lon, 6);
  const dh = encodeGeohash(dest.lat, dest.lon, 6);
  return `${oh}:${dh}:${weekday}:${hour}`;
}

function cacheGet(key, ttlHours) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > ttlHours * 3600 * 1000) { _cache.delete(key); return null; }
  return entry.value;
}

function cacheSet(key, value) {
  _cache.set(key, { value, ts: Date.now() });
}

// ── Haversine ─────────────────────────────────────────────────────────────────

function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function haversineMinutes(origin, dest) {
  return Math.round(haversineKm(origin, dest) * 1.4 / 0.8);
}

// ── OSRM ──────────────────────────────────────────────────────────────────────

const DEFAULT_OSRM_URL = process.env.ROUTING_OSRM_URL || "https://router.project-osrm.org";

async function osrmMinutes(origin, dest, timeoutMs) {
  const url = `${DEFAULT_OSRM_URL}/route/v1/driving/` +
    `${origin.lon},${origin.lat};${dest.lon},${dest.lat}?overview=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const secs = data?.routes?.[0]?.duration;
    return secs != null ? Math.round(secs / 60) : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ── Google Maps Distance Matrix ───────────────────────────────────────────────

async function googleMinutes(origin, dest, apiKey, trafficModel, departureTime, timeoutMs) {
  const params = new URLSearchParams({
    origins:      `${origin.lat},${origin.lon}`,
    destinations: `${dest.lat},${dest.lon}`,
    mode:         "driving",
    key:          apiKey,
  });
  if (departureTime) {
    params.set("departure_time", String(Math.floor(departureTime / 1000)));
    params.set("traffic_model",  trafficModel || "pessimistic");
  }
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?${params}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (el?.status !== "OK") return null;
    const secs = departureTime
      ? (el.duration_in_traffic?.value ?? el.duration?.value)
      : el.duration?.value;
    return secs != null ? Math.round(secs / 60) : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

/**
 * Fahrzeit in Minuten von origin nach dest.
 * @param {{ lat: number, lon: number }} origin
 * @param {{ lat: number, lon: number }} dest
 * @param {Date|number|null} departureTime  JS Date oder Unix-ms; null = kein Traffic
 * @param {"pessimistic"|"best_guess"|"optimistic"} trafficModelOverride
 * @returns {Promise<number>}  Minuten (niemals null — Haversine als letzter Ausweg)
 */
async function routeMinutes(origin, dest, departureTime = null, trafficModelOverride = null) {
  const provider   = String((await getSetting("routing.provider")).value  || "google");
  const apiKey     = String((await getSetting("routing.googleApiKey")).value || "");
  const trafficMod = trafficModelOverride ||
    String((await getSetting("routing.trafficModel")).value || "pessimistic");
  const timeoutMs  = Number((await getSetting("routing.timeoutMs")).value  || 2000);
  const cacheHours = Number((await getSetting("routing.cacheHours")).value || 6);

  const deptMs = departureTime instanceof Date
    ? departureTime.getTime()
    : (typeof departureTime === "number" ? departureTime : null);

  const now = deptMs ? new Date(deptMs) : new Date();
  const ck  = cacheKey(origin, dest, now.getDay(), now.getHours());
  const hit  = cacheGet(ck, cacheHours);
  if (hit != null) return hit;

  let minutes = null;

  // Stufe 1: Google mit Traffic
  if (provider === "google" && apiKey && deptMs) {
    minutes = await googleMinutes(origin, dest, apiKey, trafficMod, deptMs, timeoutMs);
  }

  // Stufe 2: Google ohne Traffic
  if (minutes == null && provider === "google" && apiKey) {
    minutes = await googleMinutes(origin, dest, apiKey, null, null, timeoutMs);
  }

  // Stufe 3: OSRM
  if (minutes == null) {
    minutes = await osrmMinutes(origin, dest, timeoutMs);
  }

  // Stufe 4: Haversine (immer verfügbar)
  if (minutes == null) {
    minutes = haversineMinutes(origin, dest);
  }

  cacheSet(ck, minutes);
  return minutes;
}

/**
 * Buffer zwischen zwei Einsätzen.
 * max(minBufferMinutes, travelMinutes + minBufferMinutes)
 * @param {number} travelMinutes
 * @returns {Promise<number>}
 */
async function travelBuffer(travelMinutes) {
  const minBuffer = Number((await getSetting("scheduling.minBufferMinutes")).value || 30);
  return Math.max(minBuffer, travelMinutes + minBuffer);
}

// Backward-compat: server.js ruft travel.geocodeSwiss() auf
const { geocodeSwiss } = require("./geocoder");

module.exports = { routeMinutes, travelBuffer, haversineKm, haversineMinutes, geocodeSwiss };
