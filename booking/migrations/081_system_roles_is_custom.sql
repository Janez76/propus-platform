-- Migration 081: Neue Spalte is_custom in system_roles
-- Ermöglicht das Unterscheiden zwischen System-Rollen (unveränderlich) und
-- nutzerdefinierten Rollen (können erstellt + gelöscht werden).

ALTER TABLE system_roles
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;
