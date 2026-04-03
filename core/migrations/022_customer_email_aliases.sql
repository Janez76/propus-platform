-- ═══════════════════════════════════════════════════════════════════════════
-- 022_customer_email_aliases.sql
-- Fügt E-Mail-Alias-Unterstützung für Kunden hinzu.
--
-- Hintergrund: Firmen mit mehreren Marken/Domains (z.B. CSL Immobilien und
-- Nextkey) können nach einem Merge unter beiden E-Mail-Domains gefunden werden.
-- Die primäre E-Mail bleibt in customers.email; frühere Haupt-E-Mails und
-- Brand-Aliase werden in email_aliases gespeichert.
--
-- Zukunftssicherheit:
--   - core.customer_email_matches() als zentrale SQL-Funktion für alle Lookups
--   - Neuer Code soll IMMER diese Funktion oder getCustomerByEmail() nutzen
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO core, public;

-- ─── Spalte email_aliases ────────────────────────────────────────────────────

ALTER TABLE core.customers
  ADD COLUMN IF NOT EXISTS email_aliases TEXT[] NOT NULL DEFAULT '{}';

-- GIN-Index für schnelle Array-Suche (z.B. ANY-Operator)
CREATE INDEX IF NOT EXISTS idx_core_customers_email_aliases
  ON core.customers USING GIN (email_aliases);

-- ─── SQL-Funktion: core.customer_email_matches() ─────────────────────────────
-- Prüft ob check_email mit der primären Kunden-E-Mail ODER einem Alias übereinstimmt.
-- IMMUTABLE = PostgreSQL kann Ergebnis cachen; kein DB-Zugriff intern.
--
-- Verwendung in Queries:
--   WHERE core.customer_email_matches($1, c.email, c.email_aliases)
--
CREATE OR REPLACE FUNCTION core.customer_email_matches(
  check_email TEXT,
  cust_email  TEXT,
  cust_aliases TEXT[]
) RETURNS BOOLEAN AS $$
  SELECT LOWER(TRIM(check_email)) = LOWER(TRIM(cust_email))
      OR LOWER(TRIM(check_email)) = ANY(
           SELECT LOWER(TRIM(a)) FROM unnest(cust_aliases) a
         )
$$ LANGUAGE SQL IMMUTABLE;

-- ─── Booking-Schema: Spalte + Funktion spiegeln ───────────────────────────────
-- Das Booking-Tool greift via search_path=booking,core,public auf customers zu.
-- Da core.customers als Shadow-Tabelle im booking-Schema erreichbar ist, reicht
-- die core-Funktion. Für explizite booking.-Referenzen wird ein Alias erstellt.

CREATE OR REPLACE FUNCTION booking.customer_email_matches(
  check_email TEXT,
  cust_email  TEXT,
  cust_aliases TEXT[]
) RETURNS BOOLEAN AS $$
  SELECT core.customer_email_matches(check_email, cust_email, cust_aliases)
$$ LANGUAGE SQL IMMUTABLE;
