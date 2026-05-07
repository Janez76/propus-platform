import { apiRequest } from "./client";

export type WeatherKind = "sun" | "psun" | "cloud" | "rain" | "storm" | "fog" | "snow";

export interface WeatherForecastDay {
  /** YYYY-MM-DD */
  date: string;
  kind: WeatherKind;
  t_min: number;
  t_max: number;
  /** Niederschlagswahrscheinlichkeit in % (0–100) */
  precip: number;
}

export interface WeatherForecastRegion {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

export interface WeatherForecastResponse {
  ok: true;
  region: WeatherForecastRegion;
  days: WeatherForecastDay[];
}

export interface GetWeatherForecastOpts {
  /** ISO-Datum (YYYY-MM-DD). Default: heute */
  from?: string;
  /** Anzahl Tage ab `from`. Default backend = 7. Open-Meteo-Limit: 16. */
  days?: number;
  /** Region-Key (siehe Backend). Default: "zurich". Wird ignoriert, wenn lat+lng gesetzt sind. */
  region?: string;
  /** Freie Koordinaten (überschreiben `region`). Beide müssen gesetzt sein. */
  lat?: number;
  lng?: number;
}

export async function getWeatherForecast(
  token: string,
  opts: GetWeatherForecastOpts = {},
): Promise<WeatherForecastResponse> {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.days != null) params.set("days", String(opts.days));
  if (Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
    params.set("lat", String(opts.lat));
    params.set("lng", String(opts.lng));
  } else if (opts.region) {
    params.set("region", opts.region);
  }
  const qs = params.toString();
  const path = `/api/admin/weather/forecast${qs ? `?${qs}` : ""}`;
  const data = await apiRequest<WeatherForecastResponse>(path, "GET", token);
  return data;
}

export interface WeatherHourlyEntry {
  /** ISO-Local (Europe/Zurich), z. B. "2026-05-07T14:00" */
  time: string;
  kind: WeatherKind;
  /** Temperatur in °C, gerundet */
  t: number;
  /** Niederschlagswahrscheinlichkeit in % */
  precip: number;
}

export interface WeatherHourlyResponse {
  ok: true;
  region: WeatherForecastRegion;
  /** YYYY-MM-DD */
  date: string;
  hours: WeatherHourlyEntry[];
}

export interface GetWeatherHourlyOpts {
  /** Pflicht: Tag im Format YYYY-MM-DD */
  date: string;
  /** Region-Key. Wird ignoriert, wenn lat+lng gesetzt sind. */
  region?: string;
  lat?: number;
  lng?: number;
}

export async function getWeatherHourly(
  token: string,
  opts: GetWeatherHourlyOpts,
): Promise<WeatherHourlyResponse> {
  const params = new URLSearchParams();
  params.set("date", opts.date);
  if (Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
    params.set("lat", String(opts.lat));
    params.set("lng", String(opts.lng));
  } else if (opts.region) {
    params.set("region", opts.region);
  }
  const path = `/api/admin/weather/hourly?${params.toString()}`;
  return apiRequest<WeatherHourlyResponse>(path, "GET", token);
}

/** Emoji-Zuordnung für eine Wetterart. */
export function weatherEmoji(kind: WeatherKind): string {
  switch (kind) {
    case "sun":
      return "☀️";
    case "psun":
      return "⛅";
    case "cloud":
      return "☁️";
    case "rain":
      return "🌧️";
    case "storm":
      return "⛈️";
    case "fog":
      return "🌫️";
    case "snow":
      return "❄️";
    default:
      return "·";
  }
}

/** Kurzer Text-Label (de-CH). */
export function weatherLabel(kind: WeatherKind): string {
  switch (kind) {
    case "sun":
      return "Sonnig";
    case "psun":
      return "Heiter";
    case "cloud":
      return "Bewölkt";
    case "rain":
      return "Regen";
    case "storm":
      return "Gewitter";
    case "fog":
      return "Nebel";
    case "snow":
      return "Schnee";
    default:
      return "—";
  }
}

/** Map einer Antwort auf YYYY-MM-DD → Day. */
export function indexForecastByDate(
  resp: WeatherForecastResponse | null | undefined,
): Map<string, WeatherForecastDay> {
  const m = new Map<string, WeatherForecastDay>();
  if (!resp || !Array.isArray(resp.days)) return m;
  for (const d of resp.days) {
    if (d && typeof d.date === "string") m.set(d.date, d);
  }
  return m;
}
