import { useEffect, useRef, useState } from "react";

interface UsePullToRefreshOptions {
  /** Pixels of pull required to trigger refresh. Default 72. */
  threshold?: number;
  /** Hard cap to avoid runaway translation. Default = threshold * 1.5. */
  maxPull?: number;
}

interface UsePullToRefreshReturn<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  /** 0..1 (over-pull goes >1 up to ~maxPull/threshold). */
  pull: number;
  /** True während `onRefresh()` läuft. */
  refreshing: boolean;
}

/**
 * Pull-to-Refresh ohne externe Dependency — Touch-Events am Scroll-Container.
 * Triggert `onRefresh` wenn der Container am Top steht, der User um >threshold
 * runtergezogen hat und losgelassen wird. Kompatibel mit normalem Tab-Wechsel
 * und kein Konflikt mit Vertical-Scrolling, weil wir nur am Top reagieren.
 */
export function usePullToRefresh<T extends HTMLElement>(
  onRefresh: () => Promise<void> | void,
  options?: UsePullToRefreshOptions,
): UsePullToRefreshReturn<T> {
  const ref = useRef<T | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Live-State-Spiegel — reine Closure-Lesungen in den Touch-Handlern, damit wir
   * den Effect nicht bei jedem state-Update neu aufsetzen (sonst ginge der
   * laufende Drag verloren).
   */
  const stateRef = useRef({ pull, refreshing, startY: null as number | null });
  stateRef.current.pull = pull;
  stateRef.current.refreshing = refreshing;

  /**
   * Stabiler Referenz-Container für den User-Callback — der useEffect wird
   * NICHT neu gesetzt, wenn der Caller `onRefresh` inline definiert hat
   * (häufiger Fehler-Fall).
   */
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const threshold = options?.threshold ?? 72;
    const maxPull = options?.maxPull ?? threshold * 1.5;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0 || stateRef.current.refreshing) return;
      stateRef.current.startY = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const startY = stateRef.current.startY;
      if (startY == null || stateRef.current.refreshing) return;
      const y = e.touches[0]?.clientY ?? startY;
      const dy = y - startY;
      if (dy <= 0) {
        if (stateRef.current.pull !== 0) setPull(0);
        return;
      }
      /* Native Scroll unterdrücken, sonst kommt iOS in eigenes „rubber-band". */
      if (e.cancelable) e.preventDefault();
      const clamped = Math.min(maxPull, dy);
      setPull(clamped / threshold);
    };

    const finish = async () => {
      const startY = stateRef.current.startY;
      stateRef.current.startY = null;
      if (startY == null) return;
      const ready = stateRef.current.pull >= 1;
      setPull(0);
      if (ready && !stateRef.current.refreshing) {
        setRefreshing(true);
        try {
          await cbRef.current();
        } finally {
          setRefreshing(false);
        }
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", finish);
    el.addEventListener("touchcancel", finish);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", finish);
      el.removeEventListener("touchcancel", finish);
    };
  }, [options?.threshold, options?.maxPull]);

  return { ref, pull, refreshing };
}
