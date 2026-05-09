-- Migration 095: Mail-Template fuer Flex-Deadline-Reminder an Office.
-- Wird vom Cron-Job booking/jobs/flex-deadline-reminder.js verwendet,
-- wenn ein flex-Auftrag innerhalb 7 Tagen disponiert sein sollte.

INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, template_language)
VALUES (
  'flex_deadline_office_reminder',
  'Flex-Deadline naht — Office-Reminder',
  'Disposition offen — Auftrag #{{orderNo}} laeuft in {{daysUntilDeadline}} Tagen ab',
  '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#222;background:#f9f6f0;margin:0;padding:0">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#9E8649;padding:28px 32px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.15em">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Real Estate Photography</div>
  </div>
  <div style="padding:32px">
    <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:18px 20px;margin:0 0 24px">
      <div style="font-size:13px;color:#92400e;letter-spacing:0.08em;text-transform:uppercase;font-weight:700;margin-bottom:6px">Disposition naht</div>
      <div style="font-size:18px;font-weight:700;color:#1a1a1a">Spaetestens am {{deadlineDate}}</div>
      <div style="font-size:13px;color:#555;margin-top:4px">Noch {{daysUntilDeadline}} Tage bis Deadline</div>
    </div>

    <h2 style="color:#1a1a1a;font-size:18px;margin:0 0 8px">Auftrag #{{orderNo}} disponieren</h2>
    <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px">Der Kunde hat eine flexible Buchung mit Deadline gestellt. Bitte Fotograf, Datum und Uhrzeit waehlen und auf <strong>Bestaetigt</strong> setzen.</p>

    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:20px;margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Kunde</span><strong>{{customerName}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Objekt</span><strong>{{address}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:13px">
        <span style="color:#888">Spaetestens am</span><strong>{{deadlineDate}}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:13px">
        <span style="color:#888">Frueheste-ab</span><strong>{{flexibleEarliestDate}}</strong>
      </div>
    </div>

    <div style="text-align:center;margin:24px 0">
      <a href="{{adminOrderLink}}" style="display:inline-block;background:#9E8649;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.03em">Auftrag oeffnen</a>
    </div>
  </div>
  <div style="background:#f9f6f0;padding:16px 32px;text-align:center;font-size:11px;color:#aaa">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649">propus.ch</a>
  </div>
</div>
</body></html>',
  'Disposition naht — Auftrag #{{orderNo}}

Spaetestens am: {{deadlineDate}} (noch {{daysUntilDeadline}} Tage)

Kunde: {{customerName}}
Objekt: {{address}}
Spaetestens am: {{deadlineDate}}
Frueheste-ab: {{flexibleEarliestDate}}

Auftrag oeffnen: {{adminOrderLink}}

{{companyName}} · propus.ch',
  '[{"key":"orderNo","desc":"Auftragsnummer"},{"key":"customerName","desc":"Kundenname"},{"key":"address","desc":"Objektadresse"},{"key":"deadlineDate","desc":"Spaetestes Aufnahmedatum"},{"key":"daysUntilDeadline","desc":"Tage bis Deadline"},{"key":"flexibleEarliestDate","desc":"Frueheste-ab"},{"key":"adminOrderLink","desc":"Link zum Admin-Auftrag"},{"key":"companyName","desc":"Firmenname"}]',
  TRUE,
  'de-CH'
) ON CONFLICT (key, template_language) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  body_text = EXCLUDED.body_text,
  placeholders = EXCLUDED.placeholders,
  active = EXCLUDED.active;
