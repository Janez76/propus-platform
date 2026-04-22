-- Interne Chat-Nachrichten + Soft-Delete für Admin
ALTER TABLE booking.order_chat_messages
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE booking.order_chat_messages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE booking.order_chat_messages
  ADD COLUMN IF NOT EXISTS deleted_by TEXT DEFAULT NULL;
