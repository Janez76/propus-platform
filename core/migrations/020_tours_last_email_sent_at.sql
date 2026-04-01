-- Migration 020: last_email_sent_at zu tour_manager.tours hinzufügen
-- Feld wird von tour-actions.js (E-Mail-Versand) und suggestions.js (Matching) genutzt.
ALTER TABLE tour_manager.tours
  ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tours_last_email_sent_at
  ON tour_manager.tours (last_email_sent_at)
  WHERE last_email_sent_at IS NOT NULL;
