-- Migration 001: Workflow v2 (Provisorium + Tracking-Felder)
-- Alle AEnderungen sind additiv (ADD COLUMN IF NOT EXISTS) -> kein Datenverlust.
-- Kann beliebig oft ausgefuehrt werden (idempotent).

-- 1) Status-CHECK um 'provisional' erweitern
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_status_check;
  END IF;
  ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN (
      'pending','provisional','paused','confirmed',
      'completed','done','cancelled','archived'
    ));
END $$;

-- 2) Neue Tracking-Spalten fuer Provisorium
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS provisional_booked_at          TIMESTAMPTZ;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS provisional_reminder_1_sent_at TIMESTAMPTZ;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS provisional_reminder_2_sent_at TIMESTAMPTZ;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS provisional_expires_at         TIMESTAMPTZ;

-- 3) Kalender-Sync-Status
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS calendar_sync_status TEXT NOT NULL DEFAULT 'none';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_calendar_sync_status_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_calendar_sync_status_check;
  END IF;
  ALTER TABLE orders
    ADD CONSTRAINT orders_calendar_sync_status_check
    CHECK (calendar_sync_status IN ('none','tentative','final','deleted','error'));
END $$;

-- 4) Review / Feedback Tracking
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMPTZ;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS review_request_count   SMALLINT NOT NULL DEFAULT 0;

-- 5) Pause / Storno Grund (freitext, nullable)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pause_reason  TEXT;
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 6) closed_at (gesetzt bei done + archived)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- 7) Indizes fuer Job-Abfragen
CREATE INDEX IF NOT EXISTS idx_orders_provisional_status
  ON orders(status, provisional_expires_at)
  WHERE status = 'provisional';

CREATE INDEX IF NOT EXISTS idx_orders_review_done
  ON orders(status, done_at)
  WHERE status = 'done';
