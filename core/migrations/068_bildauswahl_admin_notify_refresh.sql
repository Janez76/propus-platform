-- 068_bildauswahl_admin_notify_refresh.sql
-- Setzt Subject und Body der Admin-Notify-Mail zurueck, damit der Boot-Hook
-- (ensureDefaultBildauswahlEmailTemplates) das neue, hochwertige HTML-Layout
-- einfuellen kann. Migration 067 hatte die alte Variante (kompakter
-- Header + pre-formatted Bullet-Liste). Der neue Body bringt Brand-Header,
-- gold-akzentuierte Eyebrows, strukturierte Bilder-Tabelle mit Flag-Chips
-- und eine bulletproof CTA.

UPDATE tour_manager.gallery_email_templates
SET subject = '', body = '', updated_at = NOW()
WHERE id = 'propus-bildauswahl-admin-notify-v1';
