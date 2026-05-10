-- 064_customer_login_tokens.sql — Self-Serve Magic-Link Login fuer Kunden
--
-- Speichert Single-Use-Tokens, die per Mail an den Kunden gehen. Bei Einlosen
-- wird ein core.customer_sessions-Eintrag erzeugt (genauso wie beim klassischen
-- Passwort-Login in POST /api/customer/login).
--
-- Trennung von core.customer_sessions: Sessions sind langlebig (7-30 Tage),
-- Login-Tokens sind kurzlebig (15 Min) und genau einmal verwendbar.

SET search_path TO core, public;

CREATE TABLE IF NOT EXISTS core.customer_login_tokens (
  id           BIGSERIAL PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  purpose      TEXT NOT NULL DEFAULT 'login'
                 CHECK (purpose IN ('login','invite')),
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_ip   INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_customer_login_tokens_customer
  ON core.customer_login_tokens(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_core_customer_login_tokens_expires
  ON core.customer_login_tokens(expires_at)
  WHERE consumed_at IS NULL;
