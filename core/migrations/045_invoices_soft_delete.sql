-- Migration 045: Soft-Delete für interne Rechnungen und Exxas-Rechnungen
-- Gelöschte Rechnungen werden nicht mehr physisch entfernt, sondern mit deleted_at markiert.
-- Das ermöglicht einen "Papierkorb"-Tab mit Reaktivierung.

ALTER TABLE tour_manager.renewal_invoices
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE tour_manager.exxas_invoices
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_renewal_invoices_deleted_at
  ON tour_manager.renewal_invoices (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exxas_invoices_deleted_at
  ON tour_manager.exxas_invoices (deleted_at)
  WHERE deleted_at IS NOT NULL;
