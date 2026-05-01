import { queryOne as defaultQueryOne } from "@/lib/db";
import { fetchWeatherForOrders, type OrderWeather } from "@/api/weatherProvider";
import { lookupZip } from "@/components/dashboard-v2/zipCoords";
import type { ToolDefinition, ToolHandler } from "./index";

type QueryOneFn = <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T | null>;
type FetchFn = typeof globalThis.fetch;

type WeatherDeps = {
  queryOne?: QueryOneFn;
  fetch?: FetchFn;
  fetchOrderWeather?: typeof fetchWeatherForOrders;
};

const FORECAST_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const REQUEST_TIMEOUT_MS = 8_000;

function text(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
}

function finiteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampDays(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 3;
  return Math.min(Math.max(1, Math.trunc(n)), 7);
}

function todayISOZurich(now = new Date()): string {
  const tzMs = now.getTime() + 60 * 60 * 1000;
  const d = new Date(tzMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(t)) return isoDate;
  const d = new Date(t + days * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function wmoCodeToLabel(code: number): { kind: string; label: string } {
  if (code === 0) return { kind: "sun", label: "Sonnig" };
  if (code === 1 || code === 2) return { kind: "psun", label: "Teils sonnig" };
  if (code === 3) return { kind: "cloud", label: "Bewölkt" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Nebel" };
  if (code >= 51 && code <= 67) return { kind: "rain", label: "Regen" };
  if (code >= 71 && code <= 77) return { kind: "snow", label: "Schnee" };
  if (code >= 80 && code <= 82) return { kind: "rain", label: "Regenschauer" };
  if (code === 85 || code === 86) return { kind: "snow", label: "Schneeschauer" };
  if (code >= 95 && code <= 99) return { kind: "storm", label: "Gewitter" };
  return { kind: "cloud", label: "Bewölkt" };
}

type ForecastResponse = {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
  current?: {
    time?: string;
    temperature_2m?: number;
    weather_code?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    precipitation?: number;
  };
};

async function fetchWithTimeout(
  url: string,
  ms: number,
  doFetch: FetchFn,
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await doFetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
  } finally {
    clearTimeout(id);
  }
}

async function fetchForecast(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
  doFetch: FetchFn,
): Promise<ForecastResponse> {
  const url =
    `${FORECAST_ENDPOINT}?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,precipitation` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&models=icon_d2&timezone=Europe%2FZurich`;
  const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS, doFetch);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  return (await res.json()) as ForecastResponse;
}

export const weatherTools: ToolDefinition[] = [
  {
    name: "get_weather_forecast",
    description:
      "Wettervorhersage (MeteoSwiss ICON-CH via Open-Meteo) für einen Ort in der Schweiz. " +
      "Gibt Aktuell-Wert plus tägliche Min/Max-Temperatur, Niederschlagswahrscheinlichkeit und Windgeschwindigkeit. " +
      "Eingabe entweder lat/lng ODER zip (Schweizer PLZ, 4-stellig). " +
      "Hinweis: Open-Meteo liefert KEINE offiziellen Warnungen/Alarme — für Unwetterwarnungen weiterhin auf https://www.meteoschweiz.admin.ch verweisen.",
    input_schema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Breitengrad (z. B. 47.3769 für Zürich)" },
        lng: { type: "number", description: "Längengrad (z. B. 8.5417 für Zürich)" },
        zip: { type: "string", description: "Schweizer Postleitzahl (4-stellig). Wird auf vorhandene Stadt-Koordinaten gemappt." },
        days: { type: "number", description: "Anzahl Vorhersagetage (1–7, Default 3)" },
      },
    },
  },
  {
    name: "get_weather_for_order",
    description:
      "Wetter für die Adresse und den Termin eines Auftrags (Order). " +
      "Liefert das Tageswetter (Min/Max, Niederschlag, Wetterart). " +
      "Wenn der Termin >15 Tage in der Zukunft liegt, gibt es keinen Wert.",
    input_schema: {
      type: "object",
      properties: {
        order_id: { type: "string", description: "Auftrags-ID oder order_no" },
      },
      required: ["order_id"],
    },
  },
];

export function createWeatherHandlers(deps: WeatherDeps = {}): Record<string, ToolHandler> {
  const runQueryOne = deps.queryOne || defaultQueryOne;
  const doFetch = deps.fetch || globalThis.fetch;
  const doOrderWeather = deps.fetchOrderWeather || fetchWeatherForOrders;

  return {
    get_weather_forecast: async (input: Record<string, unknown>) => {
      let lat = finiteNumber(input.lat);
      let lng = finiteNumber(input.lng);
      const zip = text(input.zip);
      let area: string | null = null;

      if ((lat == null || lng == null) && zip) {
        const coord = lookupZip(zip);
        if (!coord) return { error: `Keine Koordinaten für PLZ ${zip} hinterlegt` };
        lat = coord.lat;
        lng = coord.lng;
        area = coord.area;
      }
      if (lat == null || lng == null) return { error: "lat/lng oder zip ist erforderlich" };

      const days = clampDays(input.days);
      const start = todayISOZurich();
      const end = addDays(start, days - 1);

      try {
        const data = await fetchForecast(lat, lng, start, end, doFetch);
        const daily = data.daily;
        const current = data.current;

        const dailyOut: Array<{
          date: string;
          kind: string;
          label: string;
          tMax: number;
          tMin: number;
          precipProb: number;
          windMax: number | null;
          sunrise: string | null;
          sunset: string | null;
        }> = [];

        if (daily?.time && daily.weather_code && daily.temperature_2m_max && daily.temperature_2m_min) {
          for (let i = 0; i < daily.time.length; i++) {
            const code = daily.weather_code[i];
            const tMax = daily.temperature_2m_max[i];
            const tMin = daily.temperature_2m_min[i];
            if (code == null || tMax == null || tMin == null) continue;
            const { kind, label } = wmoCodeToLabel(code);
            dailyOut.push({
              date: daily.time[i],
              kind,
              label,
              tMax: Math.round(tMax),
              tMin: Math.round(tMin),
              precipProb: Math.round(daily.precipitation_probability_max?.[i] ?? 0),
              windMax: daily.wind_speed_10m_max?.[i] != null ? Math.round(daily.wind_speed_10m_max[i]) : null,
              sunrise: daily.sunrise?.[i] ?? null,
              sunset: daily.sunset?.[i] ?? null,
            });
          }
        }

        const currentOut = current?.temperature_2m != null && current.weather_code != null
          ? {
              time: current.time ?? null,
              kind: wmoCodeToLabel(current.weather_code).kind,
              label: wmoCodeToLabel(current.weather_code).label,
              temperature: Math.round(current.temperature_2m),
              humidity: current.relative_humidity_2m != null ? Math.round(current.relative_humidity_2m) : null,
              windSpeed: current.wind_speed_10m != null ? Math.round(current.wind_speed_10m) : null,
              precipitation: current.precipitation != null ? Number(current.precipitation.toFixed(1)) : null,
            }
          : null;

        return {
          location: { lat, lng, area, zip: zip || null },
          attribution: "Open-Meteo · MeteoSwiss ICON-CH",
          warningsNote:
            "Für offizielle Unwetterwarnungen siehe https://www.meteoschweiz.admin.ch (MeteoSchweiz).",
          current: currentOut,
          days: dailyOut,
        };
      } catch (err) {
        return { error: `Wetter-API Fehler: ${err instanceof Error ? err.message : String(err)}` };
      }
    },

    get_weather_for_order: async (input: Record<string, unknown>) => {
      const orderRef = text(input.order_id);
      if (!orderRef) return { error: "order_id ist erforderlich" };

      const orderNo = Number(orderRef);
      const useNo = Number.isInteger(orderNo) && orderNo > 0;

      const row = await runQueryOne<{
        order_no: number;
        address: string | null;
        zip: string | null;
        schedule: { date?: string | null } | null;
      }>(
        `SELECT order_no,
                COALESCE(address, '') AS address,
                NULLIF(regexp_replace(COALESCE(address, ''), '.*\\m(\\d{4})\\M.*', '\\1'), '') AS zip,
                schedule
         FROM booking.orders
         WHERE ${useNo ? "order_no = $1" : "id::text = $1"}
         LIMIT 1`,
        [useNo ? orderNo : orderRef],
      );

      if (!row) return { error: `Auftrag ${orderRef} nicht gefunden` };

      const date = row.schedule?.date ?? null;
      if (!date) return { error: `Auftrag ${row.order_no} hat keinen Termin` };

      const coord = lookupZip(row.zip || row.address || "");
      if (!coord) {
        return {
          error: `Keine Koordinaten für Auftrag ${row.order_no} (Adresse: ${row.address || "—"})`,
        };
      }

      const map = await doOrderWeather([
        { id: String(row.order_no), lat: coord.lat, lng: coord.lng, date },
      ]);

      const w: OrderWeather | undefined = map.get(String(row.order_no));
      if (!w) {
        return {
          orderNo: row.order_no,
          date,
          location: { area: coord.area, lat: coord.lat, lng: coord.lng },
          weather: null,
          note: "Keine Wetterdaten (Termin liegt ausserhalb des Vorhersage-Horizonts oder Datenquelle hat keinen Wert).",
        };
      }

      return {
        orderNo: row.order_no,
        date,
        location: { area: coord.area, lat: coord.lat, lng: coord.lng },
        weather: {
          kind: w.kind,
          tMax: w.tMax,
          tMin: w.tMin,
          precipProb: w.precip,
          source: w.source,
        },
        attribution: "Open-Meteo · MeteoSwiss ICON-CH",
      };
    },
  };
}

export const weatherHandlers = createWeatherHandlers();
