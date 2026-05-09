-- Migration 093: E-Mail-Templates für flexible Buchungen
-- Zwei neue Templates (de-CH, Schweizer Spelling "ss" statt "ß"):
--   1) flex_booking_confirmation  — direkt nach Buchung mit Deadline.
--   2) flex_booking_disposition   — bei Statuswechsel disposition_offen → confirmed,
--      Hinweisblock oben mit dem disponierten Termin, sonst Standard-Layout.
--
-- Idempotent: ON CONFLICT (key, template_language) DO UPDATE.

-- 1) Bestätigung der flexiblen Buchung (Eingang) ----------------------------
INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, template_language)
VALUES (
  'flex_booking_confirmation',
  'Flexible Buchung — Eingangsbestätigung',
  'Ihre flexible Buchung #{{orderNo}} ist bei uns eingegangen',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 8px">Buchung eingegangen</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px">Guten Tag {{customerName}},<br><br>
    vielen Dank für Ihre Buchung. Sie haben eine <strong>flexible Aufnahme</strong> gewählt — wir disponieren den Termin innerhalb des von Ihnen gewünschten Zeitraums und informieren Sie spätestens einen Tag vor der Aufnahme.</p>
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Auftrag</span><strong>#{{orderNo}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Objekt</span><strong>{{address}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Spätestens am</span><strong>{{deadlineDate}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Frühestens ab</span><strong>{{flexibleEarliestDate}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:#888">Leistungen</span><strong>{{servicesSummary}}</strong>
      </div>
    </div>
    <p style="color:#555;font-size:13px;line-height:1.6;margin:0 0 16px">Sie erhalten von uns eine separate E-Mail mit Datum, Uhrzeit und zugewiesenem Fotografen, sobald der Termin disponiert ist.</p>
    <p style="color:#888;font-size:12px;text-align:center;margin:24px 0 0">Bei Fragen: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
  'Guten Tag {{customerName}},

vielen Dank für Ihre flexible Buchung #{{orderNo}}.

Wir disponieren den Termin innerhalb des von Ihnen gewünschten Zeitraums und informieren Sie spätestens einen Tag vor der Aufnahme.

Auftrag: #{{orderNo}}
Objekt: {{address}}
Spätestens am: {{deadlineDate}}
Frühestens ab: {{flexibleEarliestDate}}
Leistungen: {{servicesSummary}}

Bei Fragen: {{companyEmail}}

{{companyName}} · propus.ch',
  '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"address","desc":"Objektadresse"},{"key":"deadlineDate","desc":"Spätestes Aufnahmedatum"},{"key":"flexibleEarliestDate","desc":"Frühestmögliches Aufnahmedatum (oder leer)"},{"key":"servicesSummary","desc":"Zusammenfassung Leistungen"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
  TRUE,
  'de-CH'
) ON CONFLICT (key, template_language) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  placeholders = EXCLUDED.placeholders,
  active = EXCLUDED.active;

-- 2) Disposition: Termin steht ----------------------------------------------
INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, template_language)
VALUES (
  'flex_booking_disposition',
  'Flexible Buchung — Termin disponiert',
  'Termin disponiert: Auftrag #{{orderNo}} am {{appointmentDate}}',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <div style="background:#eaf5ec;border:1px solid #b6dcc0;border-radius:8px;padding:18px 20px;margin:0 0 24px">
      <div style="font-size:13px;color:#2a6e3f;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;margin-bottom:6px">Termin disponiert</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a1a">{{appointmentDate}} · {{appointmentTime}} Uhr</div>
      <div style="font-size:13px;color:#555;margin-top:4px">Fotograf: {{photographerName}}</div>
    </div>

    <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 8px">Ihr Termin steht</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px">Guten Tag {{customerName}},<br><br>
    wir haben den Termin für Ihre Aufnahme #{{orderNo}} disponiert.</p>

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

    <p style="color:#555;font-size:13px;line-height:1.6;margin:0">Bitte sorgen Sie dafür, dass das Objekt zum vereinbarten Zeitpunkt zugänglich ist.</p>
    <p style="color:#888;font-size:12px;text-align:center;margin:24px 0 0">Bei Fragen oder Änderungen: <a href="mailto:{{companyEmail}}" style="color:#9E8649">{{companyEmail}}</a></p>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
  'Guten Tag {{customerName}},

wir haben den Termin für Ihre Aufnahme #{{orderNo}} disponiert.

TERMIN DISPONIERT
{{appointmentDate}} · {{appointmentTime}} Uhr
Fotograf: {{photographerName}}

Adresse: {{address}}

Bitte sorgen Sie dafür, dass das Objekt zum vereinbarten Zeitpunkt zugänglich ist.

Bei Fragen oder Änderungen: {{companyEmail}}

{{companyName}} · propus.ch',
  '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"appointmentDate","desc":"Disponiertes Datum"},{"key":"appointmentTime","desc":"Disponierte Uhrzeit"},{"key":"address","desc":"Objektadresse"},{"key":"photographerName","desc":"Disponierter Fotograf"},{"key":"companyName","desc":"Firmenname"},{"key":"companyEmail","desc":"Firmen-E-Mail"}]',
  TRUE,
  'de-CH'
) ON CONFLICT (key, template_language) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  placeholders = EXCLUDED.placeholders,
  active = EXCLUDED.active;
