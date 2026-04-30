-- 047_assistant_memories.sql — Assistant Memory Layer (pro User)
SET search_path TO tour_manager, core, booking, public;

CREATE TABLE IF NOT EXISTS tour_manager.assistant_memories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,
  body            TEXT NOT NULL,
  source          TEXT NOT NULL CHECK (source IN ('explicit_user', 'confirmed_suggestion', 'admin_created')),
  conversation_id UUID REFERENCES tour_manager.assistant_conversations(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assistant_memories_user_active
  ON tour_manager.assistant_memories(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;
