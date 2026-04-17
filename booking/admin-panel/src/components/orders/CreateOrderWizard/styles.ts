import { cn } from "../../../lib/utils";

export const INPUT_CLASS = cn(
  "w-full rounded-lg border px-3 py-2 text-sm transition-colors",
  "bg-[var(--surface)]",
  "border-[var(--border-soft)]",
  "text-[var(--text-main)]",
  "placeholder:text-[var(--text-subtle)]",
  "hover:border-[var(--border-soft)]",
  "focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)]",
);

export const LABEL_CLASS =
  "block text-xs font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1.5";

export const SECTION_CLASS =
  "rounded-xl border border-[var(--border-soft)] bg-[var(--surface)] p-5";

export const SECTION_TITLE_CLASS =
  "flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)] mb-4";
