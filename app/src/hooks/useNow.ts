import { useEffect, useState } from "react";

const TICK_MS = 30_000;

/**
 * A clock that updates every 30s and on tab focus (visibility),
 * so dashboard date/KW/metrics can advance without a full page reload.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
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
