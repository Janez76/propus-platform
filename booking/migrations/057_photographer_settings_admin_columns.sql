-- Admin-Mitarbeiterdialog: Spalten, die im Core-Schema in CREATE stehen, aber bei aelteren
-- Installationen fehlen koennen (CREATE TABLE IF NOT EXISTS erweitert bestehende Tabellen nicht).
-- Behebt u.a. HTTP 500 bei PUT /api/admin/photographers/:key/settings (Spalte existiert nicht).

ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS languages JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS native_language TEXT NOT NULL DEFAULT 'de';

ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS event_color TEXT NOT NULL DEFAULT '#3b82f6';

ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
