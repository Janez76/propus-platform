-- Speichert zusaetzlich zur technischen Exxas-Dokument-ID (exxas_order_id)
-- die anzeigbare Exxas-Auftragsnummer (z.B. 500854).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS exxas_order_number TEXT;
