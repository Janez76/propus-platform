-- Migration 094: Idempotenz-Marker fuer Flex-Deadline-Reminder
--
-- Cron-Job booking/jobs/flex-deadline-reminder.js mailt OFFICE_EMAIL,
-- wenn ein Flex-Auftrag (booking_kind='flexible' AND status='disposition_offen')
-- innerhalb von 7 Tagen seine Deadline erreicht. Spalte verhindert
-- Doppelversand.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS flex_deadline_reminder_sent_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN orders.flex_deadline_reminder_sent_at IS
  'Setzt der Flex-Deadline-Reminder-Job (siehe booking/jobs/flex-deadline-reminder.js) auf NOW(), nachdem die 7-Tage-Vorab-Mail an Office gesendet wurde.';

-- Index nur fuer offene Flex-Auftraege ohne bisherigen Reminder.
CREATE INDEX IF NOT EXISTS idx_orders_flex_reminder_pending
  ON orders (deadline_at)
  WHERE booking_kind = 'flexible'
    AND status = 'disposition_offen'
    AND flex_deadline_reminder_sent_at IS NULL;
