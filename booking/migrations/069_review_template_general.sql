-- Migration 069: Review-Request E-Mail-Template auf allgemeine Vorlage umstellen
-- Das Template soll nicht mehr spezifisch auf den Auftrag eingehen.

UPDATE booking.email_templates
SET
  subject = 'Wie hat Ihnen Ihr Shooting bei {{companyName}} gefallen?',
  body_html = '<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ihre Meinung ist uns wichtig</title>
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
                wir hoffen, Ihr Shooting bei uns hat Ihnen gefallen! Ihre Meinung ist uns sehr wichtig
                und hilft uns, unseren Service kontinuierlich zu verbessern.
              </p>
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 30px;">
                Wir wuerden uns sehr freuen, wenn Sie sich einen Moment Zeit nehmen und uns eine Bewertung
                auf Google hinterlassen.
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
              <p style="color:#333;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Alternativ koennen Sie uns auch direkt hier eine kurze Rueckmeldung geben:
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 30px;">
                <tr>
                  <td style="background:#f0f0f0;border:1px solid #ddd;border-radius:6px;padding:12px 28px;">
                    <a href="{{feedbackUrl}}" style="color:#333;text-decoration:none;font-size:15px;">
                      Direktes Feedback geben
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#666;font-size:14px;line-height:1.6;margin:0;">
                Herzlichen Dank fuer Ihr Vertrauen!<br>
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
WHERE key = 'review_request';
