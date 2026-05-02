-- ═══════════════════════════════════════════════════════════════════════════
-- 053_relax_exxas_customer_uniqueness.sql
-- 
-- Entfernt die Unique-Constraints auf exxas_customer_id und exxas_address_id,
-- damit mehrere Propus-Kunden denselben Exxas-Kunden teilen können.
--
-- Grund: Konzernstrukturen wie CSL Immobilien AG (Mutter) + Nextkey (Tochter)
-- haben mehrere Ansprechpartner in Propus, die aber über einen zentralen
-- Exxas-Kunden abgerechnet werden. Die Unique-Constraints haben dieses
-- legitime Setup blockiert.
--
-- Ersetzt Unique-Indizes durch normale (Performance-)Indizes.
-- ═══════════════════════════════════════════════════════════════════════════

-- Entferne Unique-Indizes
DROP INDEX IF EXISTS core.uq_customers_exxas_customer_id;
DROP INDEX IF EXISTS core.uq_customers_exxas_address_id;

-- Erstelle normale Indizes für Performance (falls noch nicht vorhanden)
CREATE INDEX IF NOT EXISTS idx_customers_exxas_customer_id 
  ON core.customers(exxas_customer_id) 
  WHERE exxas_customer_id IS NOT NULL AND TRIM(exxas_customer_id) <> '';

CREATE INDEX IF NOT EXISTS idx_customers_exxas_address_id 
  ON core.customers(exxas_address_id) 
  WHERE exxas_address_id IS NOT NULL AND TRIM(exxas_address_id) <> '';
