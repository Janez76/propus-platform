-- Kunden-Dedup: generierter Firmenschlüssel + E-Mail-Domain-Index
-- (defensiv für core.customers und/oder booking.customers)

DO $$
DECLARE
  gen_expr text := $expr$
    lower(
      btrim(
        regexp_replace(
          coalesce(company, ''),
          '\s+', ' ', 'g'
        )
      )
    )
$expr$;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'core' AND table_name = 'customers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'customers' AND column_name = 'company_key'
  ) THEN
    EXECUTE format(
      'ALTER TABLE core.customers
       ADD COLUMN company_key text
       GENERATED ALWAYS AS (%s) STORED',
      gen_expr
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'booking' AND table_name = 'customers'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'booking' AND table_name = 'customers' AND column_name = 'company_key'
  ) THEN
    EXECUTE format(
      'ALTER TABLE booking.customers
       ADD COLUMN company_key text
       GENERATED ALWAYS AS (%s) STORED',
      gen_expr
    );
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('core.customers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_core_customers_company_key
      ON core.customers (company_key)
      WHERE btrim(COALESCE(company_key, '')) <> '';

    CREATE INDEX IF NOT EXISTS idx_core_customers_email_domain
      ON core.customers (split_part(lower(btrim(COALESCE(email, ''))), '@', 2))
      WHERE btrim(COALESCE(email, '')) <> '' AND position('@' IN btrim(COALESCE(email, ''))) > 0;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('booking.customers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_booking_customers_company_key
      ON booking.customers (company_key)
      WHERE btrim(COALESCE(company_key, '')) <> '';

    CREATE INDEX IF NOT EXISTS idx_booking_customers_email_domain
      ON booking.customers (split_part(lower(btrim(COALESCE(email, ''))), '@', 2))
      WHERE btrim(COALESCE(email, '')) <> '' AND position('@' IN btrim(COALESCE(email, ''))) > 0;
  END IF;
END $$;
