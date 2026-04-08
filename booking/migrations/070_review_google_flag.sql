-- Migration 070: Google-Review-Flag + Reminder-Template
-- Fuegt die Spalte google_review_left zur order_reviews-Tabelle hinzu
-- und erstellt das review_reminder E-Mail-Template.

-- Spalte fuer Google-Review-Flag
ALTER TABLE booking.order_reviews
  ADD COLUMN IF NOT EXISTS google_review_left BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN booking.order_reviews.google_review_left IS
  'Gibt an, ob der Kunde eine Google-Bewertung hinterlassen hat (manuell gesetzt).';

-- Reminder-Template (einmalige Erinnerung falls noch keine Google-Bewertung)
INSERT INTO booking.email_templates (key, subject, body_html)
VALUES (
  'review_reminder',
  'Haben Sie uns auf Google bewertet? Wir wuerden uns freuen!',
  '<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kurze Erinnerung: Ihre Bewertung</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#1a1a2e;padding:30px 40px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:22px;">{{companyName}}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px;">Guten Tag {{customerName}},</p>
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px;">
                wir haben Ihnen vor einiger Zeit eine Anfrage fuer eine Google-Bewertung gesendet.
                Falls Sie noch keine Gelegenheit hatten &ndash; wir wuerden uns sehr ueber Ihr Feedback freuen!
              </p>
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 30px;">
                Es dauert nur eine Minute und hilft anderen Kunden, uns zu finden.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 30px;">
                <tr>
                  <td style="background:#4285f4;border-radius:6px;padding:14px 32px;">
                    <a href="{{reviewUrl}}" style="color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;">
                      &#9733; Jetzt auf Google bewerten
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#666;font-size:13px;line-height:1.6;margin:0 0 10px;">
                Falls Sie bereits bewertet haben &ndash; herzlichen Dank! Diese Erinnerung
                wird Ihnen nicht noch einmal gesendet.
              </p>
              <p style="color:#666;font-size:14px;line-height:1.6;margin:0;">
                Mit freundlichen Gruessen,<br>
                Ihr {{companyName}}-Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
              <p style="color:#999;font-size:12px;margin:0;">
                {{companyName}} &bull; {{companyAddress}}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'
)
ON CONFLICT (key) DO NOTHING;
