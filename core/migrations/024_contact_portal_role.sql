-- Migration 024: portal_role für customer_contacts
-- Speichert die explizite Portalrolle eines Kontakts (company_owner, company_admin,
-- company_employee, customer_admin, customer_user). Wird beim Sync zu company_members
-- verwendet statt der heuristischen Ableitung aus dem Freitextfeld "role".

ALTER TABLE core.customer_contacts
  ADD COLUMN IF NOT EXISTS portal_role TEXT NOT NULL DEFAULT 'company_employee';
