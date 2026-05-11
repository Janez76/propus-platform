/** Helpers rund um BKBN-Aufträge (Backbone Photo) — Anzeige/Legende. */

export const BKBN_DEFAULT_COLOR = "#ea580c";

/** "ivan.mijajlovic@propus.ch" → "Ivan" (Fallback: ganze Adresse). */
export function bkbnShortName(mailbox?: string | null): string {
  const local = String(mailbox || "").split("@")[0] || "";
  const first = local.split(/[._-]+/).filter(Boolean)[0] || local;
  if (!first) return String(mailbox || "");
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export type BkbnLegendEntry = { mailbox: string; name: string; color: string };

/** Eindeutige Postfach→Farbe-Liste aus BKBN-Events (Reihenfolge = erstes Vorkommen). */
export function bkbnLegend(
  events: ReadonlyArray<{ mailbox?: string | null; color?: string | null; type?: string; source?: string }>,
): BkbnLegendEntry[] {
  const seen = new Map<string, string>();
  for (const e of events) {
    if (e.type !== "bkbn" && e.source !== "bkbn") continue;
    const mb = String(e.mailbox || "").trim();
    if (!mb || seen.has(mb)) continue;
    seen.set(mb, String(e.color || BKBN_DEFAULT_COLOR));
  }
  return [...seen.entries()].map(([mailbox, color]) => ({ mailbox, name: bkbnShortName(mailbox), color }));
}
