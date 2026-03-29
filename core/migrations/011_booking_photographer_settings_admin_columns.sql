-- ═══════════════════════════════════════════════════════════════════════════
-- 011_booking_photographer_settings_admin_columns.sql
-- Admin-Dialog / Legacy-DBs: Spalten wie booking/migrations/057, schema-qualifiziert.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE booking.photographer_settings
  ADD COLUMN IF NOT EXISTS languages JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE booking.photographer_settings
  ADD COLUMN IF NOT EXISTS native_language TEXT NOT NULL DEFAULT 'de';

ALTER TABLE booking.photographer_settings
  ADD COLUMN IF NOT EXISTS event_color TEXT NOT NULL DEFAULT '#3b82f6';

ALTER TABLE booking.photographer_settings
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
