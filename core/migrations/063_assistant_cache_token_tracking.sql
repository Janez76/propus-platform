-- 063_assistant_cache_token_tracking.sql — separate cache-token columns
-- Anthropic prompt caching reports cache_creation_input_tokens (1.25x base rate)
-- and cache_read_input_tokens (0.1x base rate) separately from input_tokens.
-- Tracking them separately enables accurate per-period CHF estimates.
SET search_path TO tour_manager, core, booking, public;

ALTER TABLE tour_manager.assistant_conversations
  ADD COLUMN IF NOT EXISTS cache_creation_input_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_read_input_tokens INTEGER DEFAULT 0;
