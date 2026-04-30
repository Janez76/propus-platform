-- 050_assistant_history_archive_trash.sql — Assistant-Verlauf archivieren / Papierkorb
SET search_path TO tour_manager, core, booking, public;

ALTER TABLE tour_manager.assistant_conversations
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_active
  ON tour_manager.assistant_conversations(user_id, updated_at DESC)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_archived
  ON tour_manager.assistant_conversations(user_id, updated_at DESC)
  WHERE archived_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_deleted
  ON tour_manager.assistant_conversations(user_id, updated_at DESC)
  WHERE deleted_at IS NOT NULL;
