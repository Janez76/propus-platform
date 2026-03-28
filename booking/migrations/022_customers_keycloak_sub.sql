-- Migration 022: keycloak_sub Spalte in customers-Tabelle
-- Alle Kunden authentifizieren sich nun über Keycloak.
-- keycloak_sub speichert die Keycloak-Subject-ID (UUID) für schnelle Lookups.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS keycloak_sub TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

-- Eindeutiger Index auf keycloak_sub (NULL-Werte erlaubt, nur eindeutig wenn NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS customers_keycloak_sub_uq
  ON customers (keycloak_sub)
  WHERE keycloak_sub IS NOT NULL;
