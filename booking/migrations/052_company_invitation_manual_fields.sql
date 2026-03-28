-- Optionale Profilfelder fuer manuelle Admin-Erfassung (Vorname, Nachname, Login)
ALTER TABLE company_invitations ADD COLUMN IF NOT EXISTS given_name TEXT NOT NULL DEFAULT '';
ALTER TABLE company_invitations ADD COLUMN IF NOT EXISTS family_name TEXT NOT NULL DEFAULT '';
ALTER TABLE company_invitations ADD COLUMN IF NOT EXISTS login_name TEXT NOT NULL DEFAULT '';
