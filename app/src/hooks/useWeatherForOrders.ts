import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchWeatherForOrders,
  type OrderWeather,
  type OrderWeatherPoint,
} from "../api/weatherProvider";
import { loadOrderWeather, saveOrderWeather } from "../lib/orderWeatherCache";

type Result = {
  data: Map<string, OrderWeather>;
  loading: boolean;
};

/**
 * Lädt das Wetter pro (Auftrag, Datum, Standort).
 *
 * – Cache-First: localStorage wird synchron geprüft (siehe `loadOrderWeather`).
 * – Fehlende Punkte werden im Hintergrund pro Tag gebündelt nachgeladen.
 * – Wechselt sich die Order-Liste, werden nur die wirklich neuen Punkte geholt.
 */
export function useWeatherForOrders(
  points: readonly OrderWeatherPoint[],
  enabled: boolean,
): Result {
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const cacheRef = useRef<Map<string, OrderWeather>>(new Map());

  const stableKey = useMemo(
    () => points.map((p) => `${p.id}|${p.lat.toFixed(3)}|${p.lng.toFixed(3)}|${p.date}`).sort().join("\n"),
    [points],
  );

  useEffect(() => {
    if (!enabled || points.length === 0) {
      cacheRef.current = new Map();
      setVersion((v) => v + 1);
      return;
    }

    const next = new Map<string, OrderWeather>();
    const missing: OrderWeatherPoint[] = [];
    for (const p of points) {
      const hit = loadOrderWeather(p.lat, p.lng, p.date);
      if (hit) {
        next.set(p.id, hit);
      } else {
        missing.push(p);
      }
    }
    cacheRef.current = next;
    setVersion((v) => v + 1);

    if (missing.length === 0) return;

    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const fresh = await fetchWeatherForOrders(missing);
        if (cancelled) return;
        for (const p of missing) {
          const w = fresh.get(p.id);
          if (!w) continue;
          cacheRef.current.set(p.id, w);
          saveOrderWeather(p.lat, p.lng, p.date, w);
        }
        setVersion((v) => v + 1);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stableKey]);

  // version triggert Re-Render, damit Konsumenten die aktuelle Map sehen.
  void version;
  return { data: cacheRef.current, loading };
}
