-- Migration 084: Interne Notizen pro Bestellung (nur fuer Team, nicht fuer Kunde sichtbar)

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS internal_notes TEXT NOT NULL DEFAULT '';
