-- Migration 006: Calendar-Delete-Queue fuer fehlgeschlagene Graph-API-Deletes
-- Idempotent (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS calendar_delete_queue (
  id              SERIAL PRIMARY KEY,
  order_no        INTEGER NOT NULL,
  event_type      TEXT NOT NULL CHECK (event_type IN ('photographer', 'office')),
  event_id        TEXT NOT NULL,
  user_email      TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error      TEXT,
  next_retry_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdq_pending
  ON calendar_delete_queue (next_retry_at)
  WHERE done_at IS NULL AND attempts < 5;