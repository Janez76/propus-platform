import { create } from "zustand";

export type QueryEntry<TData = unknown> = {
  data?: TData;
  error: string | null;
  updatedAt: number;
  staleTime: number;
  isFetching: boolean;
  isInvalidated: boolean;
};

type QueryStoreState = {
  queries: Record<string, QueryEntry>;
  setFetching: (key: string, isFetching: boolean, staleTime?: number) => void;
  setData: <TData>(key: string, data: TData, staleTime?: number) => void;
  setError: (key: string, error: string, staleTime?: number) => void;
  updateData: <TData>(key: string, updater: (current: TData | undefined) => TData, staleTime?: number) => void;
  invalidate: (key: string) => void;
  invalidatePrefix: (prefix: string) => void;
  clear: (key: string) => void;
};

const DEFAULT_STALE_TIME = 5 * 60 * 1000;

function ensureEntry(
  queries: Record<string, QueryEntry>,
  key: string,
  staleTime: number,
): QueryEntry {
  return (
    queries[key] ?? {
      data: undefined,
      error: null,
      updatedAt: 0,
      staleTime,
      isFetching: false,
      isInvalidated: false,
    }
  );
}

export function isQueryStale(entry: QueryEntry | undefined, now = Date.now()) {
  if (!entry) return true;
  if (entry.isInvalidated) return true;
  if (entry.updatedAt <= 0) return true;
  return now - entry.updatedAt >= entry.staleTime;
}

export const useQueryStore = create<QueryStoreState>((set) => ({
  queries: {},

  setFetching: (key, isFetching, staleTime = DEFAULT_STALE_TIME) =>
    set((state) => {
      const next = ensureEntry(state.queries, key, staleTime);
      return {
        queries: {
          ...state.queries,
          [key]: {
            ...next,
            staleTime,
            isFetching,
          },
        },
      };
    }),

  setData: (key, data, staleTime = DEFAULT_STALE_TIME) =>
    set((state) => {
      const next = ensureEntry(state.queries, key, staleTime);
      return {
        queries: {
          ...state.queries,
          [key]: {
            ...next,
            data,
            error: null,
            updatedAt: Date.now(),
            staleTime,
            isFetching: false,
            isInvalidated: false,
          },
        },
      };
    }),

  setError: (key, error, staleTime = DEFAULT_STALE_TIME) =>
    set((state) => {
      const next = ensureEntry(state.queries, key, staleTime);
      return {
        queries: {
          ...state.queries,
          [key]: {
            ...next,
            error,
            staleTime,
            isFetching: false,
          },
        },
      };
    }),

  updateData: (key, updater, staleTime = DEFAULT_STALE_TIME) =>
    set((state) => {
      const next = ensureEntry(state.queries, key, staleTime);
      const current = next.data as unknown;
      return {
        queries: {
          ...state.queries,
          [key]: {
            ...next,
            data: updater(current as never),
            error: null,
            updatedAt: Date.now(),
            staleTime,
            isInvalidated: false,
          },
        },
      };
    }),

  invalidate: (key) =>
    set((state) => {
      const existing = state.queries[key];
      if (!existing) return state;
      return {
        queries: {
          ...state.queries,
          [key]: {
            ...existing,
            isInvalidated: true,
            updatedAt: 0,
          },
        },
      };
    }),

  invalidatePrefix: (prefix) =>
    set((state) => {
      const nextQueries: Record<string, QueryEntry> = {};
      let changed = false;
      for (const [key, entry] of Object.entries(state.queries)) {
        if (key.startsWith(prefix)) {
          nextQueries[key] = { ...entry, isInvalidated: true, updatedAt: 0 };
          changed = true;
        } else {
          nextQueries[key] = entry;
        }
      }
      return changed ? { queries: nextQueries } : state;
    }),

  clear: (key) =>
    set((state) => {
      if (!(key in state.queries)) return state;
      const nextQueries = { ...state.queries };
      delete nextQueries[key];
      return { queries: nextQueries };
    }),
}));
