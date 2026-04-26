import { fetchWeatherForCities } from "../api/weatherProvider";
import type { WeatherZone } from "../components/dashboard-v2/dashboardWeather";
import { useQuery } from "./useQuery";

const QUERY_KEY = "weather:openmeteo:zones:v1";
const STALE_MS = 15 * 60 * 1000;

/**
 * Lädt aktuelle Wetterzonen für die Dashboard-Karte.
 * Bei Fehler wird `data` `undefined` — Aufrufer behandeln das als „kein Wetter".
 */
export function useWeatherZones(enabled = true) {
  return useQuery<WeatherZone[]>(QUERY_KEY, () => fetchWeatherForCities(), {
    enabled,
    staleTime: STALE_MS,
    refetchOnWindowFocus: true,
  });
}
