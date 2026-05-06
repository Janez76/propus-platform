-- bexio kb_order Tracking auf orders (analog exxas_*)
-- bexio_order_id     = technische Dokument-ID (kb_order.id)
-- bexio_order_number = anzeigbare Auftragsnummer (kb_order.document_nr, z.B. AB-0042)
-- bexio_status       = not_sent | sent | error
-- bexio_error        = letzte Fehlermeldung beim Anlegen

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bexio_order_id     TEXT,
  ADD COLUMN IF NOT EXISTS bexio_order_number TEXT,
  ADD COLUMN IF NOT EXISTS bexio_status       TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS bexio_error        TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_bexio_status_check'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_bexio_status_check
      CHECK (bexio_status IN ('not_sent','sent','error'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_bexio_order_id
  ON orders (bexio_order_id)
  WHERE bexio_order_id IS NOT NULL;
