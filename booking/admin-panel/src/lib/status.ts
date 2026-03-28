import { Clock, Pause, CheckCircle, Check, CheckCheck, X, Archive, Circle, CalendarClock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  Clock, Pause, CheckCircle, Check, CheckCheck, X, Archive, Circle, CalendarClock,
};

/**
 * Interne Status-Keys (englisch, DB-stabil).
 * Labels sind immer deutsch – siehe STATUS_MAP.
 */
export type StatusKey =
  | "pending"
  | "provisional"
  | "confirmed"
  | "paused"
  | "completed"
  | "done"
  | "cancelled"
  | "archived";

export type StatusEntry = {
  label: string;
  badgeClass: string;
  barColor: string;
  eventColor: string;
  iconName: string;
};

/**
 * Single Source of Truth für alle Status-Labels und -Styles.
 * Reihenfolge entspricht der kanonischen UI-Reihenfolge (DoD B).
 * Interne Keys englisch, Labels deutsch.
 */
export const STATUS_MAP: Record<string, StatusEntry> = {
  pending: {
    label: "Ausstehend",
    badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-700 border border-amber-500/30",
    barColor: "bg-amber-500",
    eventColor: "#f59e0b",
    iconName: "Clock",
  },
  provisional: {
    label: "Termin provisorisch gebucht",
    badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-violet-500/15 text-violet-600 border border-violet-500/30",
    barColor: "bg-violet-500",
    eventColor: "#8b5cf6",
    iconName: "CalendarClock",
  },
  confirmed: {
    label: "Best\u00E4tigt",
    badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-blue-500/15 text-blue-600 border border-blue-500/30",
    barColor: "bg-blue-500",
    eventColor: "#3b82f6",
    iconName: "CheckCircle",
  },
  paused: {
    label: "Pausiert",
    badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
    barColor: "bg-zinc-500",
    eventColor: "#71717a",
    iconName: "Pause",
  },
  completed: {
    label: "Erledigt",
    badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-teal-500/15 text-teal-600 border border-teal-500/30",
    barColor: "bg-teal-500",
    eventColor: "#14b8a6",
    iconName: "Check",
  },
  done: {
    label: "Abgeschlossen",
    badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-600 border border-emerald-500/30",
    barColor: "bg-emerald-500",
    eventColor: "#10b981",
    iconName: "CheckCheck",
  },
  cancelled: {
    label: "Storniert",
    badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-red-500/15 text-red-600 border border-red-500/30",
    barColor: "bg-red-500",
    eventColor: "#ef4444",
    iconName: "X",
  },
  archived: {
    label: "Archiviert",
    badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-500/15 text-slate-500 border border-slate-500/30",
    barColor: "bg-slate-400",
    eventColor: "#94a3b8",
    iconName: "Archive",
  },
};

/**
 * Kanonische Reihenfolge für Dropdowns/Filter/Badges (DoD B).
 */
export const STATUS_KEYS: StatusKey[] = [
  "pending",
  "provisional",
  "confirmed",
  "paused",
  "completed",
  "done",
  "archived",
  "cancelled",
];

/**
 * Rückwärtskompatibles Mapping alter englischer Statuswerte auf kanonische Keys.
 * Keine DB-Änderung nötig – nur für Anzeige/Filter (DoD B).
 */
const LEGACY_KEY_MAP: Record<string, StatusKey> = {
  // alte Werte → kanonischer Key
  ausstehend: "pending",
  "termin provisorisch gebucht": "provisional",
  "best\u00E4tigt": "confirmed",
  pausiert: "paused",
  erledigt: "completed",
  abgeschlossen: "done",
  storniert: "cancelled",
  archiviert: "archived",
};

/**
 * Normalisiert einen beliebigen Statuswert (alt oder neu) auf den kanonischen Key.
 * Ermöglicht Filter, die alte + neue Werte gleich behandeln.
 */
export function normalizeStatusKey(raw: string | undefined | null): StatusKey | null {
  const key = (raw || "").toLowerCase().trim();
  if (!key) return null;
  if (key in STATUS_MAP) return key as StatusKey;
  if (key in LEGACY_KEY_MAP) return LEGACY_KEY_MAP[key];
  return null;
}

/**
 * Gibt true wenn zwei Statuswerte (alt/neu) denselben kanonischen Status meinen.
 * Für Filter: filterValue kommt aus Dropdown (kanonisch), orderStatus aus DB (ggf. alt).
 */
export function statusMatches(orderStatus: string | undefined | null, filterKey: string): boolean {
  if (filterKey === "all") return true;
  const normalized = normalizeStatusKey(orderStatus);
  return normalized === filterKey;
}

/**
 * Erlaubte Statusübergänge (Zielmatrix DoD C).
 * Spiegelt backend/state-machine.js.
 */
export const ALLOWED_TRANSITIONS: Record<StatusKey, StatusKey[]> = {
  pending:     ["provisional", "confirmed", "paused", "cancelled", "archived", "done", "completed"],
  provisional: ["confirmed", "paused", "cancelled"],
  confirmed:   ["completed", "done", "paused", "cancelled"],
  paused:      ["pending", "provisional", "cancelled"],
  completed:   ["done", "archived"],
  done:        ["archived"],
  cancelled:   ["archived", "pending"],
  archived:    ["pending"],
};

/**
 * Gibt die erlaubten Ziel-Status für einen gegebenen Status zurück.
 * Unterstützt auch Legacy-Werte als Ausgangsstatus.
 */
export function getAllowedTransitions(fromStatus: string): StatusKey[] {
  const key = normalizeStatusKey(fromStatus) ?? (fromStatus as StatusKey);
  return ALLOWED_TRANSITIONS[key] ?? [];
}

const FALLBACK: StatusEntry = {
  label: "Unbekannt",
  badgeClass: "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-zinc-500/15 text-zinc-400 border border-zinc-500/30",
  barColor: "bg-zinc-500",
  eventColor: "#71717a",
  iconName: "Circle",
};

export function getStatusEntry(key: string | undefined | null): StatusEntry {
  const normalized = normalizeStatusKey(key);
  return (normalized ? STATUS_MAP[normalized] : null) ?? FALLBACK;
}

export function getStatusLabel(key: string | undefined | null): string {
  return getStatusEntry(key).label;
}

export function getStatusBadgeClass(key: string | undefined | null): string {
  return getStatusEntry(key).badgeClass;
}

export function getStatusBarColor(key: string | undefined | null): string {
  return getStatusEntry(key).barColor;
}

export function getStatusEventColor(key: string | undefined | null): string {
  return getStatusEntry(key).eventColor;
}

export function getStatusIcon(key: string | undefined | null): LucideIcon {
  return ICON_MAP[getStatusEntry(key).iconName] ?? Circle;
}
