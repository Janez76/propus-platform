-- Propus Assistant — Datenbank-Schema
-- Migration 001: Conversations, Messages, Tool-Calls, Audit
--
-- Ausführen via: psql $DATABASE_URL -f 001_assistant_tables.sql

BEGIN;

CREATE TABLE IF NOT EXISTS assistant_conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    title           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
    ON assistant_conversations(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content         JSONB NOT NULL,
    audio_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation
    ON assistant_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS assistant_tool_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES assistant_messages(id) ON DELETE CASCADE,
    tool_name       TEXT NOT NULL,
    input           JSONB NOT NULL,
    output          JSONB,
    status          TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error')),
    error_message   TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_tool_calls_message
    ON assistant_tool_calls(message_id);

CREATE TABLE IF NOT EXISTS assistant_audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    conversation_id UUID REFERENCES assistant_conversations(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    payload         JSONB NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_user_time
    ON assistant_audit_log(user_id, executed_at DESC);

-- Auto-update für updated_at auf conversations
CREATE OR REPLACE FUNCTION update_assistant_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE assistant_conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assistant_message_touch ON assistant_messages;
CREATE TRIGGER trg_assistant_message_touch
AFTER INSERT ON assistant_messages
FOR EACH ROW
EXECUTE FUNCTION update_assistant_conversation_timestamp();

COMMIT;
