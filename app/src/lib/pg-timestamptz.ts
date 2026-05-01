/**
 * Werte für Postgres `timestamptz` müssen ISO-8601 sein.
 * `String(new Date())` liefert z. B. "Fri May 01 2026 …" → PG: invalid input syntax for type timestamp.
 */
export function normalizeTimestamptzParam(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
