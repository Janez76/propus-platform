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

CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_email    ON admin_users(email) WHERE email IS NOT NULL;
