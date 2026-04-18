import { useEffect, useRef, useState } from "react";

export type Density = "compact" | "comfy" | "spacious";

export type DashRowId = "r-hero" | "r-kpi" | "r-today" | "r-pipeline" | "r-bottom";

export type DashTileId =
  | "greeting"
  | "productivity"
  | "kpi-revenue"
  | "kpi-bookings"
  | "kpi-open"
  | "kpi-due"
  | "kpi-receivables"
  | "timeline"
  | "tasks"
  | "pipeline"
  | "funnel"
  | "heatmap"
  | "activity";

export interface DashState {
  hidden: DashTileId[];
  rowOrder: DashRowId[];
  tileOrder: Record<DashRowId, DashTileId[]>;
  density: Density;
  editMode: boolean;
  hideDone: boolean;
}

export const DEFAULT_STATE: DashState = {
  hidden: [],
  rowOrder: ["r-hero", "r-kpi", "r-today", "r-pipeline", "r-bottom"],
  tileOrder: {
    "r-hero": ["greeting", "productivity"],
    "r-kpi": ["kpi-revenue", "kpi-bookings", "kpi-open", "kpi-due", "kpi-receivables"],
    "r-today": ["timeline", "tasks"],
    "r-pipeline": ["pipeline"],
    "r-bottom": ["funnel", "heatmap", "activity"],
  },
  density: "comfy",
  editMode: false,
  hideDone: false,
};

const LS_KEY = "propus-dash-v1";

function clone(state: DashState): DashState {
  return {
    ...state,
    hidden: [...state.hidden],
    rowOrder: [...state.rowOrder],
    tileOrder: Object.fromEntries(
      Object.entries(state.tileOrder).map(([k, v]) => [k, [...v]]),
    ) as Record<DashRowId, DashTileId[]>,
  };
}

export function loadDashState(): DashState {
  if (typeof window === "undefined") return clone(DEFAULT_STATE);
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return clone(DEFAULT_STATE);
    const parsed = JSON.parse(raw) as Partial<DashState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      tileOrder: { ...DEFAULT_STATE.tileOrder, ...(parsed.tileOrder ?? {}) },
    };
  } catch {
    return clone(DEFAULT_STATE);
  }
}

export function saveDashState(state: DashState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private-mode errors
  }
}

export function useDashState() {
  const [state, setState] = useState<DashState>(() => loadDashState());
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    saveDashState(state);
  }, [state]);

  return [state, setState] as const;
}

export const DENSITY_GAPS: Record<Density, string> = {
  compact: "10px",
  comfy: "14px",
  spacious: "20px",
};
export const DENSITY_PADDING: Record<Density, string> = {
  compact: "14px 16px",
  comfy: "18px 20px",
  spacious: "24px 26px",
};
