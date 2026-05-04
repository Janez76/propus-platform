-- =====================================================================
-- 057_order_outbox.sql
--
-- Outbox-Pattern fuer Order-Side-Effects (Bug-Hunt T07/T08 HIGH:
-- Side-Effects laufen heute im Request-Handler; bei Mailfehler oder
-- Server-Crash zwischen DB-Commit und Mail-Versand gehen sie verloren
-- bzw. werden ueber inkonsistente Status-Mutationen getriggert).
--
-- Pattern:
--   1. Sub-Action enqueued IN derselben Tx wie das Order-UPDATE eine
--      Outbox-Row (Side-Effect-Beschreibung als JSON).
--   2. Outbox-Worker (booking/jobs/outbox-dispatcher.js) pollt
--      `status='pending' AND next_attempt_at <= NOW()`, sperrt die Row
--      via FOR UPDATE SKIP LOCKED und dispatcht zum registrierten
--      Handler.
--   3. Handler-Erfolg: status='done', processed_at=NOW().
--      Handler-Fail (max_attempts noch nicht erreicht):
--          attempts++, next_attempt_at=NOW()+exponential backoff.
--      Handler-Fail (max_attempts erreicht):
--          status='failed', last_error gesetzt — manuelle Intervention.
-- =====================================================================

CREATE TABLE IF NOT EXISTS booking.order_outbox (
  id                BIGSERIAL PRIMARY KEY,
  order_no          BIGINT NOT NULL,
  kind              TEXT NOT NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'in_progress', 'done', 'failed')),
  attempts          INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts      INT NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  last_error        TEXT,
  next_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Worker-Queue-Index: pending-Rows nach faelligem next_attempt_at.
-- Partial-Index haelt ihn klein (done-Rows werden meistens nie geloescht,
-- damit man Audit-Trail hat).
CREATE INDEX IF NOT EXISTS idx_order_outbox_pending
  ON booking.order_outbox (next_attempt_at)
  WHERE status = 'pending';

-- Lookup nach Order fuer Debugging/Inspection.
CREATE INDEX IF NOT EXISTS idx_order_outbox_order_no
  ON booking.order_outbox (order_no, created_at DESC);

COMMENT ON TABLE booking.order_outbox IS
  'Outbox-Pattern fuer Order-Side-Effects (Mails, Calendar-Sync). Geschrieben in derselben Tx wie das Order-UPDATE; ein separater Worker dispatcht sie at-least-once.';
COMMENT ON COLUMN booking.order_outbox.kind IS
  'Discriminator fuer den Handler: workflow_status_mail | calendar_reschedule | ... (siehe booking/lib/outbox-handlers.js)';
COMMENT ON COLUMN booking.order_outbox.attempts IS
  'Anzahl bisheriger Versuche. Bei Fail steigt der Wert + next_attempt_at wird per Exponential-Backoff verschoben.';
COMMENT ON COLUMN booking.order_outbox.next_attempt_at IS
  'Frueheste Zeit, zu der der Worker diese Row erneut anfassen darf. Bei pending standardmaessig NOW().';
