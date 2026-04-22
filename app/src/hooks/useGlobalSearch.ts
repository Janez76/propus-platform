import { useEffect, useRef, useState } from "react";
import { globalSearch, type SearchGroup } from "../api/search";

interface UseGlobalSearchResult {
  groups: SearchGroup[];
  loading: boolean;
  error: string | null;
  totalCount: number;
}

/**
 * Liefert serverseitige Suchergebnisse mit 250 ms Debounce und AbortController.
 * Setzt q auf weniger als 2 Zeichen → leere Gruppen, kein API-Call.
 */
export function useGlobalSearch(q: string, limit = 5): UseGlobalSearchResult {
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = q.trim();
    // Abort vorheriger Request
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (trimmed.length < 2) {
      setGroups([]);
      setLoading(false);
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      setError(null);
      globalSearch(trimmed, { limit, signal: ctrl.signal })
        .then((res) => {
          if (ctrl.signal.aborted) return;
          setGroups(res.groups ?? []);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Suche fehlgeschlagen");
          setGroups([]);
        })
        .finally(() => {
          if (ctrl.signal.aborted) return;
          setLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [q, limit]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const totalCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  return { groups, loading, error, totalCount };
}
