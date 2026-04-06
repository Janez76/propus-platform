-- Migration 066: company_admin deprecaten — Einträge zu company_owner oder company_employee migrieren
-- Die Rolle bleibt technisch in system_roles erhalten, wird aber nicht mehr vergeben.
--
-- Logik:
--   Schritt 1: Firmen ohne aktiven company_owner aber mit mind. einem company_admin
--              -> Der älteste (niedrigste id) company_admin wird zu company_owner befördert
--              -> Damit hat jede Firma weiterhin einen Hauptkontakt
--   Schritt 2: Alle verbleibenden company_admin -> company_employee

-- Schritt 1: Firmen ohne company_owner -> ältester company_admin wird company_owner
UPDATE company_members cm
SET role = 'company_owner', updated_at = NOW()
WHERE cm.role = 'company_admin'
  AND cm.id = (
    SELECT MIN(id) FROM company_members
    WHERE company_id = cm.company_id AND role = 'company_admin'
  )
  AND NOT EXISTS (
    SELECT 1 FROM company_members o
    WHERE o.company_id = cm.company_id
      AND o.role = 'company_owner'
      AND o.status = 'active'
  );

-- Schritt 2: Alle verbleibenden company_admin -> company_employee
UPDATE company_members
SET role = 'company_employee', updated_at = NOW()
WHERE role = 'company_admin';
