-- Migration 015: Reschedule-Vorgänger für E-Mail-Resend
-- Speichert den alten Termin vor einer Verschiebung, damit "Terminänderung" erneut gesendet werden kann.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS last_reschedule_old_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_reschedule_old_time TEXT DEFAULT NULL;

COMMENT ON COLUMN orders.last_reschedule_old_date IS
  'Datum des Termins vor der letzten Verschiebung (YYYY-MM-DD).';
COMMENT ON COLUMN orders.last_reschedule_old_time IS
  'Uhrzeit des Termins vor der letzten Verschiebung (HH:MM).';
