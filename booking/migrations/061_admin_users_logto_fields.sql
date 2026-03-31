-- Migration 061: booking.admin_users um Logto-Felder ergänzen
-- (falls Migration 047 nicht bereits alle Felder gesetzt hat)

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS phone             TEXT,
  ADD COLUMN IF NOT EXISTS language          TEXT NOT NULL DEFAULT 'de',
  ADD COLUMN IF NOT EXISTS logto_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_photo_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_at     TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_logto_user_id
  ON admin_users (logto_user_id)
  WHERE logto_user_id IS NOT NULL;

-- Logto-User-IDs aus core.admin_users zurück-synchronisieren
-- (falls Migration 018 in core bereits gelaufen ist)
UPDATE admin_users bu
SET logto_user_id = cu.logto_user_id
FROM core.admin_users cu
WHERE LOWER(bu.email) = cu.email
  AND cu.logto_user_id IS NOT NULL
  AND bu.logto_user_id IS NULL;
