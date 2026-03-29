import { create } from "zustand";

const STORAGE_KEY = "admin.dbFieldHints.override";

type DbHintsState = {
  /** null = use backend setting; true/false = local override */
  override: boolean | null;
  setOverride: (value: boolean | null) => void;
  toggle: (currentEffective: boolean) => void;
};

function loadStored(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export const useDbHintsStore = create<DbHintsState>((set) => ({
  override: loadStored(),
  setOverride: (value) => {
    if (typeof window !== "undefined") {
      if (value === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    }
    set({ override: value });
  },
  toggle: (currentEffective: boolean) =>
    set(() => {
      const next = !currentEffective;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      }
      return { override: next };
    }),
}));
