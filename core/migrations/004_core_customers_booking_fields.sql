-- ═══════════════════════════════════════════════════════════════════════════
-- 004_core_customers_booking_fields.sql
-- Ergänzt core.customers um Buchungstool-spezifische Felder,
-- damit das Booking-Tool ohne Code-Änderungen direkt auf core.customers
-- zugreifen kann (via search_path=booking,core,public).
-- Alle Spalten haben DEFAULT '' bzw. NULL – bestehende Zeilen werden
-- nicht verändert.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO core, public;

-- Anrede / Vorname (Buchungstool-spezifisch)
ALTER TABLE core.customers
  ADD COLUMN IF NOT EXISTS salutation       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS first_name       TEXT NOT NULL DEFAULT '',

-- Erweiterte Adressfelder
  ADD COLUMN IF NOT EXISTS address_addon_1  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_addon_2  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_addon_3  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS po_box           TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zip              TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city             TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country          TEXT NOT NULL DEFAULT 'Schweiz',

-- Zusätzliche Telefonnummern
  ADD COLUMN IF NOT EXISTS phone_2          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_mobile     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_fax        TEXT NOT NULL DEFAULT '',

-- Web / Exxas
  ADD COLUMN IF NOT EXISTS website          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exxas_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS exxas_address_id  TEXT,

-- NAS-Ordnerpfade (Buchungstool-spezifisch)
  ADD COLUMN IF NOT EXISTS nas_customer_folder_base TEXT,
  ADD COLUMN IF NOT EXISTS nas_raw_folder_base      TEXT;

-- Index auf exxas_customer_id für schnelle Lookups
CREATE INDEX IF NOT EXISTS idx_core_customers_exxas_customer_id
  ON core.customers (exxas_customer_id)
  WHERE exxas_customer_id IS NOT NULL;
