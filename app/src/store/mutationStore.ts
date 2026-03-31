import { create } from "zustand";

export type MutationEntry = {
  isPending: boolean;
  error: string | null;
  lastStartedAt: number;
  lastFinishedAt: number;
};

type MutationStoreState = {
  mutations: Record<string, MutationEntry>;
  start: (key: string) => void;
  succeed: (key: string) => void;
  fail: (key: string, error: string) => void;
  reset: (key: string) => void;
};

function emptyEntry(): MutationEntry {
  return {
    isPending: false,
    error: null,
    lastStartedAt: 0,
    lastFinishedAt: 0,
  };
}

export const useMutationStore = create<MutationStoreState>((set) => ({
  mutations: {},

  start: (key) =>
    set((state) => ({
      mutations: {
        ...state.mutations,
        [key]: {
          ...(state.mutations[key] ?? emptyEntry()),
          isPending: true,
          error: null,
          lastStartedAt: Date.now(),
        },
      },
    })),

  succeed: (key) =>
    set((state) => ({
      mutations: {
        ...state.mutations,
        [key]: {
          ...(state.mutations[key] ?? emptyEntry()),
          isPending: false,
          error: null,
          lastFinishedAt: Date.now(),
        },
      },
    })),

  fail: (key, error) =>
    set((state) => ({
      mutations: {
        ...state.mutations,
        [key]: {
          ...(state.mutations[key] ?? emptyEntry()),
          isPending: false,
          error,
          lastFinishedAt: Date.now(),
        },
      },
    })),

  reset: (key) =>
    set((state) => ({
      mutations: {
        ...state.mutations,
        [key]: emptyEntry(),
      },
    })),
}));
