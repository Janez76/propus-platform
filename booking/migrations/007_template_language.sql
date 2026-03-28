-- Migration 007: Mehrsprachige E-Mail-Templates (DoD G)
-- Additive Erweiterungen: neue Spalten, keine UPDATE/DELETE auf orders.
-- Fallback-Sprache: de-CH.
--
-- Konsolidierter Pfad fuer template_language (kein doppelter 002/005-Pfad).

-- 1. email_templates um template_language erweitern
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS template_language TEXT NOT NULL DEFAULT 'de-CH';

-- Eindeutiger Key fuer (key, template_language)
-- Bestehendes UNIQUE(key) bleibt als Index-Grundlage;
-- ein neues Partial-UNIQUE stellt sicher, dass (key, language) eindeutig ist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_key_lang
  ON email_templates(key, template_language);

-- Kommentar fuer Dokumentation
COMMENT ON COLUMN email_templates.template_language IS
  'BCP-47 Sprachcode (z.B. de-CH, en, sr-latn). Fallback: de-CH.';

-- 2. orders: bevorzugte Sprache des Kunden (additive Spalte, nullable)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT NULL;

COMMENT ON COLUMN orders.preferred_language IS
  'Bevorzugte Sprache des Kunden (BCP-47, z.B. de-CH, en, sr-latn). NULL = de-CH Fallback.';

-- 3. email_send_log: Sprache mitloggen (additive, nullable)
ALTER TABLE email_send_log
  ADD COLUMN IF NOT EXISTS template_language TEXT DEFAULT NULL;
