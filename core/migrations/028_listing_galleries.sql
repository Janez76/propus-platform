-- Listing-Page / Galerie-Modul: Tabellen fuer Galerien, Bilder, Feedback, E-Mail-Vorlagen

-- Haupttabelle: Galerien (Listings)
CREATE TABLE IF NOT EXISTS tour_manager.galleries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL DEFAULT '',
  address       TEXT,
  client_name   TEXT,
  client_email  TEXT,
  client_delivery_status TEXT NOT NULL DEFAULT 'open',
  client_delivery_sent_at TIMESTAMPTZ,
  client_log_email_received_at TIMESTAMPTZ,
  client_log_gallery_opened_at TIMESTAMPTZ,
  client_log_files_downloaded_at TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'inactive',
  matterport_input TEXT,
  cloud_share_url TEXT,
  video_url     TEXT,
  floor_plans_json TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_galleries_slug ON tour_manager.galleries (slug);
CREATE INDEX IF NOT EXISTS idx_galleries_status ON tour_manager.galleries (status);

-- Galerie-Bilder (nur remote_src-basiert, kein Blob-Storage)
CREATE TABLE IF NOT EXISTS tour_manager.gallery_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id  UUID NOT NULL REFERENCES tour_manager.galleries(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  category    TEXT,
  file_name   TEXT,
  remote_src  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_images_gallery ON tour_manager.gallery_images (gallery_id, sort_order);

-- E-Mail-Vorlagen (3 feste IDs: listing, followup, revision-done)
CREATE TABLE IF NOT EXISTS tour_manager.gallery_email_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kunden-Feedback / Revisionen
CREATE TABLE IF NOT EXISTS tour_manager.gallery_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id    UUID NOT NULL REFERENCES tour_manager.galleries(id) ON DELETE CASCADE,
  gallery_slug  TEXT NOT NULL,
  asset_type    TEXT NOT NULL CHECK (asset_type IN ('image', 'floor_plan')),
  asset_key     TEXT NOT NULL,
  asset_label   TEXT NOT NULL DEFAULT '',
  body          TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT 'client' CHECK (author IN ('client', 'office')),
  revision      INTEGER NOT NULL DEFAULT 0,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gallery_feedback_gallery ON tour_manager.gallery_feedback (gallery_id);

-- Seed: Default-E-Mail-Vorlagen
INSERT INTO tour_manager.gallery_email_templates (id, name, subject, body, is_default)
VALUES
  ('propus-listing-email-v1', 'Listing / Magic Link', 'Ihre Immobilien-Medien sind bereit', '', TRUE),
  ('propus-email-followup-v1', 'Rückfrage (Kommentar)', 'Rückfrage zu Ihrer Anmerkung – {{title}}', '', FALSE),
  ('propus-email-revision-done-v1', 'Revision behoben', 'Anmerkung umgesetzt – {{title}}', '', FALSE)
ON CONFLICT (id) DO NOTHING;
