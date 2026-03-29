-- Migration 047: Admin-Profilfelder fuer Logto-Synchronisierung

SET search_path TO booking, public;

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'de';
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS logto_user_id TEXT;

UPDATE admin_users
SET language = COALESCE(NULLIF(TRIM(language), ''), 'de')
WHERE language IS NULL OR TRIM(language) = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_logto_user_id
  ON admin_users (logto_user_id)
  WHERE logto_user_id IS NOT NULL;
