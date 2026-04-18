-- Migration 039: API-Token-Generator (General API Keys)
--
-- Langlebige, revozierbare API-Tokens fuer Integrationen, CI-Jobs und externe Tools.
-- Erzeugt durch Admins mit Permission `api_keys.manage` im Settings-UI.
--
-- Speichert nur SHA-256-Hash des Tokens; Klartext wird dem User einmalig nach
-- Erstellung angezeigt (wie GitHub/Stripe). Tokens vererben die Permissions
-- des erstellenden Admin-Users (keine Custom-Scopes im ersten Wurf).

CREATE TABLE IF NOT EXISTS core.api_keys (
  id            BIGSERIAL PRIMARY KEY,
  label         TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  prefix        TEXT NOT NULL,
  created_by    BIGINT REFERENCES core.admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_keys_token_hash_idx
  ON core.api_keys(token_hash);

CREATE INDEX IF NOT EXISTS api_keys_active_idx
  ON core.api_keys(revoked_at)
  WHERE revoked_at IS NULL;
