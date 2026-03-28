-- Migration 005: Workflow Email Templates + Reminder-3-Spalte
-- Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING)

-- 1) Neue Spalte fuer Reminder-3-Tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS
  provisional_reminder_3_sent_at TIMESTAMPTZ DEFAULT NULL;

-- 2) Status-CHECK um 'completed' erweitern (idempotent)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE orders DROP CONSTRAINT orders_status_check;
  END IF;
  ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending','provisional','paused','confirmed','completed','done','cancelled','archived'));
END $$;

-- 3) Neue und korrigierte E-Mail-Templates
-- Provisorium-Reminder (korrekte Keys mit Nummerierung)
INSERT INTO email_templates (key, label, subject, body_html, body_text, active) VALUES
(
  'provisional_reminder_1',
  'Erinnerung Provisorium – Tag 1',
  'Erinnerung: Ihr provisorischer Termin läuft in 2 Tagen ab – Auftrag #{{orderNo}}',
  '<p>Guten Tag {{customerName}},</p><p>wir möchten Sie daran erinnern, dass Ihr provisorisch reservierter Termin am <strong>{{appointmentDate}} um {{appointmentTime}} Uhr</strong> in 2 Tagen abläuft.</p><p><strong>Adresse:</strong> {{address}}</p><p>Bitte bestätigen Sie Ihren Termin oder melden Sie sich bei uns, falls Sie einen neuen Termin benötigen.</p><p>Mit freundlichen Grüssen<br>{{companyName}}</p>',
  'Guten Tag {{customerName}}, Ihr provisorischer Termin am {{appointmentDate}} um {{appointmentTime}} Uhr läuft in 2 Tagen ab. Bitte bestätigen Sie Ihren Termin. Mit freundlichen Grüssen, {{companyName}}',
  true
),
(
  'provisional_reminder_2',
  'Erinnerung Provisorium – Tag 2',
  'Letzte Erinnerung: Provisorischer Termin läuft morgen ab – Auftrag #{{orderNo}}',
  '<p>Guten Tag {{customerName}},</p><p>Ihr provisorisch reservierter Termin am <strong>{{appointmentDate}} um {{appointmentTime}} Uhr</strong> läuft <strong>morgen</strong> ab.</p><p><strong>Adresse:</strong> {{address}}</p><p>Bitte bestätigen Sie Ihren Termin zeitnah, damit wir den Slot für Sie reservieren können.</p><p>Mit freundlichen Grüssen<br>{{companyName}}</p>',
  'Guten Tag {{customerName}}, Ihr provisorischer Termin am {{appointmentDate}} um {{appointmentTime}} Uhr läuft morgen ab. Bitte bestätigen Sie zeitnah. Mit freundlichen Grüssen, {{companyName}}',
  true
),
(
  'provisional_reminder_3',
  'Letzte Erinnerung Provisorium – läuft heute ab',
  'Heute letzter Tag: Provisorischer Termin läuft ab – Auftrag #{{orderNo}}',
  '<p>Guten Tag {{customerName}},</p><p>Ihr provisorisch reservierter Termin am <strong>{{appointmentDate}} um {{appointmentTime}} Uhr</strong> läuft <strong>heute</strong> ab.</p><p><strong>Adresse:</strong> {{address}}</p><p>Ohne Bestätigung bis heute Nacht wird die Reservierung automatisch freigegeben und Sie müssen einen neuen Termin vereinbaren.</p><p>Melden Sie sich gerne direkt bei uns: <a href="mailto:{{companyEmail}}">{{companyEmail}}</a></p><p>Mit freundlichen Grüssen<br>{{companyName}}</p>',
  'Guten Tag {{customerName}}, Ihr provisorischer Termin am {{appointmentDate}} um {{appointmentTime}} Uhr läuft heute ab. Ohne Bestätigung wird die Reservierung freigegeben. Kontakt: {{companyEmail}}. Mit freundlichen Grüssen, {{companyName}}',
  true
),

-- Terminbestätigung
(
  'confirmed_customer',
  'Terminbestätigung an Kunde',
  'Ihr Termin ist bestätigt – Auftrag #{{orderNo}}',
  '<p>Guten Tag {{customerName}},</p><p>wir freuen uns, Ihnen mitteilen zu können, dass Ihr Termin fix bestätigt ist.</p><p><strong>Termin:</strong> {{appointmentDate}} um {{appointmentTime}} Uhr<br><strong>Adresse:</strong> {{address}}<br><strong>Fotograf:</strong> {{photographerName}}<br><strong>Paket:</strong> {{packageName}}</p><p>Bei Fragen stehen wir Ihnen gerne zur Verfügung: <a href="mailto:{{companyEmail}}">{{companyEmail}}</a></p><p>Mit freundlichen Grüssen<br>{{companyName}}</p>',
  'Guten Tag {{customerName}}, Ihr Termin am {{appointmentDate}} um {{appointmentTime}} Uhr ist bestätigt. Adresse: {{address}}, Fotograf: {{photographerName}}. Bei Fragen: {{companyEmail}}. Mit freundlichen Grüssen, {{companyName}}',
  true
),
(
  'confirmed_photographer',
  'Termininfo an Fotograf',
  'Neuer Auftrag bestätigt: #{{orderNo}} am {{appointmentDate}}',
  '<p>Hallo {{photographerName}},</p><p>du hast einen neuen bestätigten Auftrag.</p><p><strong>Auftrag #{{orderNo}}</strong><br><strong>Datum:</strong> {{appointmentDate}} um {{appointmentTime}} Uhr<br><strong>Adresse:</strong> {{address}}<br><strong>Kunde:</strong> {{customerName}}<br><strong>Paket:</strong> {{packageName}}</p><p>Mit freundlichen Grüssen<br>{{companyName}}</p>',
  'Hallo {{photographerName}}, neuer Auftrag #{{orderNo}} am {{appointmentDate}} um {{appointmentTime}} Uhr. Adresse: {{address}}. Kunde: {{customerName}}. Mit freundlichen Grüssen, {{companyName}}',
  true
),
(
  'confirmed_office',
  'Termininfo ans Büro',
  'Bestätigter Auftrag #{{orderNo}} – {{appointmentDate}}',
  '<p>Auftrag <strong>#{{orderNo}}</strong> wurde bestätigt.</p><p><strong>Kunde:</strong> {{customerName}} ({{customerEmail}})<br><strong>Fotograf:</strong> {{photographerName}}<br><strong>Termin:</strong> {{appointmentDate}} um {{appointmentTime}} Uhr<br><strong>Adresse:</strong> {{address}}<br><strong>Paket:</strong> {{packageName}}<br><strong>Total:</strong> {{totalFormatted}}</p>',
  'Auftrag #{{orderNo}} bestätigt. Kunde: {{customerName}}, Fotograf: {{photographerName}}, Termin: {{appointmentDate}} {{appointmentTime}}, Adresse: {{address}}, Total: {{totalFormatted}}',
  true
),

-- Termin pausiert
(
  'paused_customer',
  'Termin pausiert – Kunde',
  'Ihr Termin wurde vorübergehend pausiert – Auftrag #{{orderNo}}',
  '<p>Guten Tag {{customerName}},</p><p>Ihr Termin am <strong>{{appointmentDate}} um {{appointmentTime}} Uhr</strong> wurde vorübergehend pausiert.</p><p>Wir melden uns, sobald wir einen neuen Termin für Sie gefunden haben.</p><p>Bei Fragen stehen wir Ihnen gerne zur Verfügung: <a href="mailto:{{companyEmail}}">{{companyEmail}}</a></p><p>Mit freundlichen Grüssen<br>{{companyName}}</p>',
  'Guten Tag {{customerName}}, Ihr Termin am {{appointmentDate}} um {{appointmentTime}} Uhr wurde pausiert. Wir melden uns mit einem neuen Termin. Kontakt: {{companyEmail}}. Mit freundlichen Grüssen, {{companyName}}',
  true
),
(
  'paused_photographer',
  'Termin pausiert – Fotograf',
  'Auftrag #{{orderNo}} pausiert – Termin {{appointmentDate}} entfällt',
  '<p>Hallo {{photographerName}},</p><p>Auftrag <strong>#{{orderNo}}</strong> wurde pausiert. Der Termin am <strong>{{appointmentDate}} um {{appointmentTime}} Uhr</strong> an der Adresse {{address}} entfällt.</p><p>Du wirst über einen neuen Termin informiert.</p><p>Mit freundlichen Grüssen<br>{{companyName}}</p>',
  'Hallo {{photographerName}}, Auftrag #{{orderNo}} pausiert. Termin {{appointmentDate}} {{appointmentTime}} entfällt. Du wirst über neuen Termin informiert. Mit freundlichen Grüssen, {{companyName}}',
  true
),
(
  'paused_office',
  'Termin pausiert – Büro',
  'Auftrag #{{orderNo}} pausiert – {{appointmentDate}}',
  '<p>Auftrag <strong>#{{orderNo}}</strong> wurde pausiert.</p><p><strong>Kunde:</strong> {{customerName}}<br><strong>Fotograf:</strong> {{photographerName}}<br><strong>Termin:</strong> {{appointmentDate}} um {{appointmentTime}} Uhr entfällt<br><strong>Adresse:</strong> {{address}}</p><p>Der Auftrag ist weiterhin aktiv und wartet auf einen neuen Termin.</p>',
  'Auftrag #{{orderNo}} pausiert. Kunde: {{customerName}}, Fotograf: {{photographerName}}, Termin {{appointmentDate}} {{appointmentTime}} entfällt. Adresse: {{address}}.',
  true
)
ON CONFLICT (key) DO NOTHING;
