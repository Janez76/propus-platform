-- Migration 018: orders.customer_id FK auf ON DELETE SET NULL ändern
-- Beim Löschen eines Kunden wird customer_id in orders auf NULL gesetzt
-- statt einen Foreign-Key-Fehler zu werfen.

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;

ALTER TABLE orders
  ADD CONSTRAINT orders_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES core.customers(id) ON DELETE SET NULL;
