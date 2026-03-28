-- Migration 027: products.kind um 'service' (Hauptprodukt / Dienstleistung) erweitern
-- 'package' = Kombi-Paket (Highlight-Karten im Frontend)
-- 'service' = eigenständige Dienstleistung (Hauptprodukt, kein Paket)
-- 'addon'   = Zusatzprodukt

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_kind_check;

ALTER TABLE products
  ADD CONSTRAINT products_kind_check
  CHECK (kind IN ('package', 'addon', 'service'));
