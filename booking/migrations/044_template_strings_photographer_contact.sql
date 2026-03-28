-- Migration 044: Mail-/Kalender-Strings auf neue Fotografen-Felder erweitern
-- Ziel:
-- 1) bestehende E-Mail-Templates nutzen den kompakten Kontakt-String inkl. Mobile/WhatsApp
-- 2) ICS-/Kalender-Templates zeigen den Fotografenblock inkl. neuer Felder
-- 3) nur String-Inhalte anpassen, kein Redesign

UPDATE email_templates
SET
  body_html = REPLACE(body_html, '{{photographerPhone}}', '{{photographerContactSummary}}'),
  updated_at = NOW()
WHERE body_html LIKE '%{{photographerPhone}}%';

UPDATE email_templates
SET
  body_html = REPLACE(body_html, 'Telefon Fotograf', 'Kontakt Fotograf'),
  updated_at = NOW()
WHERE body_html LIKE '%Telefon Fotograf%';

UPDATE calendar_templates
SET
  body = REPLACE(body, E'📸 Fotograf:\n{{photographerName}}', E'📸 Fotograf:\n{{photographerBlock}}'),
  updated_at = NOW()
WHERE key = 'photographer_event'
  AND body LIKE E'%📸 Fotograf:\n{{photographerName}}%';

UPDATE calendar_templates
SET
  body = REPLACE(body, E'\n\nAuftrag: #{{orderNo}}', E'\n\n📸 Fotograf:\n{{photographerBlock}}\n\nAuftrag: #{{orderNo}}'),
  updated_at = NOW()
WHERE key = 'customer_event'
  AND body NOT LIKE '%{{photographerBlock}}%'
  AND body LIKE '%Auftrag: #{{orderNo}}%';
