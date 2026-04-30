-- 045_assistant_tables.sql — Propus Assistant (Conversations, Messages, Tool-Calls, Audit)
SET search_path TO tour_manager, core, booking, public;

CREATE TABLE IF NOT EXISTS tour_manager.assistant_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL,
  user_email  TEXT NOT NULL DEFAULT '',
  title       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
  ON tour_manager.assistant_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS tour_manager.assistant_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES tour_manager.assistant_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content         JSONB NOT NULL,
  audio_url       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation
  ON tour_manager.assistant_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS tour_manager.assistant_tool_calls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES tour_manager.assistant_conversations(id) ON DELETE CASCADE,
  message_id      UUID REFERENCES tour_manager.assistant_messages(id) ON DELETE SET NULL,
  tool_name       TEXT NOT NULL,
  input           JSONB NOT NULL,
  output          JSONB,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error')),
  error_message   TEXT,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_tool_calls_conversation
  ON tour_manager.assistant_tool_calls(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assistant_tool_calls_tool_time
  ON tour_manager.assistant_tool_calls(tool_name, created_at DESC);

CREATE TABLE IF NOT EXISTS tour_manager.assistant_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  conversation_id UUID REFERENCES tour_manager.assistant_conversations(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  payload         JSONB NOT NULL,
  ip_address      TEXT,
  user_agent      TEXT,
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_user_time
  ON tour_manager.assistant_audit_log(user_id, executed_at DESC);

CREATE OR REPLACE FUNCTION tour_manager.update_assistant_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tour_manager.assistant_conversations
  SET updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assistant_message_touch ON tour_manager.assistant_messages;
CREATE TRIGGER trg_assistant_message_touch
AFTER INSERT ON tour_manager.assistant_messages
FOR EACH ROW
EXECUTE FUNCTION tour_manager.update_assistant_conversation_timestamp();
