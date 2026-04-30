-- ═══════════════════════════════════════════════════════════════════════════
-- 045_assistant_tables.sql – Schema für den Propus Assistant
-- Tabellen leben im eigenen Schema "assistant" (analog tour_manager).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS assistant;

SET search_path TO assistant, public;

-- ─── Conversations (Top-Level pro User) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant.conversations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    title           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user
    ON assistant.conversations(user_id, updated_at DESC);

-- ─── Messages (eine Zeile pro Turn-Element) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant.messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES assistant.conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
    content         JSONB NOT NULL,
    audio_url       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation
    ON assistant.messages(conversation_id, created_at);

-- ─── Tool-Calls (1:n zu messages) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant.tool_calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id      UUID NOT NULL REFERENCES assistant.messages(id) ON DELETE CASCADE,
    tool_name       TEXT NOT NULL,
    input           JSONB NOT NULL,
    output          JSONB,
    status          TEXT NOT NULL CHECK (status IN ('pending', 'success', 'error')),
    error_message   TEXT,
    duration_ms     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_tool_calls_message
    ON assistant.tool_calls(message_id);

-- ─── Audit-Log (alle schreibenden Aktionen) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS assistant.audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    conversation_id UUID REFERENCES assistant.conversations(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    payload         JSONB NOT NULL,
    ip_address      INET,
    user_agent      TEXT,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_user_time
    ON assistant.audit_log(user_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_audit_action
    ON assistant.audit_log(action);

-- ─── Auto-Touch updated_at auf conversations bei neuen Messages ─────────────
CREATE OR REPLACE FUNCTION assistant.touch_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE assistant.conversations
       SET updated_at = NOW()
     WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assistant_message_touch ON assistant.messages;
CREATE TRIGGER trg_assistant_message_touch
AFTER INSERT ON assistant.messages
FOR EACH ROW
EXECUTE FUNCTION assistant.touch_conversation_on_message();
