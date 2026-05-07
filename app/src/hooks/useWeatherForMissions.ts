import { useEffect, useState } from "react";
import { getWeatherForecast, type WeatherForecastDay } from "../api/weather";
import { ZIP_COORDS } from "../components/dashboard-v2/zipCoords";
import { useAuthStore } from "../store/authStore";

export interface MissionLocationKey {
  /** Stabiler Schlüssel (z. B. orderNo), unter dem das Wetter zurückgemappt wird. */
  key: string;
  /** Schweizer 4-stellige PLZ. Wenn null/unbekannt → kein Wetter für diesen Eintrag. */
  zip: string | null;
  /** Auftrags-Datum als YYYY-MM-DD (Local). Wenn null → kein Wetter. */
  dateIso: string | null;
}

const dayCache = new Map<string, WeatherForecastDay>();

/**
 * Lädt einen pro-Auftrags-Tageswetter-Forecast (PLZ → Koordinaten → Open-Meteo).
 * Bündelt Anfragen pro (PLZ, Tag), so dass mehrere Termine am selben Tag/Ort
 * nur einen Server-Call auslösen. Server-seitiger 15-min-Cache greift on top.
 */
export function useWeatherForMissions(
  items: ReadonlyArray<MissionLocationKey>,
): ReadonlyMap<string, WeatherForecastDay> {
  const token = useAuthStore((s) => s.token);
  const [result, setResult] = useState<ReadonlyMap<string, WeatherForecastDay>>(
    () => new Map(),
  );

  const sig = items
    .map((m) => `${m.key}|${m.zip ?? ""}|${m.dateIso ?? ""}`)
    .join(";");

  useEffect(() => {
    if (!token || items.length === 0) {
      setResult(new Map());
      return;
    }
    let alive = true;

    type Bucket = { zip: string; date: string; coords: { lat: number; lng: number }; keys: string[] };
    const buckets = new Map<string, Bucket>();
    for (const m of items) {
      if (!m.zip || !m.dateIso) continue;
      const coords = ZIP_COORDS[m.zip];
      if (!coords) continue;
      const bk = `${m.zip}|${m.dateIso}`;
      const existing = buckets.get(bk);
      if (existing) {
        existing.keys.push(m.key);
      } else {
        buckets.set(bk, {
          zip: m.zip,
          date: m.dateIso,
          coords: { lat: coords.lat, lng: coords.lng },
          keys: [m.key],
        });
      }
    }

    Promise.all(
      Array.from(buckets.values()).map(async (b) => {
        const cacheK = `${b.zip}|${b.date}`;
        let day = dayCache.get(cacheK);
        if (!day) {
          try {
            const resp = await getWeatherForecast(token, {
              from: b.date,
              days: 1,
              lat: b.coords.lat,
              lng: b.coords.lng,
            });
            day = resp.days[0];
            if (day) dayCache.set(cacheK, day);
          } catch {
            return null;
          }
        }
        if (!day) return null;
        return { day, keys: b.keys };
      }),
    ).then((parts) => {
      if (!alive) return;
      const next = new Map<string, WeatherForecastDay>();
      for (const p of parts) {
        if (!p) continue;
        for (const k of p.keys) next.set(k, p.day);
      }
      setResult(next);
    });

    return () => {
      alive = false;
    };
    // sig kapselt items; primitive Dep verhindert Render-Loops bei jedem
    // Re-Mount der MissionItem-Liste.
  }, [token, sig]); // eslint-disable-line react-hooks/exhaustive-deps

  return result;
}
