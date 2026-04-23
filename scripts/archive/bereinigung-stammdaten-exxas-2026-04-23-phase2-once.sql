-- Fortsetzung: Exxas-IDs nachtragen + Merge Dubletten (229->70, 237->91).
-- In Prod 2026-04-23 ausgefuehrt. Nicht erneut blind laufen lassen.
SET search_path = booking, core, public;
BEGIN;
UPDATE customers SET
  exxas_customer_id = '132', exxas_address_id = '132',
  street = 'Bahnhofstrasse 18', zip = '6300', city = 'Zug', zipcity = '6300 Zug', country = 'CH',
  notes = TRIM(COALESCE(notes, '') || E'\n\n--- 2026-04-23: Exxas korrekt verknüpft (Kunde 132 BEST PROPERTY GmbH, Zug) ---'),
  updated_at = NOW()
WHERE id = 68;
UPDATE customers SET exxas_customer_id = '42', exxas_address_id = '42', updated_at = NOW() WHERE id = 106;
UPDATE customers SET exxas_customer_id = '53', exxas_address_id = '53', updated_at = NOW() WHERE id = 111;
UPDATE customers SET exxas_customer_id = '7', exxas_address_id = '7', updated_at = NOW() WHERE id = 151;
UPDATE customers SET exxas_customer_id = '29', exxas_address_id = '29', updated_at = NOW() WHERE id = 159;
UPDATE customers SET exxas_customer_id = '107', exxas_address_id = '107', updated_at = NOW() WHERE id = 215;
UPDATE customers SET exxas_customer_id = '59', exxas_address_id = '59', updated_at = NOW() WHERE id = 221;
UPDATE customers SET exxas_customer_id = '2', exxas_address_id = '2', updated_at = NOW() WHERE id = 225;
COMMIT;
-- Merges 229->70, 237->91 separat per node customer-merge.js (nicht in SQL)

-- Kontakte exxas_contact_id (68/83, 111/25)
-- UPDATE customer_contacts SET exxas_contact_id = '83' WHERE id = 17 AND customer_id = 68;
-- UPDATE customer_contacts SET exxas_contact_id = '25' WHERE id = 44 AND customer_id = 111;
