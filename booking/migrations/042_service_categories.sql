CREATE TABLE IF NOT EXISTS service_categories (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind_scope  TEXT NOT NULL DEFAULT 'addon' CHECK (kind_scope IN ('package', 'addon', 'both')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_key TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_products_category_key ON products(category_key);
CREATE INDEX IF NOT EXISTS idx_service_categories_kind_active_sort ON service_categories(kind_scope, active, sort_order, key);

INSERT INTO service_categories (key, name, description, kind_scope, sort_order, active)
VALUES
  ('package', 'Pakete', 'Komplette Leistungspakete', 'package', 10, TRUE),
  ('camera', 'Camera Shooting', '', 'addon', 110, TRUE),
  ('dronePhoto', 'Drone Shooting', '', 'addon', 210, TRUE),
  ('tour', '360° Tour', '', 'addon', 310, TRUE),
  ('keypickup', 'Schlüsselabholung', '', 'addon', 320, TRUE),
  ('floorplans', 'Floor Plans', '', 'addon', 410, TRUE),
  ('groundVideo', 'Ground Video', '', 'addon', 510, TRUE),
  ('droneVideo', 'Drone Video', '', 'addon', 530, TRUE),
  ('staging', 'Staging', '', 'addon', 610, TRUE),
  ('express', 'Express', '', 'addon', 710, TRUE)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  kind_scope = EXCLUDED.kind_scope,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  updated_at = NOW();

UPDATE products
SET category_key = COALESCE(NULLIF(TRIM(category_key), ''), group_key, '')
WHERE COALESCE(NULLIF(TRIM(category_key), ''), '') = '';
