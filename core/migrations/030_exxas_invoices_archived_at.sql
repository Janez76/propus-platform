-- Exxas-Rechnungen: Archivieren ohne Sync-Daten zu loeschen
ALTER TABLE tour_manager.exxas_invoices
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS exxas_invoices_archived_at_idx
  ON tour_manager.exxas_invoices (archived_at)
  WHERE archived_at IS NOT NULL;
