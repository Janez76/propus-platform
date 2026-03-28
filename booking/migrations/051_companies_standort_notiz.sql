-- Optionale Meta-Felder fuer Admin-Benutzerverwaltung (Standort, interne Notiz)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS standort TEXT NOT NULL DEFAULT '';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS notiz TEXT NOT NULL DEFAULT '';
