const LS_KEY = "propus-dash-v2";

export type DashV2Density = "compact" | "comfy" | "spacious";

export type DashV2SectionId = "alerts" | "overdueList" | "kpi" | "pipeline" | "upcoming" | "tickets" | "mails" | "funnel" | "heatmap" | "perf" | "map";

export interface DashV2Preferences {
  version: 1;
  hidden: DashV2SectionId[];
  density: DashV2Density;
}

export const DEFAULT_DASH_V2: DashV2Preferences = {
  version: 1,
  /** Default: faithful to Claude Design — Funnel, Performance and Overdue-Liste sind ausgeblendet. */
  hidden: ["funnel", "perf", "overdueList"],
  density: "comfy",
};

const ALL_SECTIONS: DashV2SectionId[] = [
  "alerts",
  "overdueList",
  "kpi",
  "pipeline",
  "upcoming",
  "tickets",
  "mails",
  "funnel",
  "heatmap",
  "perf",
  "map",
];

function isSectionId(x: unknown): x is DashV2SectionId {
  return typeof x === "string" && (ALL_SECTIONS as string[]).includes(x);
}

export function loadDashV2Preferences(): DashV2Preferences {
  if (typeof window === "undefined") return { ...DEFAULT_DASH_V2 };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { ...DEFAULT_DASH_V2 };
    const p = JSON.parse(raw) as Partial<DashV2Preferences>;
    const hidden = (Array.isArray(p.hidden) ? p.hidden : []).filter(isSectionId);
    const density: DashV2Density =
      p.density === "compact" || p.density === "comfy" || p.density === "spacious" ? p.density : "comfy";
    return { version: 1, hidden, density };
  } catch {
    return { ...DEFAULT_DASH_V2 };
  }
}

export function saveDashV2Preferences(p: DashV2Preferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}
