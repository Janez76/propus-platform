-- Bildauswahl wird auf das existierende Listing-Schema vereinheitlicht:
-- eine Tabelle `tour_manager.galleries`, eine Spalte `kind` unterscheidet
-- 'listing' und 'bildauswahl'. Das parallele Schema aus Migration 066
-- (bildauswahl_galleries/_images/_feedback/_email_templates) wird wieder
-- entfernt — es enthielt produktiv keine Daten.

-- 1) galleries um Bildauswahl-spezifische Felder ergänzen
ALTER TABLE tour_manager.galleries
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'listing',
  ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS picdrop_selection_json TEXT,
  ADD COLUMN IF NOT EXISTS client_log_selection_sent_at TIMESTAMPTZ;

ALTER TABLE tour_manager.galleries
  DROP CONSTRAINT IF EXISTS galleries_kind_check;
ALTER TABLE tour_manager.galleries
  ADD CONSTRAINT galleries_kind_check CHECK (kind IN ('listing', 'bildauswahl'));

CREATE INDEX IF NOT EXISTS idx_galleries_kind ON tour_manager.galleries (kind);

-- gallery_feedback um Picdrop-Selection-Flaggen ergänzen (Bildauswahl).
ALTER TABLE tour_manager.gallery_feedback
  ADD COLUMN IF NOT EXISTS selection_flags_json TEXT;

-- 2) gallery_email_templates um kind ergänzen — Listing-Templates bekommen
--    kind='listing', neue Bildauswahl-Templates kind='bildauswahl'.
ALTER TABLE tour_manager.gallery_email_templates
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'listing';

ALTER TABLE tour_manager.gallery_email_templates
  DROP CONSTRAINT IF EXISTS gallery_email_templates_kind_check;
ALTER TABLE tour_manager.gallery_email_templates
  ADD CONSTRAINT gallery_email_templates_kind_check CHECK (kind IN ('listing', 'bildauswahl'));

INSERT INTO tour_manager.gallery_email_templates (id, name, subject, body, is_default, kind) VALUES
  ('propus-bildauswahl-invite-v1',         'Bildauswahl: Kunden-Einladung',    '', '', TRUE,  'bildauswahl'),
  ('propus-bildauswahl-admin-notify-v1',   'Bildauswahl: Admin-Benachrichtigung', '', '', FALSE, 'bildauswahl'),
  ('propus-bildauswahl-followup-v1',       'Bildauswahl: Rückfrage',           '', '', FALSE, 'bildauswahl'),
  ('propus-bildauswahl-revision-done-v1',  'Bildauswahl: Revision behoben',    '', '', FALSE, 'bildauswahl')
ON CONFLICT (id) DO NOTHING;

-- 3) Migration 066 zurückrollen — die parallelen Tabellen werden nicht mehr
--    benötigt. Sie wurden in 066 angelegt, enthielten aber bisher 0 Zeilen
--    in Production (PR 1 von Bildauswahl ist nie regelmäßig befüllt worden).
DROP TABLE IF EXISTS tour_manager.bildauswahl_feedback;
DROP TABLE IF EXISTS tour_manager.bildauswahl_images;
DROP TABLE IF EXISTS tour_manager.bildauswahl_email_templates;
DROP TABLE IF EXISTS tour_manager.bildauswahl_galleries;
