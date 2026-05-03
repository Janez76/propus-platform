-- ═══════════════════════════════════════════════════════════════════════════
-- 055_orders_order_no_sequence.sql
--
-- Postgres-Sequence fuer booking.orders.order_no, ersetzt MAX(order_no)+1
-- in der Application-Layer.
--
-- Hintergrund (Bug-Hunt T02 HIGH):
--   `duplicate-actions.ts` allokiert die naechste Bestell-Nummer per
--   `SELECT COALESCE(MAX(order_no), 0) + 1`. Zwei parallele Aufrufe sehen
--   denselben MAX-Wert, beide INSERTs greifen den gleichen `order_no`-Wert,
--   einer scheitert am UNIQUE-Constraint (sporadischer 500). Eine
--   Postgres-Sequence ist atomar und liefert garantiert eindeutige Werte.
--
-- Migrations-Strategie:
--   1. Sequence anlegen, START mit MAX(order_no)+1 damit existierende Daten
--      nicht kollidieren.
--   2. ALTER COLUMN order_no SET DEFAULT nextval(...) — neue Inserts ohne
--      explizites order_no bekommen automatisch die naechste Nummer.
--   3. Sequence "owned by" Spalte, damit DROP COLUMN auch die Sequence
--      entfernt.
--
-- Application-Code (siehe duplicate-actions.ts):
--   Anstatt `INSERT … (order_no, …) VALUES ($1, …)` und vorher MAX-Lookup:
--   `INSERT … (status, …) VALUES (…) RETURNING order_no` — Sequence
--   uebernimmt die Allokation.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  start_val BIGINT;
BEGIN
  SELECT COALESCE(MAX(order_no), 0) + 1 INTO start_val FROM booking.orders;

  -- CREATE SEQUENCE ist nicht idempotent → IF NOT EXISTS via DO-Block.
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S' AND c.relname = 'orders_order_no_seq' AND n.nspname = 'booking'
  ) THEN
    EXECUTE format(
      'CREATE SEQUENCE booking.orders_order_no_seq AS BIGINT START WITH %s',
      start_val
    );
  ELSE
    -- Sequence existiert schon (z.B. nach Re-Run): auf MAX+1 setzen, falls
    -- zwischenzeitlich manuelle Inserts den Counter ueberholt haben.
    EXECUTE format(
      'SELECT setval(''booking.orders_order_no_seq''::regclass, GREATEST(%s, last_value)) FROM booking.orders_order_no_seq',
      start_val
    );
  END IF;
END $$;

-- Default auf nextval setzen (idempotent)
ALTER TABLE booking.orders
  ALTER COLUMN order_no SET DEFAULT nextval('booking.orders_order_no_seq');

-- Sequence an Spalte koppeln (idempotent, ALTER ist ok bei wiederholtem Lauf)
ALTER SEQUENCE booking.orders_order_no_seq OWNED BY booking.orders.order_no;

COMMENT ON SEQUENCE booking.orders_order_no_seq IS
  'Atomic order_no-Allokation. Ersetzt MAX(order_no)+1 in duplicate-actions.ts (Bug-Hunt T02 HIGH).';
