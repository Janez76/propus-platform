-- Migration 033: Kalender-Template-System
-- Erstellt die Tabelle calendar_templates fuer anpassbare ICS-Vorlagen (idempotent).

CREATE TABLE IF NOT EXISTS calendar_templates (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,   -- z.B. 'photographer_event', 'customer_event'
  label        TEXT NOT NULL DEFAULT '',
  subject      TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_templates_key    ON calendar_templates(key);
CREATE INDEX IF NOT EXISTS idx_calendar_templates_active ON calendar_templates(active);

-- Standard-Templates einfuegen (Fotografen-Event)
INSERT INTO calendar_templates (key, label, subject, body, active)
VALUES (
  'photographer_event',
  'Fotografen-Event (E-Mail-Anhang)',
  'Shooting {{address}} – #{{orderNo}}',
  E'📍 Adresse: {{addressLine}}\n🏠 Objekt: {{objectSummary}}\n\n🛠 Dienstleistungen:\n{{servicesSummary}}\n\n📞 Kunde:\n{{customerBlock}}\n\n{{onsiteBlock}}\n\n📸 Fotograf:\n{{photographerName}}\n\n{{notesBlock}}\n\n{{keyPickupBlock}}\n\nAuftrag: #{{orderNo}}\nStatus: {{statusLabel}}',
  TRUE
)
ON CONFLICT (key) DO NOTHING;

-- Standard-Templates einfuegen (Kunden-Event / oeffentlicher ICS-Download)
INSERT INTO calendar_templates (key, label, subject, body, active)
VALUES (
  'customer_event',
  'Kunden-Event (ICS-Download)',
  'Termin {{address}} – #{{orderNo}}',
  E'📍 Adresse: {{addressLine}}\n📅 Termin: {{appointmentDate}} um {{appointmentTime}} Uhr\n\nPaket:\n{{packageName}}\n\nDienstleistungen:\n{{servicesSummary}}\n\nAuftrag: #{{orderNo}}\nStatus: {{statusLabel}}',
  TRUE
)
ON CONFLICT (key) DO NOTHING;
