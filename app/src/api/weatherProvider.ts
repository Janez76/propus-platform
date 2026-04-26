import {
  WEATHER_CITIES,
  type WeatherCity,
  type WeatherKind,
  type WeatherZone,
} from "../components/dashboard-v2/dashboardWeather";

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
