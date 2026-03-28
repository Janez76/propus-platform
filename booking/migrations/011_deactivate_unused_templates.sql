-- Migration 011: Ungenutzte E-Mail-Templates deaktivieren
-- booking_change_confirmation_request: kein aktiver Trigger im Code
-- provisional_reminder (ohne _1/_2/_3 Suffix): ersetzt durch provisional_reminder_1/2/3
-- Idempotent: UPDATE nur wenn active=true

UPDATE email_templates
SET active = false
WHERE key IN ('booking_change_confirmation_request', 'provisional_reminder')
  AND active = true;
