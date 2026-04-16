-- 038_gallery_friendly_slug.sql
-- Fügt eine zusätzliche, leserliche Slug-Spalte für /listing/<plz>-<ort>-<ordernr> URLs hinzu.
-- Die bestehende `slug`-Spalte bleibt als Fallback und für Alt-Links bestehen.

ALTER TABLE tour_manager.galleries
  ADD COLUMN IF NOT EXISTS friendly_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_galleries_friendly_slug
  ON tour_manager.galleries (friendly_slug)
  WHERE friendly_slug IS NOT NULL;
