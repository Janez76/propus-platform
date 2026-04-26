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
  /** Anzahl Tage ab `from`. Default: 42 (~6 Wochen). */
  days?: number;
  /** Region-Key (siehe Backend). Default: "zurich". */
  region?: string;
}

export async function getWeatherForecast(
  token: string,
  opts: GetWeatherForecastOpts = {},
): Promise<WeatherForecastResponse> {
  const params = new URLSearchParams();
  if (opts.from) params.set("from", opts.from);
  if (opts.days != null) params.set("days", String(opts.days));
  if (opts.region) params.set("region", opts.region);
  const qs = params.toString();
  const path = `/api/admin/weather/forecast${qs ? `?${qs}` : ""}`;
  const data = await apiRequest<WeatherForecastResponse>(path, "GET", token);
  return data;
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
