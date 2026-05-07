/**
 * Reusable Drive-Times-Hook (Mobile-Phase 1).
 *
 * Extrahiert aus `dashboard-v2/TodayCard.tsx` (Polish-Pass 2 · 4.1+) — selbe
 * Backend-Logik (`POST /api/dashboard/drive-times`), nur ohne UI-Coupling.
 * Liefert Live-Fahrzeiten pro `orderNo` ab einer GPS-Position.
 *
 * Bug-Hunt M01: Backend hat Rate-Limit; Hook respektiert das durch Debounce
 * (450 ms) + AbortController. Anzahl Legs <= 25 (MAX_LEGS auf Server).
 */
import { useEffect, useRef, useState } from "react";

export interface DriveLeg {
  orderNo: string;
  address: string;
}

export interface DriveResult {
  /** "12 min" / "1 h 5 min" — Google Maps Duration-Text mit Live-Verkehr. */
  durationText: string;
  /** "8.4 km" — optional. */
  distanceText?: string;
}

export interface UseDriveTimesFromLiveOptions {
  /** Origin (z.B. aus `useGeolocation`-Position). */
  lat: number | null | undefined;
  lng: number | null | undefined;
  /** Wenn false → Hook bleibt idle (kein Fetch). Z.B. wenn User Geolocation nicht erlaubt hat. */
  enabled: boolean;
  /** Ziel-Adressen pro Order. */
  legs: DriveLeg[];
  /** Debounce vor Fetch (default 450 ms). */
  debounceMs?: number;
}

export interface UseDriveTimesFromLiveResult {
  /** Map orderNo → DriveResult. Leer wenn idle/Fehler. */
  byOrderNo: Record<string, DriveResult>;
  loading: boolean;
  error: string | null;
}

const MAX_LEGS = 25;

export function useDriveTimesFromLive(
  options: UseDriveTimesFromLiveOptions,
): UseDriveTimesFromLiveResult {
  const { lat, lng, enabled, legs, debounceMs = 450 } = options;

  const [byOrderNo, setByOrderNo] = useState<Record<string, DriveResult>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Stabiler Key fuer den Effekt — Hash der Legs ohne Re-Allocations bei Re-Render.
  const legsKey = legs.map((l) => `${l.orderNo}:${l.address.trim()}`).join("|");

  useEffect(() => {
    abortRef.current?.abort();

    if (!enabled || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setByOrderNo({});
      setError(null);
      setLoading(false);
      return;
    }

    const trimmed = legs
      .map((l) => ({ orderNo: String(l.orderNo), address: l.address.trim() }))
      .filter((l) => l.address.length > 2)
      .slice(0, MAX_LEGS);

    if (trimmed.length === 0) {
      setByOrderNo({});
      setError(null);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;

    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const res = await fetch("/api/dashboard/drive-times", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({ lat, lng, legs: trimmed }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            legs?: Array<{
              orderNo: string;
              durationText: string | null;
              distanceText?: string | null;
              status?: string;
            }>;
          };
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          const next: Record<string, DriveResult> = {};
          for (const row of data.legs || []) {
            if (row.orderNo && row.durationText) {
              next[String(row.orderNo)] = {
                durationText: row.durationText,
                distanceText: row.distanceText ?? undefined,
              };
            }
          }
          setByOrderNo(next);
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setByOrderNo({});
          setError(e instanceof Error ? e.message : "Fehler");
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, lat, lng, legsKey, debounceMs]);

  return { byOrderNo, loading, error };
}
