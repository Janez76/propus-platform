-- Migration 012: photographers.active Spalte
-- Ermoeglicht das Deaktivieren von Mitarbeitern ohne Datenverlust

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
