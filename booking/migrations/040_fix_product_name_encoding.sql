-- Migration 040: Produktnamen-Encoding-Korrektur
--
-- Ursache: UTF-8-Multibyte-Zeichen wurden beim Einfügen mit falscher
-- Client-Kodierung gespeichert. Jedes Byte eines Multibyte-Zeichens
-- wurde als einzelnes '?' abgelegt:
--   ü  (U+00FC) = 2 UTF-8-Bytes → '??'
--   –  (U+2013) = 3 UTF-8-Bytes → '???'
--
-- Betroffene Produkte (identifiziert via LIKE mit _ als Einzel-Zeichen-Wildcard):
--   'Schl??sselabholung'        → 'Schlüsselabholung'
--   'Staging ??? Wohnbereich'   → 'Staging – Wohnbereich'
--   'Staging ??? Gewerbe'       → 'Staging – Gewerbe'
--   'Staging ??? Renovation'    → 'Staging – Renovation'

UPDATE products
  SET name = 'Schlüsselabholung'
  WHERE name LIKE 'Schl__sselabholung';

UPDATE products
  SET name = 'Staging – Wohnbereich'
  WHERE name LIKE 'Staging ___ Wohnbereich';

UPDATE products
  SET name = 'Staging – Gewerbe'
  WHERE name LIKE 'Staging ___ Gewerbe';

UPDATE products
  SET name = 'Staging – Renovation'
  WHERE name LIKE 'Staging ___ Renovation';
