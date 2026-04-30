-- 049_assistant_usage_tracking.sql — Token-Tracking für den Propus Assistant
SET search_path TO tour_manager, core, booking, public;

ALTER TABLE tour_manager.assistant_conversations
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER DEFAULT 0;
