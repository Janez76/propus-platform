-- Migration 004: Standard E-Mail-Templates seeden (idempotent)
-- Fuegt fehlende Templates ein; bereits vorhandene (ON CONFLICT) werden nicht ueberschrieben.

INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active)
VALUES
  (
    'provisional_created',
    'Provisorische Buchungsbestätigung',
    'Ihre provisorische Buchung #{{orderNo}} – Propus Immobilienfotografie',
    '<p>Guten Tag {{customerName}},</p>
<p>vielen Dank für Ihre Anfrage! Wir haben Ihre Buchung provisorisch erfasst.</p>
<p><strong>Auftrag Nr.:</strong> {{orderNo}}<br>
<strong>Objekt:</strong> {{address}}, {{zipCity}}<br>
<strong>Termin:</strong> {{appointmentDate}} um {{appointmentTime}} Uhr<br>
<strong>Fotograf:</strong> {{photographerName}}<br>
<strong>Leistungen:</strong> {{servicesSummary}}<br>
<strong>Gesamtbetrag:</strong> {{totalFormatted}}</p>
<p>Bitte beachten Sie: Diese Buchung ist <strong>provisorisch</strong> und wird am <strong>{{provisionalExpiresDate}}</strong> automatisch storniert, falls keine Bestätigung erfolgt.</p>
<p>Zur Bestätigung klicken Sie bitte hier: <a href="{{confirmationLink}}">Buchung bestätigen</a></p>
<p>Mit freundlichen Grüssen<br>{{companyName}}<br>{{companyEmail}}</p>',
    'Guten Tag {{customerName}}, Ihre provisorische Buchung #{{orderNo}} wurde erfasst. Termin: {{appointmentDate}} um {{appointmentTime}} Uhr. Bitte bestätigen Sie bis {{provisionalExpiresDate}}: {{confirmationLink}}',
    '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Name des Kunden"},{"key":"address","desc":"Objektadresse"},{"key":"zipCity","desc":"PLZ/Ort"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"photographerName","desc":"Fotograf"},{"key":"servicesSummary","desc":"Leistungen"},{"key":"totalFormatted","desc":"Gesamtbetrag"},{"key":"provisionalExpiresDate","desc":"Ablaufdatum Provisorium"},{"key":"confirmationLink","desc":"Bestätigungslink"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
    TRUE
  ),
  (
    'provisional_reminder',
    'Erinnerung: Provisorium läuft ab',
    'Erinnerung: Ihre provisorische Buchung #{{orderNo}} läuft ab',
    '<p>Guten Tag {{customerName}},</p>
<p>wir möchten Sie daran erinnern, dass Ihre provisorische Buchung <strong>#{{orderNo}}</strong> am <strong>{{provisionalExpiresDate}}</strong> abläuft.</p>
<p><strong>Termin:</strong> {{appointmentDate}} um {{appointmentTime}} Uhr<br>
<strong>Objekt:</strong> {{address}}, {{zipCity}}</p>
<p>Bitte bestätigen Sie Ihre Buchung rechtzeitig: <a href="{{confirmationLink}}">Jetzt bestätigen</a></p>
<p>Falls Sie kein Interesse mehr haben, können Sie diese E-Mail ignorieren – die Buchung wird automatisch storniert.</p>
<p>Mit freundlichen Grüssen<br>{{companyName}}<br>{{companyEmail}}</p>',
    'Erinnerung: Ihre provisorische Buchung #{{orderNo}} läuft am {{provisionalExpiresDate}} ab. Jetzt bestätigen: {{confirmationLink}}',
    '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Name des Kunden"},{"key":"provisionalExpiresDate","desc":"Ablaufdatum"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Objektadresse"},{"key":"zipCity","desc":"PLZ/Ort"},{"key":"confirmationLink","desc":"Bestätigungslink"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
    TRUE
  ),
  (
    'provisional_expired',
    'Provisorium abgelaufen',
    'Ihre Buchung #{{orderNo}} wurde automatisch storniert',
    '<p>Guten Tag {{customerName}},</p>
<p>leider wurde Ihre provisorische Buchung <strong>#{{orderNo}}</strong> automatisch storniert, da innerhalb der Frist keine Bestätigung eingegangen ist.</p>
<p>Falls Sie weiterhin einen Termin wünschen, freuen wir uns auf Ihre neue Anfrage.</p>
<p>Mit freundlichen Grüssen<br>{{companyName}}<br>{{companyEmail}}</p>',
    'Ihre provisorische Buchung #{{orderNo}} wurde mangels Bestätigung automatisch storniert. Für eine neue Anfrage kontaktieren Sie uns unter {{companyEmail}}.',
    '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Name des Kunden"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
    TRUE
  ),
  (
    'confirmed_customer',
    'Auftragsbestätigung an Kunden',
    'Auftragsbestätigung #{{orderNo}} – Propus Immobilienfotografie',
    '<p>Guten Tag {{customerName}},</p>
<p>vielen Dank! Ihre Buchung ist jetzt <strong>verbindlich bestätigt</strong>.</p>
<p><strong>Auftrag Nr.:</strong> {{orderNo}}<br>
<strong>Objekt:</strong> {{address}}, {{zipCity}}<br>
<strong>Termin:</strong> {{appointmentDate}} um {{appointmentTime}} Uhr<br>
<strong>Fotograf:</strong> {{photographerName}}<br>
<strong>Leistungen:</strong> {{servicesSummary}}<br>
<strong>Gesamtbetrag:</strong> {{totalFormatted}}</p>
<p>Wir freuen uns auf den Termin mit Ihnen.</p>
<p>Mit freundlichen Grüssen<br>{{companyName}}<br>{{companyEmail}}</p>',
    'Auftragsbestätigung #{{orderNo}}: Termin {{appointmentDate}} um {{appointmentTime}} Uhr, {{address}}. Gesamtbetrag: {{totalFormatted}}.',
    '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Name des Kunden"},{"key":"address","desc":"Objektadresse"},{"key":"zipCity","desc":"PLZ/Ort"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"photographerName","desc":"Fotograf"},{"key":"servicesSummary","desc":"Leistungen"},{"key":"totalFormatted","desc":"Gesamtbetrag"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
    TRUE
  ),
  (
    'confirmed_photographer',
    'Auftragsinfo an Fotografen',
    'Neuer Auftrag #{{orderNo}} – {{appointmentDate}} {{appointmentTime}}',
    '<p>Hallo {{photographerName}},</p>
<p>du hast einen neuen Auftrag erhalten:</p>
<p><strong>Auftrag Nr.:</strong> {{orderNo}}<br>
<strong>Kunde:</strong> {{customerName}}<br>
<strong>Telefon:</strong> {{customerPhone}}<br>
<strong>Objekt:</strong> {{address}}, {{zipCity}}<br>
<strong>Termin:</strong> {{appointmentDate}} um {{appointmentTime}} Uhr<br>
<strong>Leistungen:</strong> {{servicesSummary}}</p>
<p>Bitte bestätige den Termin beim Kunden.</p>
<p>Viele Grüsse<br>{{companyName}}</p>',
    'Neuer Auftrag #{{orderNo}}: {{appointmentDate}} {{appointmentTime}}, {{address}}, {{zipCity}}. Kunde: {{customerName}}, Tel. {{customerPhone}}.',
    '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"photographerName","desc":"Fotograf"},{"key":"customerName","desc":"Kundenname"},{"key":"customerPhone","desc":"Kundentelefon"},{"key":"address","desc":"Objektadresse"},{"key":"zipCity","desc":"PLZ/Ort"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"servicesSummary","desc":"Leistungen"},{"key":"companyName","desc":"Firmenname"}]',
    TRUE
  ),
  (
    'cancelled_customer',
    'Stornierung an Kunden',
    'Stornierung Ihrer Buchung #{{orderNo}}',
    '<p>Guten Tag {{customerName}},</p>
<p>Ihre Buchung <strong>#{{orderNo}}</strong> ({{appointmentDate}}, {{address}}) wurde storniert.</p>
<p>Grund: {{cancellationReason}}</p>
<p>Falls Sie Fragen haben oder einen neuen Termin wünschen, erreichen Sie uns unter {{companyEmail}}.</p>
<p>Mit freundlichen Grüssen<br>{{companyName}}</p>',
    'Ihre Buchung #{{orderNo}} vom {{appointmentDate}} wurde storniert. Grund: {{cancellationReason}}. Kontakt: {{companyEmail}}.',
    '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Name des Kunden"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"address","desc":"Objektadresse"},{"key":"cancellationReason","desc":"Stornierungsgrund"},{"key":"companyEmail","desc":"Firmen-E-Mail"},{"key":"companyName","desc":"Firmenname"}]',
    TRUE
  ),
  (
    'review_request',
    'Bewertungsanfrage',
    'Wie war Ihr Termin? Wir freuen uns über Ihr Feedback',
    '<p>Guten Tag {{customerName}},</p>
<p>wir hoffen, dass Ihr Fotoshooting am {{appointmentDate}} in {{address}} zu Ihrer Zufriedenheit verlief.</p>
<p>Über eine kurze Bewertung würden wir uns sehr freuen:</p>
<p><a href="{{googleReviewLink}}">⭐ Google-Bewertung schreiben</a></p>
<p>Vielen Dank für Ihr Vertrauen!</p>
<p>Mit freundlichen Grüssen<br>{{companyName}}<br>{{companyEmail}}</p>',
    'Wie war Ihr Termin am {{appointmentDate}}? Wir freuen uns über Ihr Feedback: {{googleReviewLink}}',
    '[{"key":"customerName","desc":"Name des Kunden"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"address","desc":"Objektadresse"},{"key":"googleReviewLink","desc":"Google-Bewertungslink"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
    TRUE
  )
ON CONFLICT (key) DO NOTHING;
