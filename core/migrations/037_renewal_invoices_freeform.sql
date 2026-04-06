SET search_path TO tour_manager, public;

-- Allow invoices without a linked tour (freeform invoices)
ALTER TABLE tour_manager.renewal_invoices
  ALTER COLUMN tour_id DROP NOT NULL;

-- Additional fields for freeform invoices (customer data stored on the invoice itself)
ALTER TABLE tour_manager.renewal_invoices
  ADD COLUMN IF NOT EXISTS customer_name    TEXT,
  ADD COLUMN IF NOT EXISTS customer_email   TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date     DATE;
