CREATE TABLE IF NOT EXISTS tour_manager.assistant_mobile_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT 'assistant.read',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assistant_mobile_tokens_hash
  ON tour_manager.assistant_mobile_tokens(token_hash)
  WHERE revoked_at IS NULL;
