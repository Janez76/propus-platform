"use strict";

/**
 * Open-Meteo Wetter-Provider (Daily + Hourly).
 *
 * `best_match` (Default) priorisiert für CH-Koordinaten automatisch die
 * MeteoSwiss-Modelle ICON-CH1 (1.1 km, ~33 h Horizont) und ICON-CH2
 * (2 km, ~5 d) und blendet für Tag 5–16 nahtlos auf ICON-EU/ECMWF.
 * Damit bekommen wir kurzfristig MeteoSwiss-Daten und mittelfristig den
 * besten verfügbaren globalen Lauf — ohne API-Key, kostenlos.
 *
 * 15-min In-Memory-Cache pro Koordinaten-Bucket (~5 km × 5 km), damit ein
 * Dashboard mit 30 Aufträgen nicht 30 HTTP-Requests gegen Open-Meteo
 * absetzt. Mesoskaliges Wetter ändert sich auf 5 km nicht relevant.
 */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TZ = "Europe/Zurich";
const TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const COORD_BUCKET = 0.05;
const MAX_DAYS = 16;

const cache = new Map();

function bucket(n) {
  return (Math.round(Number(n) / COORD_BUCKET) * COORD_BUCKET).toFixed(2);
}

function cacheKey(prefix, lat, lng, ...rest) {
  return [prefix, bucket(lat), bucket(lng), ...rest].join("|");
}

function wmoToKind(code) {
  const c = Number(code);
  if (c === 0) return "sun";
  if (c === 1 || c === 2) return "psun";
  if (c === 3) return "cloud";
  if (c === 45 || c === 48) return "fog";
  if ((c >= 51 && c <= 57) || (c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return "snow";
  if (c >= 95) return "storm";
  return "cloud";
}

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoAddDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function callOpenMeteo(params) {
  const url = `${ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchDaily(lat, lng, fromIso, days) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("fetchDaily: lat/lng sind keine gültigen Zahlen.");
  }
  const start = (typeof fromIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fromIso))
    ? fromIso
    : isoToday();
  const dCount = Math.max(1, Math.min(MAX_DAYS, Number(days) | 0 || 7));
  const end = isoAddDays(start, dCount - 1);
  const k = cacheKey("d", lat, lng, start, end);
  const hit = cache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: TZ,
    start_date: start,
    end_date: end,
  });
  const json = await callOpenMeteo(params);
  const d = json && json.daily ? json.daily : {};
  const out = Array.isArray(d.time) ? d.time.map((date, i) => ({
    date,
    kind: wmoToKind(d.weather_code?.[i]),
    t_min: Math.round(Number(d.temperature_2m_min?.[i] ?? 0)),
    t_max: Math.round(Number(d.temperature_2m_max?.[i] ?? 0)),
    precip: Math.round(Number(d.precipitation_probability_max?.[i] ?? 0)),
  })) : [];
  cache.set(k, { data: out, expiresAt: Date.now() + CACHE_TTL_MS });
  return out;
}

async function fetchHourly(lat, lng, dateIso) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("fetchHourly: lat/lng sind keine gültigen Zahlen.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateIso || ""))) {
    throw new Error("fetchHourly: erwartet `date` im Format YYYY-MM-DD.");
  }
  const k = cacheKey("h", lat, lng, dateIso);
  const hit = cache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: "temperature_2m,weather_code,precipitation_probability",
    timezone: TZ,
    start_date: dateIso,
    end_date: dateIso,
  });
  const json = await callOpenMeteo(params);
  const h = json && json.hourly ? json.hourly : {};
  const out = Array.isArray(h.time) ? h.time.map((time, i) => ({
    time,
    kind: wmoToKind(h.weather_code?.[i]),
    t: Math.round(Number(h.temperature_2m?.[i] ?? 0)),
    precip: Math.round(Number(h.precipitation_probability?.[i] ?? 0)),
  })) : [];
  cache.set(k, { data: out, expiresAt: Date.now() + CACHE_TTL_MS });
  return out;
}

module.exports = { fetchDaily, fetchHourly, wmoToKind };
