-- Migration 022: auth_sub in customers (OIDC/SSO Subject, z. B. Logto)
-- Uebernimmt Daten aus alter Spalte keycloak_sub falls vorhanden.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS auth_sub TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = ANY (current_schemas(true))
      AND table_name = 'customers'
      AND column_name = 'keycloak_sub'
  ) THEN
    UPDATE customers SET auth_sub = COALESCE(auth_sub, keycloak_sub) WHERE keycloak_sub IS NOT NULL;
    ALTER TABLE customers DROP COLUMN keycloak_sub;
  END IF;
END $$;

DROP INDEX IF EXISTS customers_keycloak_sub_uq;

CREATE UNIQUE INDEX IF NOT EXISTS customers_auth_sub_uq
  ON customers (auth_sub)
  WHERE auth_sub IS NOT NULL;
