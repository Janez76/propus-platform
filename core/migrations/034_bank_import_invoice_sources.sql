-- Bank-Import: Quelle der Rechnung speichern + Exxas-Import in interne Rechnungen absichern

ALTER TABLE tour_manager.bank_import_transactions
  ADD COLUMN IF NOT EXISTS matched_invoice_source VARCHAR(16);

ALTER TABLE tour_manager.renewal_invoices
  ADD COLUMN IF NOT EXISTS exxas_invoice_id TEXT;

CREATE INDEX IF NOT EXISTS idx_renewal_invoices_exxas_invoice_id
  ON tour_manager.renewal_invoices (exxas_invoice_id)
  WHERE exxas_invoice_id IS NOT NULL;
