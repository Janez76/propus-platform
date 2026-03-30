-- Propus-Kundennummer (reine Zahl oder Exxas-Referenz als Text)
SET search_path TO core, public;

ALTER TABLE core.customers
  ADD COLUMN IF NOT EXISTS customer_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_customers_number
  ON core.customers (customer_number)
  WHERE customer_number IS NOT NULL;

-- Bestehende Exxas-Referenzen als Kundennummer übernehmen
UPDATE core.customers
  SET customer_number = exxas_contact_id
  WHERE customer_number IS NULL AND exxas_contact_id IS NOT NULL;
