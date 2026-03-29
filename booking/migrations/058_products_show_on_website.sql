ALTER TABLE products
  ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN products.show_on_website IS
  'Steuert, ob ein aktives Produkt im oeffentlichen Firmenwebsite-Katalog erscheint.';
