-- Entfernt synthetische @company.local-Platzhalter und erlaubt mehrere Kunden ohne E-Mail.
ALTER TABLE customers
  ALTER COLUMN email SET DEFAULT '';

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_email_key;

DROP INDEX IF EXISTS idx_core_customers_email;
DROP INDEX IF EXISTS uq_customers_email_nonempty;

CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email_nonempty
  ON customers(email)
  WHERE email <> '';

UPDATE customers
SET email = ''
WHERE LOWER(TRIM(COALESCE(email, ''))) LIKE '%@company.local';

UPDATE orders
SET billing = jsonb_set(billing, '{email}', to_jsonb(''::text), true)
WHERE LOWER(TRIM(COALESCE(billing->>'email', ''))) LIKE '%@company.local';

UPDATE orders
SET billing = jsonb_set(billing, '{company_email}', to_jsonb(''::text), true)
WHERE LOWER(TRIM(COALESCE(billing->>'company_email', ''))) LIKE '%@company.local';

UPDATE orders
SET billing = jsonb_set(billing, '{alt_email}', to_jsonb(''::text), true)
WHERE LOWER(TRIM(COALESCE(billing->>'alt_email', ''))) LIKE '%@company.local';

UPDATE orders
SET billing = jsonb_set(billing, '{alt_company_email}', to_jsonb(''::text), true)
WHERE LOWER(TRIM(COALESCE(billing->>'alt_company_email', ''))) LIKE '%@company.local';

UPDATE orders
SET onsite_email = ''
WHERE LOWER(TRIM(COALESCE(onsite_email, ''))) LIKE '%@company.local';
