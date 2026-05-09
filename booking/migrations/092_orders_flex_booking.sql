-- Migration 092: Flexible Buchung mit Deadline (Disposition durch Office)
-- Additive Erweiterungen: neue Spalten + Status, kein UPDATE/DELETE auf orders.
--
-- Hintergrund: booking.propus.ch erlaubt heute nur Fix-Termine. Neue Variante
-- "flexible" lässt den Kunden eine Deadline (spätestes Datum) und optional ein
-- frühestes Datum angeben. Beim Buchen wird KEIN Slot geblockt; Disposition
-- wählt später Fotograf/Termin und schaltet den Status nach 'confirmed'.
--
-- Fix-Flow bleibt unverändert: booking_kind DEFAULT 'fixed', alle bestehenden
-- Aufträge erhalten 'fixed' implizit über den DEFAULT.

-- 1. booking_kind (Diskriminator: fixed | flexible)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS booking_kind TEXT NOT NULL DEFAULT 'fixed';

-- CHECK auf booking_kind erst hinzufügen, falls nicht vorhanden.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_booking_kind_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_booking_kind_chk
      CHECK (booking_kind IN ('fixed','flexible'));
  END IF;
END $$;

-- 2. Deadline und frühestens-ab für flexible Buchungen
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS flexible_earliest_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN orders.booking_kind IS
  'Buchungsart: fixed = fester Termin (Slot beim Buchen geblockt), flexible = Disposition durch Office innerhalb [flexible_earliest_at, deadline_at].';
COMMENT ON COLUMN orders.deadline_at IS
  'Spätestes Aufnahmedatum (nur bei booking_kind=flexible Pflicht).';
COMMENT ON COLUMN orders.flexible_earliest_at IS
  'Frühestmögliches Aufnahmedatum bei booking_kind=flexible (optional). Wenn gesetzt, muss < deadline_at sein.';

-- 3. Status-CHECK um disposition_offen erweitern (idempotent durch Drop+Create).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'provisional',
    'disposition_offen',
    'confirmed',
    'paused',
    'completed',
    'done',
    'cancelled',
    'archived'
  ));

-- 4. Konsistenz-CHECK: Datum entsprechend booking_kind gesetzt.
--    fixed    → schedule->>'date' nicht leer
--    flexible → deadline_at nicht NULL und (falls gesetzt) flexible_earliest_at < deadline_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_booking_kind_dates_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_booking_kind_dates_chk
      CHECK (
        (
          booking_kind = 'fixed'
          AND COALESCE(NULLIF(schedule->>'date',''), NULL) IS NOT NULL
        )
        OR (
          booking_kind = 'flexible'
          AND deadline_at IS NOT NULL
          AND (flexible_earliest_at IS NULL OR flexible_earliest_at < deadline_at)
        )
      ) NOT VALID;

    -- Bestehende Zeilen NICHT validieren (NOT VALID) — alle Altdatensätze sind
    -- 'fixed' und sollten den CHECK eigentlich erfüllen, aber ein leerer
    -- schedule->>'date' bei Legacy-Stornos darf den Migrations-Lauf nicht
    -- blockieren. Neue Inserts werden voll geprüft.
  END IF;
END $$;

-- 5. Performance-Index: Disposition-Queue, sortiert nach Deadline.
CREATE INDEX IF NOT EXISTS idx_orders_deadline_disposition
  ON orders (deadline_at)
  WHERE booking_kind = 'flexible' AND status = 'disposition_offen';
