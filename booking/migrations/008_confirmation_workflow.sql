-- Migration 008: Kunden-Bestätigungs-Workflow + CC-Empfänger
-- Additive Erweiterungen: neue Spalten, kein Breaking Change.

-- 1. orders: Bestätigungs-Token und Status
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS confirmation_token     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmation_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmation_pending_since    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attendee_emails                TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS onsite_email                   TEXT DEFAULT NULL;

COMMENT ON COLUMN orders.confirmation_token IS
  'Einmaliger Token fuer Kunden-Bestaetigungslink. NULL = kein offener Link.';
COMMENT ON COLUMN orders.confirmation_token_expires_at IS
  'Ablaufzeit des Bestaetigungs-Tokens (3 Tage ab Erstellung).';
COMMENT ON COLUMN orders.confirmation_pending_since IS
  'Zeitpunkt ab dem die Bestellung auf Bestaetigung wartet (fuer 24h-Provisorium-Job).';
COMMENT ON COLUMN orders.attendee_emails IS
  'Kommagetrennte E-Mail-Adressen weiterer Personen fuer Terminbenachrichtigungen (ohne Preise).';
COMMENT ON COLUMN orders.onsite_email IS
  'E-Mail des Kontakts vor Ort (optional).';

-- 2. Neue E-Mail-Templates seeden

-- Template: Bestätigungsanforderung (Neubuchung)
INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, template_language)
VALUES (
  'booking_confirmation_request',
  'Terminbestätigung anfordern (Neubuchung)',
  'Bitte bestätigen Sie Ihren Termin – Auftrag {{orderNo}}',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 8px">Terminbestätigung erforderlich</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">Guten Tag {{customerName}},<br><br>
    wir haben Ihren Auftrag <strong>#{{orderNo}}</strong> erhalten. Bitte bestätigen Sie den folgenden Termin:</p>
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
      <a href="{{confirmationLink}}" style="display:inline-block;background:#9E8649;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.03em">Termin bestätigen</a>
    </div>
    <p style="color:#888;font-size:12px;text-align:center;margin:0">Dieser Link ist 3 Tage gültig. Bei Fragen: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
  'Guten Tag {{customerName}},

Bitte bestätigen Sie Ihren Termin für Auftrag #{{orderNo}}:

Datum: {{appointmentDate}}
Uhrzeit: {{appointmentTime}} Uhr
Adresse: {{address}}
Fotograf: {{photographerName}}

Termin bestätigen: {{confirmationLink}}

Dieser Link ist 3 Tage gültig.

{{companyName}} · {{companyEmail}}',
  '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Adresse"},{"key":"photographerName","desc":"Fotograf"},{"key":"confirmationLink","desc":"Bestätigungslink"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
  true,
  'de-CH'
) ON CONFLICT (key, template_language) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  active = EXCLUDED.active;

-- Template: Bestätigungsanforderung nach Terminänderung
INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, template_language)
VALUES (
  'booking_change_confirmation_request',
  'Terminbestätigung anfordern (Terminänderung)',
  'Neuer Termin – bitte bestätigen – Auftrag {{orderNo}}',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 8px">Ihr Termin wurde geändert</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">Guten Tag {{customerName}},<br><br>
    für Ihren Auftrag <strong>#{{orderNo}}</strong> wurde ein neuer Termin festgelegt. Bitte bestätigen Sie diesen:</p>
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Neues Datum</span><strong>{{appointmentDate}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Neue Uhrzeit</span><strong>{{appointmentTime}} Uhr</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Adresse</span><strong>{{address}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:#888">Fotograf</span><strong>{{photographerName}}</strong>
      </div>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="{{confirmationLink}}" style="display:inline-block;background:#9E8649;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.03em">Neuen Termin bestätigen</a>
    </div>
    <p style="color:#888;font-size:12px;text-align:center;margin:0">Dieser Link ist 3 Tage gültig. Bei Fragen: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
  'Guten Tag {{customerName}},

Für Ihren Auftrag #{{orderNo}} wurde ein neuer Termin festgelegt:

Neues Datum: {{appointmentDate}}
Neue Uhrzeit: {{appointmentTime}} Uhr
Adresse: {{address}}
Fotograf: {{photographerName}}

Neuen Termin bestätigen: {{confirmationLink}}

Dieser Link ist 3 Tage gültig.

{{companyName}} · {{companyEmail}}',
  '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Adresse"},{"key":"photographerName","desc":"Fotograf"},{"key":"confirmationLink","desc":"Bestätigungslink"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
  true,
  'de-CH'
) ON CONFLICT (key, template_language) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  active = EXCLUDED.active;

-- Template: CC-Terminbenachrichtigung für weitere Personen (ohne Preis)
INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, template_language)
VALUES (
  'attendee_notification',
  'Terminbenachrichtigung (weitere Personen, ohne Preis)',
  'Termininfo Auftrag {{orderNo}} – {{appointmentDate}} {{appointmentTime}} Uhr',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 8px">Termininformation</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">Sie wurden zu folgendem Fototermin eingeladen:</p>
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="margin-bottom:10px;font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Auftrag</span><strong>#{{orderNo}}</strong>
      </div>
      <div style="margin-bottom:10px;font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Status</span><strong>{{statusLabel}}</strong>
      </div>
      <div style="margin-bottom:10px;font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Datum</span><strong>{{appointmentDate}}</strong>
      </div>
      <div style="margin-bottom:10px;font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Uhrzeit</span><strong>{{appointmentTime}} Uhr</strong>
      </div>
      <div style="margin-bottom:10px;font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Adresse</span><strong>{{address}}, {{zipCity}}</strong>
      </div>
      <div style="font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Fotograf</span><strong>{{photographerName}}</strong>
      </div>
    </div>
    <p style="color:#888;font-size:12px;text-align:center;margin:0">Bei Fragen: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
  'Termininformation – Auftrag #{{orderNo}}

Status: {{statusLabel}}
Datum: {{appointmentDate}}
Uhrzeit: {{appointmentTime}} Uhr
Adresse: {{address}}, {{zipCity}}
Fotograf: {{photographerName}}

Bei Fragen: {{companyEmail}}
{{companyName}}',
  '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"statusLabel","desc":"Status (deutsch)"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Adresse"},{"key":"zipCity","desc":"PLZ/Ort"},{"key":"photographerName","desc":"Fotograf"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
  true,
  'de-CH'
) ON CONFLICT (key, template_language) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  active = EXCLUDED.active;

-- Template: Office-Hinweis bei ausstehender Bestätigung (24h)
INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, template_language)
VALUES (
  'office_confirmation_pending_notice',
  'Hinweis: Bestätigung ausstehend (Office)',
  'Auftrag {{orderNo}} – Bestätigung noch ausstehend',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography – Intern</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#c0392b;font-size:18px;margin:0 0 8px">Bestätigung ausstehend – Termin wird provisorisch</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">
    Auftrag <strong>#{{orderNo}}</strong> von <strong>{{customerName}}</strong> wartet seit über 24 Stunden auf Kundenbestätigung und wird jetzt auf <strong>Provisorisch</strong> gesetzt.</p>
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="margin-bottom:8px;font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Kunde</span><strong>{{customerName}}</strong>
      </div>
      <div style="margin-bottom:8px;font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">E-Mail</span><strong>{{customerEmail}}</strong>
      </div>
      <div style="margin-bottom:8px;font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Termin</span><strong>{{appointmentDate}} {{appointmentTime}} Uhr</strong>
      </div>
      <div style="font-size:13px;display:flex;justify-content:space-between">
        <span style="color:#888">Adresse</span><strong>{{address}}</strong>
      </div>
    </div>
    <p style="color:#888;font-size:12px">Der Slot ist nun provisorisch blockiert. Bei Ablauf ohne Bestätigung wird der Termin freigegeben.</p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · Intern
  </div>
</div>
</body></html>',
  'INTERN: Bestätigung ausstehend

Auftrag #{{orderNo}} von {{customerName}} wartet seit über 24h auf Bestätigung und wird auf Provisorisch gesetzt.

Kunde: {{customerName}} ({{customerEmail}})
Termin: {{appointmentDate}} {{appointmentTime}} Uhr
Adresse: {{address}}

Der Slot ist nun provisorisch blockiert.',
  '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"customerEmail","desc":"Kunden-E-Mail"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Adresse"},{"key":"companyName","desc":"Firmenname"}]',
  true,
  'de-CH'
) ON CONFLICT (key, template_language) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  active = EXCLUDED.active;
