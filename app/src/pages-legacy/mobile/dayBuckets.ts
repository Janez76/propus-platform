/**
 * Day-Bucketing-Helper fuer Mobile-Orders-Redesign.
 *
 * Klassifiziert Auftraege nach Tagesgruppe basierend auf `appointmentDate`:
 *   - today    – heute, sortiert nach Uhrzeit
 *   - tomorrow – morgen, sortiert nach Uhrzeit
 *   - week     – 2..7 Tage in der Zukunft
 *   - later    – >7 Tage, ohne Termin oder Datum in der Vergangenheit ohne `done`
 *
 * Logik bewusst klein und seiteneffekt-frei, damit es auch im Calendar-Tab
 * wiederverwendet werden kann (siehe Plan Phase 5).
 */
import type { Order } from "../../api/orders";

export type DayBucket = "today" | "tomorrow" | "week" | "later";

export interface BucketedOrder {
  order: Order;
  /** ISO-Timestamp ms des Termins (0 wenn unbekannt). */
  ts: number;
  /** HH:MM oder leerstring. */
  time: string;
}

export interface BucketedDay {
  bucket: DayBucket;
  /** Sortiert nach Termin-Zeit aufsteigend. */
  items: BucketedOrder[];
  /** Summe der Totals (CHF). */
  totalSum: number;
}

const HIDDEN_STATUSES = new Set(["closed"]);

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function classify(ts: number, now: Date): DayBucket {
  if (!ts) return "later";
  const today0 = startOfDay(now);
  const tomorrow0 = today0 + 24 * 60 * 60 * 1000;
  const weekEnd = today0 + 7 * 24 * 60 * 60 * 1000;
  if (ts >= today0 && ts < tomorrow0) return "today";
  if (ts >= tomorrow0 && ts < tomorrow0 + 24 * 60 * 60 * 1000) return "tomorrow";
  if (ts > tomorrow0 && ts < weekEnd) return "week";
  return "later";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" });
}

export interface BucketOrdersOptions {
  /** Override fuer Tests. Default: jetzt. */
  now?: Date;
  /** Statuses die ganz ausgeblendet werden (z.B. "closed"). Default: nur "closed". */
  hideStatuses?: Set<string>;
}

/**
 * Gruppiert Orders in 4 Tagesbuckets. Reihenfolge der zurueckgegebenen Days:
 * `today, tomorrow, week, later`. Leere Buckets werden NICHT ausgefiltert
 * — Caller entscheidet (z.B. "Tag frei"-Empty-State in der UI).
 */
export function bucketOrdersByDay(
  orders: Order[],
  options: BucketOrdersOptions = {},
): BucketedDay[] {
  const now = options.now ?? new Date();
  const hide = options.hideStatuses ?? HIDDEN_STATUSES;

  const buckets: Record<DayBucket, BucketedOrder[]> = {
    today: [],
    tomorrow: [],
    week: [],
    later: [],
  };

  for (const order of orders) {
    if (hide.has(order.status)) continue;
    const ts = order.appointmentDate ? new Date(order.appointmentDate).getTime() : 0;
    const time = order.appointmentDate ? fmtTime(order.appointmentDate) : "";
    const b = classify(Number.isFinite(ts) ? ts : 0, now);
    buckets[b].push({ order, ts: Number.isFinite(ts) ? ts : 0, time });
  }

  // Sortierung: today/tomorrow/week aufsteigend, later absteigend (juengste zuerst).
  for (const k of ["today", "tomorrow", "week"] as const) {
    buckets[k].sort((a, b) => a.ts - b.ts);
  }
  buckets.later.sort((a, b) => b.ts - a.ts);

  return (["today", "tomorrow", "week", "later"] as const).map((bucket) => ({
    bucket,
    items: buckets[bucket],
    totalSum: buckets[bucket].reduce((s, x) => s + (x.order.total || 0), 0),
  }));
}

const DAY_LABELS: Record<DayBucket, string> = {
  today: "Heute",
  tomorrow: "Morgen",
  week: "Diese Woche",
  later: "Spaeter / Ohne Termin",
};

export function bucketLabel(bucket: DayBucket, date: Date = new Date()): string {
  if (bucket === "today" || bucket === "tomorrow") {
    const d = new Date(date);
    if (bucket === "tomorrow") d.setDate(d.getDate() + 1);
    const human = d.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long" });
    return `${DAY_LABELS[bucket]} · ${human}`;
  }
  return DAY_LABELS[bucket];
}

/** Zwei-Zeichen-Tag/Monat-Badge ("07 / MAI") fuer Section-Header. */
export function bucketBadge(bucket: DayBucket, date: Date = new Date()): { day: string; month: string } {
  const months = ["JAN", "FEB", "MAR", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];
  if (bucket === "today") {
    return { day: String(date.getDate()).padStart(2, "0"), month: months[date.getMonth()] };
  }
  if (bucket === "tomorrow") {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    return { day: String(d.getDate()).padStart(2, "0"), month: months[d.getMonth()] };
  }
  if (bucket === "week") return { day: "📅", month: "" };
  return { day: "···", month: "" };
}
