-- Letzte Felder an Exxas angeglichen (Prod 2026-04-23). Danach Audit: feldabweichungen = 0.
-- HINWEIS: Abschnitt id=74 (company = Tonet) war fachlich falsch; ersetzt durch
--   bereinigung-stammdaten-exxas-2026-04-23-korrektur-mirai-once.sql
SET search_path = booking, core, public;
BEGIN;
UPDATE customers
SET
  company = 'Tonet',
  notes = TRIM(
    COALESCE(notes, '') || E'\n\n--- 2026-04-23: Firmenname an Exxas (Tonet) angeglichen; vormals «Mirai Real Estate AG» in interner Nutzung. ---'
  ),
  updated_at = NOW()
WHERE id = 74;
UPDATE customers
SET
  company = 'Beseder Immobilien',
  email = 'rechnungen@beseder.ch',
  email_aliases = ARRAY['s.his@beseder.ch']::text[],
  updated_at = NOW()
WHERE id = 215;
UPDATE customers
SET
  street = 'Neugasse 18, Zug',
  email = 'info@lagea.ch',
  email_aliases = ARRAY['richard.luedi@lagea.ch']::text[],
  updated_at = NOW()
WHERE id = 225;
COMMIT;
