-- Migration 036: Robuste Default-ICS-Templates ohne bedingte {{field?...}}-Syntax
-- Aktualisiert nur die alten fehleranfälligen Seed-Templates.

UPDATE calendar_templates
SET
  subject = 'Termin {{address}} – #{{orderNo}}',
  body = E'📍 Adresse: {{addressLine}}\n📅 Termin: {{appointmentDate}} um {{appointmentTime}} Uhr\n\nPaket:\n{{packageName}}\n\nDienstleistungen:\n{{servicesSummary}}\n\nAuftrag: #{{orderNo}}\nStatus: {{statusLabel}}',
  updated_at = NOW()
WHERE key = 'customer_event'
  AND (
    subject = 'Propus Termin #{{orderNo}}'
    OR body = E'📍 {{address}}\n\n{{customerName}}\n{{packageName}}\n\n#{{orderNo}}'
  );

UPDATE calendar_templates
SET
  subject = 'Shooting {{address}} – #{{orderNo}}',
  body = E'📍 Adresse: {{addressLine}}\n🏠 Objekt: {{objectSummary}}\n\n🛠 Dienstleistungen:\n{{servicesSummary}}\n\n📞 Kunde:\n{{customerBlock}}\n\n{{onsiteBlock}}\n\n📸 Fotograf:\n{{photographerName}}\n\n{{notesBlock}}\n\n{{keyPickupBlock}}\n\nAuftrag: #{{orderNo}}\nStatus: {{statusLabel}}',
  updated_at = NOW()
WHERE key = 'photographer_event'
  AND (
    body LIKE '%{{objectArea?%'
    OR body LIKE '%{{onsiteName?%'
    OR body LIKE '%{{customerNotes?%'
    OR body LIKE '%{{keyPickupAddress?%'
  );
