-- Migration 047: Admin-Profilfelder fuer Logto-Synchronisierung
-- Bei booking.admin_users als VIEW (core/migrations/040) entfallen ALTER/Index.

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
    RAISE NOTICE '047: booking.admin_users ist kein Heap — Migration uebersprungen (VIEW/core 040).';
    RETURN;
  END IF;

  ALTER TABLE booking.admin_users ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE booking.admin_users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'de';
  ALTER TABLE booking.admin_users ADD COLUMN IF NOT EXISTS logto_user_id TEXT;

  UPDATE booking.admin_users
  SET language = COALESCE(NULLIF(TRIM(language), ''), 'de')
  WHERE language IS NULL OR TRIM(language) = '';

  CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_logto_user_id
    ON booking.admin_users (logto_user_id)
    WHERE logto_user_id IS NOT NULL;
END $$;
