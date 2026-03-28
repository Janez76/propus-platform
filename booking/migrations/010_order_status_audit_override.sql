-- Migration 010: force_slot + override_reason im Order-Status-Audit-Log
-- Ermoeglicht Nachvollziehbarkeit von Admin-Force-Aktionen.
-- Idempotent (IF NOT EXISTS / IF EXISTS ueberall).

ALTER TABLE order_status_audit
  ADD COLUMN IF NOT EXISTS force_slot      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_reason TEXT;

COMMENT ON COLUMN order_status_audit.force_slot IS
  'TRUE wenn der Admin forceSlot=true uebergeben hat (kein Pre-Check-Reject, Kalender-Write wird trotzdem versucht)';

COMMENT ON COLUMN order_status_audit.override_reason IS
  'Optionale Begruendung des Admins fuer den Force-Slot';
