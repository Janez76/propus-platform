-- Migration 043: products.kind um 'extra' erweitern
-- 'package'  = Pakete (Highlight-Karten im Frontend)
-- 'addon'    = Zusatzprodukte
-- 'service'  = Dienstleistungen (eigenständige Hauptleistung)
-- 'extra'    = Extras

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_kind_check;

ALTER TABLE products
  ADD CONSTRAINT products_kind_check
  CHECK (kind IN ('package', 'addon', 'service', 'extra'));

-- service_categories.kind_scope ebenfalls erweitern
ALTER TABLE service_categories
  DROP CONSTRAINT IF EXISTS service_categories_kind_scope_check;

ALTER TABLE service_categories
  ADD CONSTRAINT service_categories_kind_scope_check
  CHECK (kind_scope IN ('package', 'addon', 'service', 'extra', 'both'));
