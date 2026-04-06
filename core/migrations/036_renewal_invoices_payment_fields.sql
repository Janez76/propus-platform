-- ═══════════════════════════════════════════════════════════════════════════
-- 036_renewal_invoices_payment_fields.sql
-- Erweitert renewal_invoices um Zahlungskanal, Skonto, Bezahlt-Datum und
-- Abschreibungs-Felder fuer das erweiterte Rechnungs-Bearbeiten-Modal.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO tour_manager, public;

ALTER TABLE tour_manager.renewal_invoices
  ADD COLUMN IF NOT EXISTS paid_at_date     DATE,
  ADD COLUMN IF NOT EXISTS payment_channel  VARCHAR(30),
  ADD COLUMN IF NOT EXISTS skonto_chf       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS writeoff         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS writeoff_reason  TEXT;
