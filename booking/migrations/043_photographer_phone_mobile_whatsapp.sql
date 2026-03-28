-- Stammdaten: Mobile und WhatsApp-Link in photographers (nicht photographer_settings)

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS phone_mobile TEXT NOT NULL DEFAULT '';

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';
