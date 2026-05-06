-- bexio Contact-ID Cache auf customers, damit kb_order-Anlegen keine
-- redundanten Lookups gegen bexio macht. Befüllung erfolgt lazy beim
-- ersten kb_order-Anlegen (bexio-sales-order.js: resolveBexioContactId).

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS bexio_contact_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_bexio_contact_id
  ON customers (bexio_contact_id)
  WHERE TRIM(COALESCE(bexio_contact_id, '')) <> '';
