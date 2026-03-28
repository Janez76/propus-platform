-- Persistente EXXAS-Zuordnung fuer Kunden/Kontakte, um Abgleiche idempotent zu machen.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS exxas_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS exxas_address_id TEXT;

ALTER TABLE customer_contacts
  ADD COLUMN IF NOT EXISTS exxas_contact_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_exxas_customer_id
  ON customers (exxas_customer_id)
  WHERE TRIM(COALESCE(exxas_customer_id, '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_exxas_address_id
  ON customers (exxas_address_id)
  WHERE TRIM(COALESCE(exxas_address_id, '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_contacts_exxas_contact_id
  ON customer_contacts (exxas_contact_id)
  WHERE TRIM(COALESCE(exxas_contact_id, '')) <> '';

