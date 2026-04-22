/**
 * Wenn "Nachname" den vollständigen Namen enthält (z. B. "Richard A. Lüdi") und Vorname leer ist.
 */
export function suggestSplitName(firstEmpty: string, lastRaw: string): { first: string; last: string } | null {
  const first = (firstEmpty || "").trim();
  if (first.length > 0) return null;
  const last = (lastRaw || "").trim();
  if (last.length < 2) return null;
  const parts = last.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  // Erste "Wort" mit Punkt/Mehrfach-Token: behandle erstes Wort + Rest
  return { first: parts[0], last: parts.slice(1).join(" ") };
}
