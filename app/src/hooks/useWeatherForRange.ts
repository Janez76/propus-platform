import { useEffect, useState } from "react";
import {
  getWeatherForecast,
  indexForecastByDate,
  type WeatherForecastDay,
} from "../api/weather";
import { useAuthStore } from "../store/authStore";

type Result = {
  data: ReadonlyMap<string, WeatherForecastDay>;
  loading: boolean;
};

const cache = new Map<string, ReadonlyMap<string, WeatherForecastDay>>();

/**
 * Lädt eine Datums-indexierte Tagesvorhersage für ein Fenster (z. B. Heatmap-Monat,
 * Wochenagenda, Tagesansicht). Stützt sich auf das bestehende Backend-Endpoint
 * `/api/admin/weather/forecast`. In-Memory-Cache pro (from, days, region)-Tupel.
 */
export function useWeatherForRange(
  fromIso: string | null,
  days: number,
  region = "zurich",
): Result {
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState<ReadonlyMap<string, WeatherForecastDay>>(() => new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Epoch-Guard: useNow liefert beim ersten Render Date(0) = 1970-01-01
    // (Hydration-Match-Sentinel). Ohne Guard fliegt ein Forecast-Fetch fuer
    // 1970 raus → Open-Meteo 502. Erst ab plausiblem Datum laden.
    if (!token || !fromIso || days <= 0 || fromIso < "2000-01-01") {
      setData(new Map());
      return;
    }
    const key = `${fromIso}|${days}|${region}`;
    const hit = cache.get(key);
    if (hit) {
      setData(hit);
      return;
    }
    let alive = true;
    setLoading(true);
    getWeatherForecast(token, { from: fromIso, days, region })
      .then((resp) => {
        if (!alive) return;
        const map = indexForecastByDate(resp);
        cache.set(key, map);
        setData(map);
      })
      .catch(() => {
        /* Wetter ist optional */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [token, fromIso, days, region]);

  return { data, loading };
}
