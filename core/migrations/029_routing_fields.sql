-- Migration 029: Routing-Felder + Assignment-Trace + Earliest-Departure
-- Voraussetzung: Migrationen 000–028 erfolgreich

-- Koordinaten der Buchungsadresse (für Fahrzeit-Berechnung zwischen Kunden)
ALTER TABLE booking.orders
  ADD COLUMN IF NOT EXISTS address_lat  double precision,
  ADD COLUMN IF NOT EXISTS address_lon  double precision;

-- Vergabe-Begründung (decisionTrace aus resolveAnyPhotographer)
ALTER TABLE booking.orders
  ADD COLUMN IF NOT EXISTS assignment_trace jsonb;

-- Index für same-day proximity Abfragen
CREATE INDEX IF NOT EXISTS idx_orders_photographer_date
  ON booking.orders (photographer_key, schedule_date)
  WHERE status IN ('confirmed', 'provisional');

-- Früheste Abfahrtszeit pro Mitarbeiter (globaler Fallback für slot-generator)
ALTER TABLE booking.photographer_settings
  ADD COLUMN IF NOT EXISTS earliest_departure TEXT;

-- Routing Settings (Standardwerte – können im Admin überschrieben werden)
INSERT INTO settings (key, value, description) VALUES
  ('routing.provider', '"google"', 'google | osrm | haversine')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('routing.googleApiKey', '""', 'Google Maps Distance Matrix API Key')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('routing.trafficModel', '"pessimistic"', 'Modell für interne Puffer-Berechnung')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('routing.trafficModelDisplay', '"best_guess"', 'Modell für Slot-Anzeige im Buchungsformular')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('routing.cacheHours', '6', 'Cache-TTL in Stunden')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('routing.timeoutMs', '2000', 'Timeout pro Fallback-Stufe in ms')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description) VALUES
  ('scheduling.minBufferMinutes', '30', 'Mindestpuffer zwischen zwei Einsätzen')
ON CONFLICT (key) DO NOTHING;

-- Rollback (nur ausführen wenn keine Daten geschrieben wurden):
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS address_lat;
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS address_lon;
-- ALTER TABLE booking.orders DROP COLUMN IF EXISTS assignment_trace;
-- ALTER TABLE booking.photographer_settings DROP COLUMN IF EXISTS earliest_departure;
-- DROP INDEX IF EXISTS idx_orders_photographer_date;
