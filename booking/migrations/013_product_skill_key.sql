-- Migration 013: products.skill_key Spalte
-- Ermöglicht die direkte Zuordnung eines Skill-Schlüssels (foto/drohne/video/matterport)
-- zu einem Produkt, damit der Fotograf-Resolver weiss welche Skills benötigt werden.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS skill_key TEXT NOT NULL DEFAULT '';

-- Bestehende Produkte automatisch befüllen anhand group_key
UPDATE products SET skill_key = 'video'      WHERE skill_key = '' AND group_key IN ('groundVideo', 'droneVideo');
UPDATE products SET skill_key = 'drohne'     WHERE skill_key = '' AND group_key IN ('dronePhoto', 'droneVideo');
UPDATE products SET skill_key = 'matterport' WHERE skill_key = '' AND group_key IN ('tour', 'floorplans');
