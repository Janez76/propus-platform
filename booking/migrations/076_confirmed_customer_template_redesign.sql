-- Migration 076: confirmed_customer Template – überarbeitetes Design mit ICS-Hinweis
-- Modernes Propus-Branding, Details-Box, ICS-Kalenderhinweis, Google-Review-Sektion.

UPDATE email_templates
SET
  label      = 'Auftragsbestätigung an Kunde (überarbeitet)',
  subject    = 'Auftragsbestätigung #{{orderNo}} – Propus Immobilienfotografie',
  body_html  = '<!DOCTYPE html>
<html lang="de">
<body style="margin:0;padding:0;background:#f4f1eb;font-family:Arial,Helvetica,sans-serif;color:#222">
<div style="max-width:620px;margin:36px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.09)">

  <!-- Header -->
  <div style="background:#9E8649;padding:28px 36px 24px">
    <div style="color:#fff;font-size:22px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase">PROPUS</div>
    <div style="color:#f0e6c8;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px">Immobilienfotografie</div>
  </div>

  <!-- Body -->
  <div style="padding:36px 36px 28px">

    <h2 style="font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 6px">Ihre Buchung ist bestätigt</h2>
    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 28px">
      Guten Tag {{customerName}},<br><br>
      vielen Dank! Ihre Buchung ist jetzt <strong>verbindlich bestätigt</strong>. Wir freuen uns auf den Termin mit Ihnen.
    </p>

    <!-- Details-Box -->
    <div style="background:#fdfaf3;border:1px solid #e8d5a3;border-radius:8px;padding:22px 24px;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr>
          <td style="color:#888;padding:5px 0;width:38%">Auftrag Nr.</td>
          <td style="font-weight:700;padding:5px 0">{{orderNo}}</td>
        </tr>
        <tr>
          <td style="color:#888;padding:5px 0">Objekt</td>
          <td style="font-weight:700;padding:5px 0">{{address}}</td>
        </tr>
        <tr>
          <td style="color:#888;padding:5px 0">Termin</td>
          <td style="font-weight:700;padding:5px 0">{{appointmentDate}} um {{appointmentTime}} Uhr</td>
        </tr>
        <tr>
          <td style="color:#888;padding:5px 0">Fotograf</td>
          <td style="font-weight:700;padding:5px 0">{{photographerName}}</td>
        </tr>
        <tr>
          <td style="color:#888;padding:5px 0">Leistungen</td>
          <td style="font-weight:700;padding:5px 0">{{servicesSummary}}</td>
        </tr>
        <tr>
          <td style="color:#888;padding:5px 0">Gesamtbetrag</td>
          <td style="font-weight:700;padding:5px 0">{{totalFormatted}}</td>
        </tr>
      </table>
    </div>

    <!-- ICS-Hinweis -->
    <div style="background:#f0f7ff;border:1px solid #c8ddf0;border-radius:8px;padding:14px 18px;margin-bottom:28px;font-size:13px;color:#3a5a7a">
      📅 <strong>Kalendereinladung:</strong> Im Anhang dieser E-Mail finden Sie eine .ics-Datei – einfach öffnen um den Termin direkt in Ihren Kalender zu importieren.
    </div>

    <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 24px">
      Bei Fragen oder Änderungswünschen sind wir gerne für Sie da:<br>
      <a href="mailto:{{companyEmail}}" style="color:#9E8649;font-weight:600">{{companyEmail}}</a>
    </p>

    <p style="font-size:14px;color:#555;margin:0">
      Mit freundlichen Grüssen<br>
      <strong>{{companyName}}</strong>
    </p>
  </div>

  <!-- Google Review -->
  <div style="background:#fdfaf3;border-top:1px solid #ede8d8;padding:22px 36px;text-align:center">
    <p style="font-size:13px;color:#888;margin:0 0 12px">Wie hat Ihnen die Zusammenarbeit mit Propus gefallen?</p>
    <a href="{{googleReviewLink}}" style="display:inline-block;background:#fff;border:1px solid #e8d5a3;border-radius:6px;padding:9px 22px;font-size:13px;font-weight:600;color:#9E8649;text-decoration:none">
      ⭐ Bewertung auf Google
    </a>
  </div>

  <!-- Footer -->
  <div style="background:#f4f1eb;padding:18px 36px;text-align:center;font-size:11px;color:#aaa;line-height:1.7">
    © {{companyName}} · <a href="https://propus.ch" style="color:#9E8649;text-decoration:none">propus.ch</a><br>
    <span style="font-size:10px">{{companyEmail}}</span>
  </div>

</div>
</body>
</html>',
  body_text  = 'Guten Tag {{customerName}},

Ihre Buchung ist jetzt verbindlich bestätigt.

Auftrag Nr.:    {{orderNo}}
Objekt:         {{address}}
Termin:         {{appointmentDate}} um {{appointmentTime}} Uhr
Fotograf:       {{photographerName}}
Leistungen:     {{servicesSummary}}
Gesamtbetrag:   {{totalFormatted}}

Im Anhang finden Sie eine Kalendereinladung (.ics).

Bei Fragen: {{companyEmail}}

Mit freundlichen Grüssen
{{companyName}}',
  placeholders = '[
    {"key":"orderNo","desc":"Auftragsnummer"},
    {"key":"customerName","desc":"Kundenname"},
    {"key":"address","desc":"Objekt-Adresse"},
    {"key":"appointmentDate","desc":"Termin Datum"},
    {"key":"appointmentTime","desc":"Termin Uhrzeit"},
    {"key":"photographerName","desc":"Fotograf"},
    {"key":"servicesSummary","desc":"Alle Leistungen (kommagetrennt)"},
    {"key":"packageName","desc":"Paket"},
    {"key":"totalFormatted","desc":"Gesamtbetrag (CHF)"},
    {"key":"companyName","desc":"Firmenname"},
    {"key":"companyEmail","desc":"Firmen-E-Mail"},
    {"key":"googleReviewLink","desc":"Link zur Google-Bewertung"}
  ]',
  updated_at = NOW()
WHERE key = 'confirmed_customer';
