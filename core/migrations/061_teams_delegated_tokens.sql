-- Phase 2 (Microsoft Teams Delegated OAuth):
-- Speichert den delegierten Refresh-/Access-Token für einen Service-User
-- (typischerweise assistant@propus.ch oder js@propus.ch). Der Assistent nutzt
-- diesen Token um in Teams zu schreiben (ChatMessage.Send / ChannelMessage.Send),
-- was mit Application-Permissions nicht möglich ist.
--
-- Tokens sind sensitiv — unbedingt sicherstellen dass diese Tabelle nur für
-- Admin-Rollen lesbar ist und das DB-Backup verschlüsselt erfolgt.

CREATE TABLE IF NOT EXISTS tour_manager.teams_delegated_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_upn TEXT NOT NULL UNIQUE,
  display_name TEXT,
  tenant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authorized_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_teams_delegated_tokens_active
  ON tour_manager.teams_delegated_tokens(service_upn)
  WHERE revoked_at IS NULL;

-- Kurzlebiger Speicher für PKCE-Verifier + State zwischen /oauth/start und /oauth/callback.
-- Einträge älter als 10 Minuten werden ignoriert.
CREATE TABLE IF NOT EXISTS tour_manager.teams_oauth_state (
  state TEXT PRIMARY KEY,
  pkce_verifier TEXT NOT NULL,
  initiated_by TEXT,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teams_oauth_state_created
  ON tour_manager.teams_oauth_state(created_at);
