import { useEffect, useState } from "react";

const TICK_MS = 30_000;

// Stabiler Epoch-Wert fuer den initialen Render. Identisch auf SSR und
// Client-Hydration → kein Hydration-Mismatch mehr (Bug-Hunt T08 MEDIUM).
// Der echte aktuelle Zeitstempel kommt unmittelbar in useEffect on mount.
const EPOCH_INITIAL = new Date(0);

/**
 * A clock that updates every 30s and on tab focus (visibility),
 * so dashboard date/KW/metrics can advance without a full page reload.
 *
 * Initial-State ist Epoch (1970-01-01), damit SSR und Client-Hydration
 * dieselbe Zeit ausgeben — sonst loggt React eine Hydration-Mismatch-
 * Warnung. useEffect setzt sofort auf den aktuellen Zeitstempel
 * (Bug-Hunt T08 MEDIUM).
 */
export function useNow(): Date {
  const [now, setNow] = useState<Date>(EPOCH_INITIAL);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick(); // initial sync on mount
    const id = setInterval(tick, TICK_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);
  return now;
}
