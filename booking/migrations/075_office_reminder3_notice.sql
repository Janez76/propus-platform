-- Migration 075: Büro-Benachrichtigung beim letzten Provisorium-Reminder (Tag 3)
-- Das Büro erhält jetzt erst am letzten Tag vor dem Ablauf eine einzige Benachrichtigung,
-- statt bei jeder Zwischenstufe (Erstbuchung, pending→provisional, Reminder 1 & 2).

INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, template_language)
VALUES (
  'office_provisional_expiry_notice',
  'Büro-Hinweis: Provisorium läuft heute ab (letzter Tag)',
  'Auftrag {{orderNo}} – Bestätigung noch ausstehend, läuft heute ab',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography – Intern</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#c0392b;font-size:18px;margin:0 0 8px">Bestätigung ausstehend – Termin läuft heute ab</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 24px">
    Auftrag <strong>#{{orderNo}}</strong> von <strong>{{customerName}}</strong> wurde noch immer nicht bestätigt. Die provisorische Reservierung läuft <strong>heute</strong> ab und wird automatisch freigegeben.</p>
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
    <p style="color:#888;font-size:12px">Ohne manuelle Intervention wird der Slot heute automatisch freigegeben.</p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · Intern
  </div>
</div>
</body></html>',
  'INTERN: Provisorium läuft heute ab

Auftrag #{{orderNo}} von {{customerName}} wurde noch immer nicht bestätigt.
Die Reservierung läuft heute ab und wird automatisch freigegeben.

Kunde: {{customerName}} ({{customerEmail}})
Termin: {{appointmentDate}} {{appointmentTime}} Uhr
Adresse: {{address}}

Ohne manuelle Intervention wird der Slot heute automatisch freigegeben.',
  '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"customerEmail","desc":"Kunden-E-Mail"},{"key":"appointmentDate","desc":"Termin Datum"},{"key":"appointmentTime","desc":"Termin Uhrzeit"},{"key":"address","desc":"Adresse"},{"key":"companyName","desc":"Firmenname"}]',
  true,
  'de-CH'
) ON CONFLICT (key, template_language) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  active = EXCLUDED.active;
