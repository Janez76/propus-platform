-- Bildauswahl (Selekto/Picdrop) — server-backed Gegenstueck zur Listing-Galerie.
-- Spiegelt das Modell aus 028_listing_galleries.sql + 031_gallery_links.sql +
-- 032_gallery_nas_sources.sql, lässt aber Listing-spezifische Felder (Matterport,
-- Video, Floorplans) weg und ergaenzt Picdrop-spezifische Spalten.

CREATE TABLE IF NOT EXISTS tour_manager.bildauswahl_galleries (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                            TEXT NOT NULL UNIQUE,
  friendly_slug                   TEXT,
  title                           TEXT NOT NULL DEFAULT '',
  address                         TEXT,
  client_name                     TEXT,
  client_email                    TEXT,
  client_contact                  TEXT,
  client_delivery_status          TEXT NOT NULL DEFAULT 'open',
  client_delivery_sent_at         TIMESTAMPTZ,
  client_log_email_received_at    TIMESTAMPTZ,
  client_log_gallery_opened_at    TIMESTAMPTZ,
  client_log_selection_sent_at    TIMESTAMPTZ,
  status                          TEXT NOT NULL DEFAULT 'inactive',
  cloud_share_url                 TEXT,
  watermark_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  /** Kompakter Picdrop-Entwurf (auto-saved). */
  picdrop_selection_json          TEXT,
  /** Verknuepfungen — gleich modelliert wie galleries (Migration 031). */
  customer_id                     INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  customer_contact_id             INTEGER REFERENCES core.customer_contacts(id) ON DELETE SET NULL,
  booking_order_no                INTEGER REFERENCES booking.orders(order_no) ON DELETE SET NULL,
  /** NAS-Quelle — gleich modelliert wie galleries (Migration 032). */
  storage_source_type             TEXT,
  storage_root_kind               TEXT,
  storage_relative_path           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bildauswahl_galleries_friendly_slug
  ON tour_manager.bildauswahl_galleries (friendly_slug)
  WHERE friendly_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bildauswahl_galleries_status
  ON tour_manager.bildauswahl_galleries (status);

CREATE INDEX IF NOT EXISTS idx_bildauswahl_galleries_customer_id
  ON tour_manager.bildauswahl_galleries (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bildauswahl_galleries_booking_order_no
  ON tour_manager.bildauswahl_galleries (booking_order_no)
  WHERE booking_order_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bildauswahl_galleries_storage_source_type
  ON tour_manager.bildauswahl_galleries (storage_source_type)
  WHERE storage_source_type IS NOT NULL;

-- Bilder
CREATE TABLE IF NOT EXISTS tour_manager.bildauswahl_images (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id        UUID NOT NULL REFERENCES tour_manager.bildauswahl_galleries(id) ON DELETE CASCADE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  category          TEXT,
  file_name         TEXT,
  remote_src        TEXT,
  source_type       TEXT,
  source_root_kind  TEXT,
  source_path       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bildauswahl_images_gallery
  ON tour_manager.bildauswahl_images (gallery_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_bildauswahl_images_source_type
  ON tour_manager.bildauswahl_images (source_type)
  WHERE source_type IS NOT NULL;

-- Kunden-Feedback: pro markiertem Bild ein Eintrag mit Picdrop-Flaggen + Kommentar
CREATE TABLE IF NOT EXISTS tour_manager.bildauswahl_feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id            UUID NOT NULL REFERENCES tour_manager.bildauswahl_galleries(id) ON DELETE CASCADE,
  gallery_slug          TEXT NOT NULL,
  asset_key             TEXT NOT NULL,
  asset_label           TEXT NOT NULL DEFAULT '',
  body                  TEXT NOT NULL DEFAULT '',
  author                TEXT NOT NULL DEFAULT 'client' CHECK (author IN ('client', 'office')),
  /** JSON-Array Picdrop-Flaggen: ["bearbeiten","staging","retusche"] */
  selection_flags_json  TEXT,
  revision              INTEGER NOT NULL DEFAULT 0,
  resolved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bildauswahl_feedback_gallery
  ON tour_manager.bildauswahl_feedback (gallery_id);

-- E-Mail-Vorlagen: Kunden-Einladung, Picdrop-Admin-Notify, Followup, Revision-Done
CREATE TABLE IF NOT EXISTS tour_manager.bildauswahl_email_templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tour_manager.bildauswahl_email_templates (id, name, subject, body, is_default) VALUES
  ('propus-bildauswahl-invite-v1',         'Kunden-Einladung',                 'Ihre Bildauswahl – {{title}}',                  '', TRUE),
  ('propus-bildauswahl-admin-notify-v1',   'Admin: Bildauswahl eingegangen',   'Neue Bildauswahl eingegangen',                  '', FALSE),
  ('propus-bildauswahl-followup-v1',       'Rückfrage (Kommentar)',            'Rückfrage zu Ihrer Anmerkung – {{title}}',      '', FALSE),
  ('propus-bildauswahl-revision-done-v1',  'Revision behoben',                 'Anmerkung umgesetzt – {{title}}',               '', FALSE)
ON CONFLICT (id) DO NOTHING;
