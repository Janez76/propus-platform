-- Korrektur nach User-Rueckmeldung: Kunde 74 = Firma «Mirai Real Estate AG».
-- «Tonet» ist in Exxas der Kartenname / Kontext, kein Firmenname in Propus.
-- Phase-3-Update (company=Tonet) war fachlich falsch; hier rueckgaengig.
-- Prod 2026-04-23
SET search_path = booking, core, public;
BEGIN;
UPDATE customers
SET
  company = 'Mirai Real Estate AG',
  notes = TRIM(
    E'[KONSOLIDIERUNG] Firmen-Hauptprofil (systemweit)' || E'\n\n' ||
    E'Exxas: Kartenname «Tonet»; fachlich Firma «Mirai Real Estate AG» und Tonet als Familie/Kontext – nicht der offizielle Unternehmensname. Adresse abgestimmt mit Exxas.'
  ),
  updated_at = NOW()
WHERE id = 74;
COMMIT;
