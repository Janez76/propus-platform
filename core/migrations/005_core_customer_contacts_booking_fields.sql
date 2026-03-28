-- ═══════════════════════════════════════════════════════════════════════════
-- 005_core_customer_contacts_booking_fields.sql
-- Ergänzt core.customer_contacts um Buchungstool-spezifische Felder
-- (salutation, first_name, last_name, phone_direct, phone_mobile,
--  department, exxas_contact_id).
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO core, public;

ALTER TABLE core.customer_contacts
  ADD COLUMN IF NOT EXISTS salutation       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS first_name       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_direct     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_mobile     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS department       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS exxas_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();
