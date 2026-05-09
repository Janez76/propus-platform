import { cn } from "../../lib/utils";

/**
 * Liefert (jahr, monat, tag) eines Date-Objekts in Europe/Zurich.
 * Engine-stabil via `Intl.DateTimeFormat.formatToParts` — anders als
 * `toLocaleDateString("en-CA")`, dessen Output zwischen Browsern variieren
 * kann (Firefox liefert teilweise `M/D/YYYY` statt ISO).
 */
function chDateParts(d: Date): { y: number; m: number; day: number } | null {
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  const y = Number(get("year"));
  const m = Number(get("month"));
  const day = Number(get("day"));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(day)) return null;
  return { y, m, day };
}

/**
 * Vorzeichen-behaftete Differenz in Kalendertagen bis Deadline (Europe/Zurich):
 *  - positiv: Deadline in zukünftigen Kalendertagen
 *  - 0:       Deadline ist heute
 *  - negativ: Deadline überfällig
 *
 * Vergleicht Mitternacht-zu-Mitternacht in CH-Zeitzone via `Date.UTC`, damit
 * keine Engine-spezifische Locale-Format-Annahme nötig ist.
 */
function daysUntil(deadlineIso: string): number | null {
  if (!deadlineIso) return null;
  const target = chDateParts(new Date(deadlineIso));
  const today = chDateParts(new Date());
  if (!target || !today) return null;
  const targetMidnight = Date.UTC(target.y, target.m - 1, target.day);
  const todayMidnight = Date.UTC(today.y, today.m - 1, today.day);
  return Math.round((targetMidnight - todayMidnight) / (24 * 60 * 60 * 1000));
}

/** Formatiert das Deadline-Datum (de-CH). */
function formatDate(deadlineIso: string): string {
  try {
    const d = new Date(deadlineIso);
    if (!Number.isFinite(d.getTime())) return deadlineIso;
    return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return deadlineIso;
  }
}

/**
 * Farb-codiertes Badge mit Restzeit zur Deadline.
 *  - rot:  weniger als 7 Tage
 *  - gelb: weniger als 14 Tage
 *  - neutral: ab 14 Tagen
 */
export function DeadlineBadge({ deadlineAt, className }: { deadlineAt: string | null | undefined; className?: string }) {
  if (!deadlineAt) return null;
  const days = daysUntil(deadlineAt);
  if (days === null) return null;

  let tone = "bg-zinc-500/15 text-zinc-700 border-zinc-500/30 dark:text-zinc-300";
  if (days < 7) {
    tone = "bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400";
  } else if (days < 14) {
    tone = "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-400";
  }

  const label = days < 0
    ? (days === -1 ? "Überfällig (1 Tag)" : `Überfällig (${Math.abs(days)} Tage)`)
    : days === 0
    ? "Heute fällig"
    : days === 1
      ? "Morgen fällig"
      : `Noch ${days} Tage`;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        tone,
        className,
      )}
      title={`Deadline: ${formatDate(deadlineAt)}`}
    >
      {label}
    </span>
  );
}
