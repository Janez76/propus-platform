-- Einmalig ausgefuehrt in Prod 2026-04-23: Stammdaten laut Exxas abgleichen,
-- falsche Exxas-Kundenverknuepfung 68/49 entfernt, exxas_contact_id nachgetragen/entwirrt.
-- Wiederholen auf anderer DB nur bei Bedarf und nur nach Pruefung.
SET search_path = booking, core, public;
BEGIN;

UPDATE customers
SET
  exxas_customer_id = NULL,
  exxas_address_id = NULL,
  notes = TRIM(
    COALESCE(notes, '') || E'\n\n--- Exxas-Bereinigung 2026-04-23: Verknüpfung Kunde 49 (Office Group Zug) entfernt – widerspricht «Best Property GmbH». Bitte korrekte Exxas-ID setzen. ---'
  ),
  updated_at = NOW()
WHERE id = 68;

UPDATE customers SET street = 'Dorfstrasse 57', updated_at = NOW() WHERE id = 78;
UPDATE customers SET
  company = 'Eterni AG', street = 'Hammergutstrasse 16', zip = '5621', city = 'Zufikon',
  zipcity = '5621 Zufikon', country = 'CH', updated_at = NOW()
  WHERE id = 87;
UPDATE customers SET
  street = 'Allmeindstrasse 14', zip = '6440', city = 'Brunnen', zipcity = '6440 Brunnen', country = 'CH', updated_at = NOW()
  WHERE id = 91;
UPDATE customers SET
  company = 'Swiss Life AG', street = 'General-Guisan-Quai 40', zip = '8022', city = 'Zürich', zipcity = '8022 Zürich', country = 'CH', updated_at = NOW()
  WHERE id = 93;
UPDATE customers SET
  company = 'IMH Vermarktung', street = 'Erlenweg 10', zip = '6010', city = 'Kriens', zipcity = '6010 Kriens', country = 'CH', updated_at = NOW()
  WHERE id = 98;
UPDATE customers SET
  street = 'Robert-Durrer-Strasse 2', zip = '6370', city = 'Stans', zipcity = '6370 Stans', country = 'CH', updated_at = NOW()
  WHERE id = 144;
UPDATE customers SET
  notes = TRIM(
    COALESCE(notes, '') || E'\n\n--- Exxas-Bereinigung 2026-04-23: In Exxas Firmenname «Tonet», in Propus «Mirai Real Estate AG»; Adresse stimmt mit Exxas überein, Umbenennung bewusst ausgelassen. ---'
  ),
  updated_at = NOW()
WHERE id = 74;

UPDATE customer_contacts SET exxas_contact_id = '104' WHERE id = 116 AND customer_id = 93;
UPDATE customer_contacts SET exxas_contact_id = '112' WHERE id = 98 AND customer_id = 98;
UPDATE customer_contacts SET exxas_contact_id = '111' WHERE id = 51 AND customer_id = 100;
UPDATE customer_contacts SET exxas_contact_id = '109' WHERE id = 97 AND customer_id = 145;

UPDATE customer_contacts SET exxas_contact_id = NULL WHERE id IN (20, 40, 122, 89, 90, 91, 92, 93, 94, 95) AND exxas_contact_id IS NOT NULL;

COMMIT;
