import { cn } from "../../lib/utils";

/** Restzeit bis Deadline in Tagen (gerundet auf ganze Tage, nie negativ). */
function daysUntil(deadlineIso: string): number | null {
  if (!deadlineIso) return null;
  const t = new Date(deadlineIso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = t - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
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

  const label = days === 0
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
