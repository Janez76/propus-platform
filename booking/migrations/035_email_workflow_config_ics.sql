-- Migration 035: ICS-Flags zu email_workflow_config hinzufügen
-- Steuert pro Template ob ICS-Kalendereinladung für Kunde/Büro mitgesendet wird.

ALTER TABLE email_workflow_config
  ADD COLUMN IF NOT EXISTS ics_customer BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ics_office   BOOLEAN NOT NULL DEFAULT FALSE;

-- Standard: bei confirmed_customer ICS an Kunden, bei confirmed_office ICS ans Büro
UPDATE email_workflow_config SET ics_customer = TRUE WHERE template_key = 'confirmed_customer';
UPDATE email_workflow_config SET ics_office   = TRUE WHERE template_key = 'confirmed_office';
