-- Migration 062: Provisorium-Reminder-Templates mit Bestaetigungslink aktualisieren
-- Alle 3 Reminder-Templates erhalten einen Bestaetigungs-Button ({{confirmationLink}}).
-- Verwendet gleiches Design wie booking_confirmation_request (Gold-Button, Propus-Branding).

-- Reminder 1: Tag 1 (laeuft in 2 Tagen ab)
UPDATE email_templates
SET subject = 'Erinnerung: Ihr provisorischer Termin läuft in 2 Tagen ab – Auftrag #{{orderNo}}',
    body_html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 8px">Erinnerung: Termin bitte bestätigen</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">Guten Tag {{customerName}},<br><br>
    wir möchten Sie daran erinnern, dass Ihr provisorisch reservierter Termin in <strong>2 Tagen</strong> abläuft.</p>
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Datum</span><strong>{{appointmentDate}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Uhrzeit</span><strong>{{appointmentTime}} Uhr</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Adresse</span><strong>{{address}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:#888">Fotograf</span><strong>{{photographerName}}</strong>
      </div>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="{{confirmationLink}}" style="display:inline-block;background:#9E8649;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.03em">Termin jetzt bestätigen</a>
    </div>
    <p style="color:#888;font-size:12px;text-align:center;margin:0">Ohne Bestätigung wird der Termin automatisch freigegeben. Bei Fragen: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
    body_text = 'Guten Tag {{customerName}},

Ihr provisorischer Termin am {{appointmentDate}} um {{appointmentTime}} Uhr läuft in 2 Tagen ab.

Adresse: {{address}}
Fotograf: {{photographerName}}

Termin jetzt bestätigen: {{confirmationLink}}

Ohne Bestätigung wird der Termin automatisch freigegeben.

Mit freundlichen Grüssen
{{companyName}} · {{companyEmail}}',
    placeholders = '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Adresse"},{"key":"photographerName","desc":"Fotograf"},{"key":"confirmationLink","desc":"Bestätigungslink"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
    updated_at = NOW()
WHERE key = 'provisional_reminder_1';

-- Reminder 2: Tag 2 (laeuft morgen ab)
UPDATE email_templates
SET subject = 'Letzte Erinnerung: Provisorischer Termin läuft morgen ab – Auftrag #{{orderNo}}',
    body_html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#c0392b;font-size:18px;margin:0 0 8px">Letzte Erinnerung: Termin läuft morgen ab</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">Guten Tag {{customerName}},<br><br>
    Ihr provisorisch reservierter Termin läuft <strong>morgen</strong> ab. Bitte bestätigen Sie jetzt, damit wir den Slot für Sie reservieren können.</p>
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Datum</span><strong>{{appointmentDate}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Uhrzeit</span><strong>{{appointmentTime}} Uhr</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Adresse</span><strong>{{address}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:#888">Fotograf</span><strong>{{photographerName}}</strong>
      </div>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="{{confirmationLink}}" style="display:inline-block;background:#9E8649;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.03em">Termin jetzt bestätigen</a>
    </div>
    <p style="color:#888;font-size:12px;text-align:center;margin:0">Ohne Bestätigung wird der Termin morgen automatisch freigegeben. Bei Fragen: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
    body_text = 'Guten Tag {{customerName}},

LETZTE ERINNERUNG: Ihr provisorischer Termin am {{appointmentDate}} um {{appointmentTime}} Uhr läuft morgen ab.

Adresse: {{address}}
Fotograf: {{photographerName}}

Termin jetzt bestätigen: {{confirmationLink}}

Ohne Bestätigung wird der Termin morgen automatisch freigegeben.

Mit freundlichen Grüssen
{{companyName}} · {{companyEmail}}',
    placeholders = '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Adresse"},{"key":"photographerName","desc":"Fotograf"},{"key":"confirmationLink","desc":"Bestätigungslink"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
    updated_at = NOW()
WHERE key = 'provisional_reminder_2';

-- Reminder 3: Tag 3 (laeuft heute ab) – dringendster Ton
UPDATE email_templates
SET subject = 'Heute letzter Tag: Provisorischer Termin läuft ab – Auftrag #{{orderNo}}',
    body_html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#c0392b;font-size:18px;margin:0 0 8px">Letzter Tag: Termin wird heute freigegeben</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">Guten Tag {{customerName}},<br><br>
    Ihr provisorisch reservierter Termin läuft <strong>heute</strong> ab. Ohne Bestätigung wird die Reservierung automatisch freigegeben und Sie müssen einen neuen Termin vereinbaren.</p>
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Datum</span><strong>{{appointmentDate}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Uhrzeit</span><strong>{{appointmentTime}} Uhr</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Adresse</span><strong>{{address}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:#888">Fotograf</span><strong>{{photographerName}}</strong>
      </div>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="{{confirmationLink}}" style="display:inline-block;background:#c0392b;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.03em">Jetzt bestätigen – letzte Chance</a>
    </div>
    <p style="color:#888;font-size:12px;text-align:center;margin:0">Alternativ erreichen Sie uns direkt: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
    body_text = 'Guten Tag {{customerName}},

LETZTER TAG: Ihr provisorischer Termin am {{appointmentDate}} um {{appointmentTime}} Uhr läuft heute ab!

Adresse: {{address}}
Fotograf: {{photographerName}}

Jetzt bestätigen: {{confirmationLink}}

Ohne Bestätigung wird die Reservierung heute freigegeben.

Kontakt: {{companyEmail}}

Mit freundlichen Grüssen
{{companyName}}',
    placeholders = '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Adresse"},{"key":"photographerName","desc":"Fotograf"},{"key":"confirmationLink","desc":"Bestätigungslink"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
    updated_at = NOW()
WHERE key = 'provisional_reminder_3';

-- provisional_created Template ebenfalls mit Bestaetigungs-Button auffrischen (gleicher Stil)
UPDATE email_templates
SET body_html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 8px">Provisorische Buchung</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">Guten Tag {{customerName}},<br><br>
    vielen Dank für Ihre Anfrage! Wir haben Ihre Buchung <strong>provisorisch</strong> erfasst. Die Reservierung läuft am <strong>{{provisionalExpiresDate}}</strong> ab.</p>
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Auftrag</span><strong>#{{orderNo}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Datum</span><strong>{{appointmentDate}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Uhrzeit</span><strong>{{appointmentTime}} Uhr</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Adresse</span><strong>{{address}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Fotograf</span><strong>{{photographerName}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:#888">Leistungen</span><strong>{{servicesSummary}}</strong>
      </div>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="{{confirmationLink}}" style="display:inline-block;background:#9E8649;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.03em">Buchung bestätigen</a>
    </div>
    <p style="color:#888;font-size:12px;text-align:center;margin:0">Gültig bis {{provisionalExpiresDate}}. Bei Fragen: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
    updated_at = NOW()
WHERE key = 'provisional_created';
