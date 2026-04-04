-- Galerie-Modul: persistente NAS-Quellen und lokale Medienpfade

ALTER TABLE tour_manager.galleries
  ADD COLUMN IF NOT EXISTS storage_source_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_root_kind TEXT,
  ADD COLUMN IF NOT EXISTS storage_relative_path TEXT,
  ADD COLUMN IF NOT EXISTS video_source_type TEXT,
  ADD COLUMN IF NOT EXISTS video_source_root_kind TEXT,
  ADD COLUMN IF NOT EXISTS video_source_path TEXT;

ALTER TABLE tour_manager.gallery_images
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_root_kind TEXT,
  ADD COLUMN IF NOT EXISTS source_path TEXT;

CREATE INDEX IF NOT EXISTS idx_galleries_storage_source_type
  ON tour_manager.galleries (storage_source_type)
  WHERE storage_source_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gallery_images_source_type
  ON tour_manager.gallery_images (source_type)
  WHERE source_type IS NOT NULL;
