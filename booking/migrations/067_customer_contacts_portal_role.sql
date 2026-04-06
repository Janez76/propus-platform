-- Migration 067: portal_role Spalte auf customer_contacts sicher hinzufügen
-- Die Spalte wird im Backend-Code (customer-contacts-routes.js) bereits verwendet,
-- fehlte aber bisher in den versionierten Migrationen.

ALTER TABLE customer_contacts
  ADD COLUMN IF NOT EXISTS portal_role TEXT NOT NULL DEFAULT 'company_employee';
