-- Migration 055: Buchungs-Wizard Sichtbarkeit + Profilbild-URL pro Mitarbeiter

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS bookable BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';
