-- Migration 043: Admin-Impersonation (Kunden-Vorschau) – Metadaten in admin_sessions
ALTER TABLE booking.admin_sessions
  ADD COLUMN IF NOT EXISTS impersonator_user_key TEXT,
  ADD COLUMN IF NOT EXISTS impersonator_started_at TIMESTAMPTZ;

COMMENT ON COLUMN booking.admin_sessions.impersonator_user_key IS
  'Bei Kunden-Impersonation: user_key des echten Intern-Admins; sonst NULL.';
COMMENT ON COLUMN booking.admin_sessions.impersonator_started_at IS
  'Zeitpunkt des Startes der Impersonation; sonst NULL.';
