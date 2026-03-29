import { useEffect, useRef } from "react";
import { PUBLIC_CATALOG_BROADCAST_CHANNEL, PUBLIC_CATALOG_BROADCAST_STORAGE_KEY } from "./catalogBroadcast";

const DEBOUNCE_MS = 400;
const POLL_INTERVAL_MS = 20_000;

export function useCatalogSync(onInvalidate: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleRefresh() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onInvalidate, DEBOUNCE_MS);
  }

  useEffect(() => {
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(PUBLIC_CATALOG_BROADCAST_CHANNEL);
        bc.onmessage = (ev) => {
          if (ev?.data?.type === "invalidate") scheduleRefresh();
        };
      }
    } catch { /* unsupported */ }

    function onStorage(ev: StorageEvent) {
      if (ev.key === PUBLIC_CATALOG_BROADCAST_STORAGE_KEY) scheduleRefresh();
    }

    function onVisible() {
      if (document.visibilityState === "visible") scheduleRefresh();
    }

    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", scheduleRefresh);

    const poll = setInterval(() => {
      if (document.visibilityState === "visible") scheduleRefresh();
    }, POLL_INTERVAL_MS);

    return () => {
      bc?.close();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", scheduleRefresh);
      clearInterval(poll);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onInvalidate]);
}
