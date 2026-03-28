-- Optionale NAS-Basis-Pfade pro Kunde (Variante B: Basis + Auftragsunterordner)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS nas_customer_folder_base TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS nas_raw_folder_base TEXT;

COMMENT ON COLUMN customers.nas_customer_folder_base IS 'Relativ zu Kunden-Upload-Root; Ziel = Basis + / + PLZ Ort, Strasse #Auftragsnr';
COMMENT ON COLUMN customers.nas_raw_folder_base IS 'Relativ zu Rohmaterial-Root; Ziel = Basis + / + PLZ Ort, Strasse #Auftragsnr';
