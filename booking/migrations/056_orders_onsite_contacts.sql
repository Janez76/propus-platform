-- Migration 056: Mehrere Kontaktpersonen vor Ort (nur Bestellung, nicht Kundenkartei)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS onsite_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;
