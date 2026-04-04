-- Migration 029: Routing-Felder + Assignment-Trace + Earliest-Departure
-- Voraussetzung: Migrationen 000–028 erfolgreich

-- Koordinaten der Buchungsadresse (für Fahrzeit-Berechnung zwischen Kunden)
ALTER TABLE booking.orders
  ADD COLUMN IF NOT EXISTS address_lat  double precision,
  ADD COLUMN IF NOT EXISTS address_lon  double precision;

-- Vergabe-Begründung (decisionTrace aus resolveAnyPhotographer)
ALTER TABLE booking.orders
  ADD COLUMN IF NOT EXISTS assignment_trace jsonb;

-- Generierte Spalten aus JSONB (werden von booking/db.js als echte Spalten erwartet)
ALTER TABLE booking.orders
  ADD COLUMN IF NOT EXISTS photographer_key TEXT GENERATED ALWAYS AS (photographer->>'key') STORED;

ALTER TABLE booking.orders
  ADD COLUMN IF NOT EXISTS schedule_date TEXT GENERATED ALWAYS AS (schedule->>'date') STORED;

ALTER TABLE booking.orders
  ADD COLUMN IF NOT EXISTS schedule_time TEXT GENERATED ALWAYS AS (schedule->>'time') STORED;

-- Index für same-day proximity Abfragen
CREATE INDEX IF NOT EXISTS idx_orders_photographer_date
  ON booking.orders (photographer_key, schedule_date)
  WHERE status IN ('confirmed', 'provisional');

-- Früheste Abfahrtszeit pro Mitarbeiter (globaler Fallback für slot-generator)
ALTER TABLE booking.photographer_settings
  ADD COLUMN IF NOT EXISTS earliest_departure TEXT;

-- Routing-Defaults werden über booking/settings-defaults.js bereitgestellt
-- (getSetting-Resolver: DB → settings-defaults.js → inline-Fallback)

-- Rollback (nur ausführen wenn keine Daten geschrieben wurden):
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS address_lat;
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS address_lon;
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS assignment_trace;
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS photographer_key;
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS schedule_date;
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS schedule_time;
-- ALTER TABLE booking.photographer_settings DROP COLUMN IF EXISTS earliest_departure;
-- DROP INDEX IF EXISTS idx_orders_photographer_date;
