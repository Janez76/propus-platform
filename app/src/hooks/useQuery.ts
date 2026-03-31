import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isQueryStale, useQueryStore } from "../store/queryStore";

type UseQueryOptions = {
  enabled?: boolean;
  staleTime?: number;
  refetchOnMount?: boolean;
};

type RefetchOptions = {
  force?: boolean;
};

const DEFAULT_STALE_TIME = 5 * 60 * 1000;

const inflightByKey = new Map<string, Promise<unknown>>();

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unbekannter Fehler";
}

export function useQuery<TData>(
  queryKey: string,
  queryFn: () => Promise<TData>,
  options?: UseQueryOptions,
) {
  const enabled = options?.enabled ?? true;
  const staleTime = options?.staleTime ?? DEFAULT_STALE_TIME;
  const refetchOnMount = options?.refetchOnMount ?? true;
  const didInitialFetchRef = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const entry = useQueryStore((s) => s.queries[queryKey]);
  const setFetching = useQueryStore((s) => s.setFetching);
  const setData = useQueryStore((s) => s.setData);
  const setError = useQueryStore((s) => s.setError);

  const stale = useMemo(() => isQueryStale(entry), [entry]);
  const hasData = entry?.data !== undefined;

  const refetch = useCallback(
    async (refetchOptions?: RefetchOptions) => {
      if (!enabled) return entry?.data as TData | undefined;
      const force = Boolean(refetchOptions?.force);

      if (!force && inflightByKey.has(queryKey)) {
        const active = inflightByKey.get(queryKey) as Promise<TData>;
        return active;
      }

      if (!force && hasData && !stale) {
        return entry?.data as TData | undefined;
      }

      const run = (async () => {
        setFetching(queryKey, true, staleTime);
        setLocalError(null);
        try {
          const nextData = await queryFn();
          setData(queryKey, nextData, staleTime);
          return nextData;
        } catch (error) {
          const msg = toErrorMessage(error);
          setLocalError(msg);
          setError(queryKey, msg, staleTime);
          throw error;
        } finally {
          setFetching(queryKey, false, staleTime);
          inflightByKey.delete(queryKey);
        }
      })();

      inflightByKey.set(queryKey, run);
      return run;
    },
    [
      enabled,
      entry?.data,
      hasData,
      queryFn,
      queryKey,
      setData,
      setError,
      setFetching,
      stale,
      staleTime,
    ],
  );

  useEffect(() => {
    if (!enabled || !refetchOnMount) return;
    if (didInitialFetchRef.current) return;
    didInitialFetchRef.current = true;
    void refetch();
  }, [enabled, refetch, refetchOnMount]);

  const error = entry?.error ?? localError;
  const isFetching = Boolean(entry?.isFetching);
  const loading = isFetching && !hasData;

  return {
    data: entry?.data as TData | undefined,
    error,
    loading,
    isFetching,
    stale,
    updatedAt: entry?.updatedAt ?? 0,
    refetch,
  };
}
