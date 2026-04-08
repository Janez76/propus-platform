-- Migration 071: Google Business Profile OAuth-Tokens
-- Speichert den OAuth Refresh/Access Token fuer die GBP-API-Anbindung.
-- Max. 1 Zeile (singleton via id=1).

CREATE TABLE IF NOT EXISTS gbp_oauth_tokens (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  account_id    TEXT,
  location_id   TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE gbp_oauth_tokens IS
  'Singleton-Tabelle (max. 1 Zeile) fuer Google Business Profile OAuth-Tokens.';
COMMENT ON COLUMN gbp_oauth_tokens.account_id IS
  'GBP-Account-Ressourcenname, z.B. accounts/123456789';
COMMENT ON COLUMN gbp_oauth_tokens.location_id IS
  'GBP-Location-Ressourcenname, z.B. accounts/123456789/locations/987654321';
