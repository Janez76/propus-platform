import type { Lang } from "../i18n";
import { t } from "../i18n";

export type TerminKind = "overdue" | "today" | "tomorrow" | "soon" | "later" | "none";

export type TerminInfo = {
  kind: TerminKind;
  /** Volltext für den farbigen Pill (z. B. "heute · 15:30"). */
  label: string;
  /** Graues Absolute-Datum (z. B. "Mo 20.04.2026"). */
  absLabel: string;
  /** Ganzzahlige Tagesdifferenz (heute = 0, morgen = 1, gestern = -1). */
  dayDiff: number;
  /** Roher Date falls benötigt. */
  date: Date | null;
};

const SHORT_WEEKDAY_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const SHORT_WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_WEEKDAY_FR = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const SHORT_WEEKDAY_IT = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

function shortWeekday(lang: Lang, d: Date): string {
  const map = lang === "en" ? SHORT_WEEKDAY_EN : lang === "fr" ? SHORT_WEEKDAY_FR : lang === "it" ? SHORT_WEEKDAY_IT : SHORT_WEEKDAY_DE;
  return map[d.getDay()] ?? "";
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDateShort(d: Date): string {
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dayDiffFrom(now: Date, target: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function getTerminInfo(iso: string | null | undefined, lang: Lang, now: Date = new Date()): TerminInfo {
  if (!iso) {
    return {
      kind: "none",
      label: t(lang, "orders.termin.none"),
      absLabel: "",
      dayDiff: Number.NaN,
      date: null,
    };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return {
      kind: "none",
      label: t(lang, "orders.termin.none"),
      absLabel: "",
      dayDiff: Number.NaN,
      date: null,
    };
  }

  const diff = dayDiffFrom(now, d);
  const time = formatTime(d);
  const absLabel = `${shortWeekday(lang, d)} ${formatDateShort(d)}`;

  let kind: TerminKind;
  let label: string;

  if (diff < 0) {
    kind = "overdue";
    const days = Math.abs(diff);
    label = t(lang, days === 1 ? "orders.termin.overdueOne" : "orders.termin.overdueMany").replace("{{days}}", String(days));
  } else if (diff === 0) {
    kind = "today";
    label = t(lang, "orders.termin.today").replace("{{time}}", time);
  } else if (diff === 1) {
    kind = "tomorrow";
    label = t(lang, "orders.termin.tomorrow").replace("{{time}}", time);
  } else if (diff <= 7) {
    kind = "soon";
    label = t(lang, "orders.termin.inDays")
      .replace("{{days}}", String(diff))
      .replace("{{weekday}}", shortWeekday(lang, d))
      .replace("{{time}}", time);
  } else {
    kind = "later";
    label = `${shortWeekday(lang, d)} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}., ${time}`;
  }

  return { kind, label, absLabel, dayDiff: diff, date: d };
}

export function terminKindClasses(kind: TerminKind): string {
  switch (kind) {
    case "overdue":
      return "bg-red-500/15 text-red-600 border border-red-500/30";
    case "today":
      return "bg-amber-500/15 text-amber-600 border border-amber-500/30";
    case "tomorrow":
      return "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] text-[var(--accent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)]";
    case "soon":
      return "bg-blue-500/15 text-blue-600 border border-blue-500/30";
    case "later":
      return "bg-zinc-500/10 text-zinc-500 border border-zinc-500/25";
    case "none":
    default:
      return "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20";
  }
}

export function startOfWeek(date: Date, weekStartsOnMonday = true): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = weekStartsOnMonday ? (day === 0 ? -6 : 1 - day) : -day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isoWeek(date: Date): number {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function avatarInitials(name?: string | null): string {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stabile Farbe aus einem Key/Namen — deterministisch. */
export function avatarColorFor(key?: string | null): { bg: string; fg: string } {
  const palette: Array<{ bg: string; fg: string }> = [
    { bg: "rgba(74,222,128,.18)", fg: "#4ade80" },
    { bg: "rgba(167,139,250,.18)", fg: "#a78bfa" },
    { bg: "rgba(96,165,250,.18)", fg: "#60a5fa" },
    { bg: "rgba(244,114,182,.18)", fg: "#f472b6" },
    { bg: "rgba(251,146,60,.18)", fg: "#fb923c" },
    { bg: "rgba(45,212,191,.18)", fg: "#2dd4bf" },
  ];
  const s = String(key || "").toLowerCase();
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}
