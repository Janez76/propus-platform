-- Migration 041: Produktnamen auf robuste ASCII-Variante normalisieren
-- Hintergrund: Auf einzelnen Systemen wurden Sonderzeichen (·, –, ü) als ??/??? dargestellt.
-- Ziel: Einheitliche, gut lesbare Namen ohne potenziell problematische Unicode-Trennzeichen.

UPDATE products
SET name = 'Bodenvideo - Reel 30s'
WHERE code = 'groundVideo:reel30';

UPDATE products
SET name = 'Bodenvideo - Clip 1-2 Min'
WHERE code = 'groundVideo:clip12';

UPDATE products
SET name = 'Drohnenvideo - Reel 30s'
WHERE code = 'droneVideo:reel30';

UPDATE products
SET name = 'Drohnenvideo - Clip 1-2 Min'
WHERE code = 'droneVideo:clip12';

UPDATE products
SET name = 'Staging - Wohnbereich'
WHERE code = 'staging:stLiving';

UPDATE products
SET name = 'Staging - Gewerbe'
WHERE code = 'staging:stBusiness';

UPDATE products
SET name = 'Staging - Renovation'
WHERE code = 'staging:stRenov';
