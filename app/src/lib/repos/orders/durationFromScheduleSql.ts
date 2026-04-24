/**
 * schedule->>'durationMin' aus JSON: sicherer Cast (kein Abbruch bei "abc" oder "15.0").
 * o.* = Alias `o` in JOINs, bare = Tabelle `booking.orders` ohne Alias.
 */
export const DURATION_MIN_FROM_SCHEDULE = {
  o: `CASE
  WHEN (o.schedule->>'durationMin') ~ '^[0-9]+$' THEN (o.schedule->>'durationMin')::int
  WHEN (o.schedule->>'durationMin') ~ '^[0-9]+\\.[0-9]+$' THEN ROUND((o.schedule->>'durationMin')::numeric, 0)::int
  ELSE NULL
END`,
  bare: `CASE
  WHEN (schedule->>'durationMin') ~ '^[0-9]+$' THEN (schedule->>'durationMin')::int
  WHEN (schedule->>'durationMin') ~ '^[0-9]+\\.[0-9]+$' THEN ROUND((schedule->>'durationMin')::numeric, 0)::int
  ELSE NULL
END`,
} as const;
