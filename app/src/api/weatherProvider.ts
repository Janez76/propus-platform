import {
  WEATHER_CITIES,
  type WeatherCity,
  type WeatherKind,
  type WeatherZone,
} from "../components/dashboard-v2/dashboardWeather";

export type OrderWeather = {
  kind: WeatherKind;
  /** Tageshöchsttemperatur in °C, gerundet. */
  tMax: number;
  /** Tagestiefsttemperatur in °C, gerundet. */
  tMin: number;
  /** Niederschlagswahrscheinlichkeit (max. über den Tag) 0–100. */
  precip: number;
  /** Datenquelle (Forecast = Vorhersage, Archive = effektiv gemessen). */
  source: "forecast" | "archive";
};

export type OrderWeatherPoint = {
  /** Eindeutiger Schlüssel pro Auftrag (z. B. orderNo). */
  id: string;
  lat: number;
  lng: number;
  /** YYYY-MM-DD (lokal Europe/Zurich). */
  date: string;
};

/**
 * Open-Meteo Forecast Provider (https://open-meteo.com).
 *
 * Open-Source Schweizer Projekt aus Bürglen UR. Datenquellen u. a.
 * MeteoSwiss (ICON-CH), DWD (ICON-D2) und ECMWF — somit effektiv
 * MeteoSwiss-Genauigkeit für die Schweiz, ohne Lizenzdeal.
 *
 * Lizenz: CC-BY 4.0 — Attribution unten ist Pflicht und im UI sichtbar.
 *
 * Die Schnittstelle (`fetchWeatherForCities` → `WeatherZone[]`) bleibt stabil,
 * sodass ein späteres Switchen zu Meteomatics o. ä. nur diese Datei betrifft.
 */

export const OPEN_METEO_ATTRIBUTION = "Wetter: Open-Meteo · MeteoSwiss";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 8_000;

/** WMO Weather interpretation codes → unser WeatherKind. */
function wmoCodeToKind(code: number): WeatherKind {
  if (code === 0) return "sun";
  if (code === 1 || code === 2) return "psun";
  if (code === 3) return "cloud";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain";
  if (code === 85 || code === 86) return "snow";
  if (code >= 95 && code <= 99) return "storm";
  return "cloud";
}

type OpenMeteoCurrent = {
  temperature_2m?: number;
  weather_code?: number;
  precipitation_probability?: number;
};

type OpenMeteoEntry = {
  latitude: number;
  longitude: number;
  current?: OpenMeteoCurrent;
};

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(id);
  }
}

function parseEntries(json: unknown): OpenMeteoEntry[] {
  if (Array.isArray(json)) return json as OpenMeteoEntry[];
  if (json && typeof json === "object") return [json as OpenMeteoEntry];
  return [];
}

export async function fetchWeatherForCities(
  cities: readonly WeatherCity[] = WEATHER_CITIES,
): Promise<WeatherZone[]> {
  if (cities.length === 0) return [];

  const lats = cities.map((c) => c.lat).join(",");
  const lngs = cities.map((c) => c.lng).join(",");
  const url =
    `${ENDPOINT}?latitude=${lats}&longitude=${lngs}` +
    `&current=temperature_2m,weather_code,precipitation_probability` +
    `&models=icon_d2&timezone=Europe%2FZurich`;

  const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  const entries = parseEntries(json);

  const zones: WeatherZone[] = [];
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const entry = entries[i];
    const cur = entry?.current;
    if (!cur || cur.temperature_2m == null || cur.weather_code == null) continue;
    zones.push({
      city: city.city,
      lat: city.lat,
      lng: city.lng,
      kind: wmoCodeToKind(cur.weather_code),
      t: Math.round(cur.temperature_2m),
      precip: typeof cur.precipitation_probability === "number"
        ? Math.max(0, Math.min(100, Math.round(cur.precipitation_probability)))
        : 0,
    });
  }
  return zones;
}

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_ENDPOINT = "https://archive-api.open-meteo.com/v1/archive";
/** Forecast deckt Heute … Heute+15 ab; alles ältere/jüngere fällt auf Archive bzw. „kein Wert". */
const FORECAST_DAYS_AHEAD = 15;
const FORECAST_DAYS_BEHIND = 2;

function todayISOZurich(now = new Date()): string {
  // YYYY-MM-DD im lokalen Zürich-Datum (TZ-Offset reicht — kein DST-Bug für Tagesgrenze).
  const tzMs = now.getTime() + 60 * 60 * 1000; // CH ist UTC+1/+2; Tagesgrenze ist tolerant.
  const d = new Date(tzMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / 86_400_000);
}

function pickRoute(date: string, today: string): "forecast" | "archive" | "skip" {
  const delta = daysBetween(today, date);
  if (delta > FORECAST_DAYS_AHEAD) return "skip";
  if (delta < -FORECAST_DAYS_BEHIND) return "archive";
  return "forecast";
}

type OpenMeteoDaily = {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: number[];
};

type OpenMeteoBatchEntry = {
  latitude: number;
  longitude: number;
  daily?: OpenMeteoDaily;
};

function pickDayFromBatch(
  entry: OpenMeteoBatchEntry | undefined,
  date: string,
): { code: number; tMax: number; tMin: number; precip: number } | null {
  const d = entry?.daily;
  if (!d?.time || !d.weather_code || !d.temperature_2m_max || !d.temperature_2m_min) return null;
  const idx = d.time.indexOf(date);
  if (idx < 0) return null;
  const code = d.weather_code[idx];
  const tMax = d.temperature_2m_max[idx];
  const tMin = d.temperature_2m_min[idx];
  const precip = d.precipitation_probability_max?.[idx] ?? 0;
  if (code == null || tMax == null || tMin == null) return null;
  return {
    code,
    tMax: Math.round(tMax),
    tMin: Math.round(tMin),
    precip: Math.max(0, Math.min(100, Math.round(precip))),
  };
}

async function fetchBatch(
  endpoint: string,
  points: { lat: number; lng: number }[],
  date: string,
  archive: boolean,
): Promise<OpenMeteoBatchEntry[]> {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.lat).join(",");
  const lngs = points.map((p) => p.lng).join(",");
  const dailyVars = archive
    ? "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    : "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max";
  const modelParam = archive ? "" : "&models=icon_d2";
  const url =
    `${endpoint}?latitude=${lats}&longitude=${lngs}` +
    `&daily=${dailyVars}` +
    `&start_date=${date}&end_date=${date}` +
    `&timezone=Europe%2FZurich${modelParam}`;
  const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json: unknown = await res.json();
  if (Array.isArray(json)) return json as OpenMeteoBatchEntry[];
  if (json && typeof json === "object") return [json as OpenMeteoBatchEntry];
  return [];
}

/**
 * Holt das Wetter für eine Liste von (Standort, Datum)-Punkten.
 * Gruppiert intern nach Datum und Route (Forecast/Archive), damit pro
 * Tag nur ein Open-Meteo-Request mit allen Koordinaten gesendet wird.
 *
 * Rückgabe: Map<id, OrderWeather>. Punkte ausserhalb des Forecast-Horizonts
 * (>15 Tage in der Zukunft) tauchen nicht in der Map auf.
 */
export async function fetchWeatherForOrders(
  points: readonly OrderWeatherPoint[],
  now = new Date(),
): Promise<Map<string, OrderWeather>> {
  const out = new Map<string, OrderWeather>();
  if (points.length === 0) return out;

  const today = todayISOZurich(now);
  type Bucket = { route: "forecast" | "archive"; date: string; pts: OrderWeatherPoint[] };
  const buckets = new Map<string, Bucket>();

  for (const p of points) {
    const route = pickRoute(p.date, today);
    if (route === "skip") continue;
    const k = `${route}:${p.date}`;
    let b = buckets.get(k);
    if (!b) {
      b = { route, date: p.date, pts: [] };
      buckets.set(k, b);
    }
    b.pts.push(p);
  }

  await Promise.all(
    [...buckets.values()].map(async (b) => {
      try {
        const endpoint = b.route === "archive" ? ARCHIVE_ENDPOINT : FORECAST_ENDPOINT;
        const entries = await fetchBatch(
          endpoint,
          b.pts.map((p) => ({ lat: p.lat, lng: p.lng })),
          b.date,
          b.route === "archive",
        );
        for (let i = 0; i < b.pts.length; i++) {
          const day = pickDayFromBatch(entries[i], b.date);
          if (!day) continue;
          out.set(b.pts[i].id, {
            kind: wmoCodeToKind(day.code),
            tMax: day.tMax,
            tMin: day.tMin,
            precip: day.precip,
            source: b.route,
          });
        }
      } catch {
        /* einzelner Bucket-Fehler darf nicht alle Wetter killen */
      }
    }),
  );

  return out;
}
