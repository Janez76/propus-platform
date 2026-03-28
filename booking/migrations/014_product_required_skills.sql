-- Migration 014: products.required_skills (Mehrfach-Zuordnung)
-- Erlaubt pro Produkt mehrere benötigte Skills (z.B. droneVideo => drohne + video)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS required_skills JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill aus bestehender skill_key-Spalte
UPDATE products
SET required_skills = CASE
  WHEN skill_key IS NULL OR skill_key = '' THEN required_skills
  ELSE to_jsonb(ARRAY[skill_key]::text[])
END
WHERE required_skills = '[]'::jsonb;

-- Präzisere Backfills nach Produkttyp/Gruppe
UPDATE products SET required_skills = '["video"]'::jsonb
WHERE group_key = 'groundVideo';

UPDATE products SET required_skills = '["drohne"]'::jsonb
WHERE group_key = 'dronePhoto';

UPDATE products SET required_skills = '["drohne","video"]'::jsonb
WHERE group_key = 'droneVideo';

UPDATE products SET required_skills = '["matterport"]'::jsonb
WHERE code = 'floorplans:tour' OR group_key = 'tour';
