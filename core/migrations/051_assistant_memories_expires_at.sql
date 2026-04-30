-- 051_assistant_memories_expires_at.sql — optionales Ablaufdatum für Assistant-Erinnerungen
SET search_path TO tour_manager, core, booking, public;

ALTER TABLE tour_manager.assistant_memories
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assistant_memories_expires
  ON tour_manager.assistant_memories(expires_at)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL;
