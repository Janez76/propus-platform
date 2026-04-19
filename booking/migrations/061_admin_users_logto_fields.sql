-- Migration 061: booking.admin_users um Logto-Felder ergänzen
-- Bei VIEW (core 040) entfallen ALTER/Index — Felder kommen aus core.admin_users.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'booking'
      AND c.relname = 'admin_users'
      AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE '061: booking.admin_users ist kein Heap — Migration uebersprungen (VIEW/core 040).';
    RETURN;
  END IF;

  ALTER TABLE booking.admin_users
    ADD COLUMN IF NOT EXISTS phone             TEXT,
    ADD COLUMN IF NOT EXISTS language          TEXT NOT NULL DEFAULT 'de',
    ADD COLUMN IF NOT EXISTS logto_user_id     TEXT,
    ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
    ADD COLUMN IF NOT EXISTS profile_photo_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_login_at     TIMESTAMPTZ;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_logto_user_id
    ON booking.admin_users (logto_user_id)
    WHERE logto_user_id IS NOT NULL;

  UPDATE booking.admin_users bu
  SET logto_user_id = cu.logto_user_id
  FROM core.admin_users cu
  WHERE LOWER(bu.email) = cu.email
    AND cu.logto_user_id IS NOT NULL
    AND bu.logto_user_id IS NULL;
END $$;
