-- Redundanz entfernen: phone_direct = phone (gleicher Wert)
-- Verwende nur phone, phone_direct per Alias zurueckgeben
ALTER TABLE customer_contacts DROP COLUMN IF EXISTS phone_direct;
