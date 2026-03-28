-- Sichtbarkeit dynamischer Addon-Kategorien im Buchungs-Frontpanel (pro Kategorie steuerbar)
ALTER TABLE service_categories
  ADD COLUMN IF NOT EXISTS show_in_frontpanel BOOLEAN NOT NULL DEFAULT FALSE;

-- Bestehende Addon-/both-Kategorien waren bisher im Frontpanel sichtbar
UPDATE service_categories
SET show_in_frontpanel = TRUE
WHERE kind_scope IN ('addon', 'both');
