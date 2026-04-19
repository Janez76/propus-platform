-- Migration 032: admin_users Tabelle fuer lokale Admin-Verwaltung (SSO-Abloesung fuer Admin-Login)
-- Ermoeglicht mehrere Admin-Accounts ohne externen Identity-Provider.

CREATE TABLE IF NOT EXISTS admin_users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indizes nur auf der physischen Tabelle; nach core/migrations/040 ist
-- booking.admin_users ein VIEW — dort sind keine Indizes erlaubt.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'booking'
      AND c.relname = 'admin_users'
      AND c.relkind = 'r'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_admin_users_username ON booking.admin_users (username);
    CREATE INDEX IF NOT EXISTS idx_admin_users_email ON booking.admin_users (email) WHERE email IS NOT NULL;
  END IF;
END $$;
