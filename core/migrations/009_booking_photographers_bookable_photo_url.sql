-- ═══════════════════════════════════════════════════════════════════════════
-- 009_booking_photographers_bookable_photo_url.sql
-- Ergaenzt booking.photographers um bookable + photo_url (vgl. booking/migrations/055).
-- core/migrate.js wendet nur core/migrations an; ohne diese Scripts fehlen Spalten,
-- wenn die DB nur ueber das Compose-Profil "migrate" oder fruehere 002-Staende entstand.
-- Ergaenzungen: 010 (active), 011 (photographer_settings Admin-Spalten).
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE booking.photographers
  ADD COLUMN IF NOT EXISTS bookable BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE booking.photographers
  ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';
