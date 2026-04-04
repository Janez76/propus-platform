-- Tour workflow: Bestätigungs-Bereinigung + Abo-Startdatum
ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS confirmation_required BOOLEAN DEFAULT FALSE;
ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ;
ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS subscription_start_date DATE;

UPDATE tour_manager.tours
SET subscription_start_date = (created_at AT TIME ZONE 'UTC')::date
WHERE subscription_start_date IS NULL;
