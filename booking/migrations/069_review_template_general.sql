-- Migration 069: Review-Request-Template allgemein (kein Auftragsbezug)
-- Aktualisiert das review_request-Template: kein #orderNo im Betreff/Body,
-- allgemeiner Text mit {{customerName}}, {{reviewLink}}, {{googleReviewLink}}, {{companyName}}.

INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, updated_at)
VALUES (
  'review_request',
  'Review-Anfrage',
  'Wie hat Ihnen Ihr Shooting bei {{companyName}} gefallen?',
  '<p>Guten Tag {{customerName}},</p>
<p>wir hoffen, dass alles zu Ihrer Zufriedenheit war. Ihr Feedback ist uns sehr wichtig – es hilft uns, unsere Dienstleistungen laufend zu verbessern.</p>
<p>Wir würden uns sehr freuen, wenn Sie sich kurz die Zeit nehmen und uns eine Bewertung hinterlassen:</p>
<p style="margin: 20px 0;">
  <a href="{{reviewLink}}" style="background:#4f46e5;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Jetzt bewerten (1–5 Sterne)</a>
</p>
<p>Oder direkt auf Google:</p>
<p style="margin: 16px 0;">
  <a href="{{googleReviewLink}}" style="background:#4285F4;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Auf Google bewerten</a>
</p>
<p>Vielen Dank für Ihr Vertrauen und Ihre Zeit.</p>
<p>Herzliche Grüsse<br>Ihr {{companyName}}-Team</p>',
  'Guten Tag {{customerName}},

wir hoffen, dass alles zu Ihrer Zufriedenheit war. Ihr Feedback ist uns sehr wichtig.

Jetzt bewerten: {{reviewLink}}

Auf Google bewerten: {{googleReviewLink}}

Herzliche Grüsse
Ihr {{companyName}}-Team',
  '["customerName","reviewLink","googleReviewLink","companyName"]',
  TRUE,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  label       = EXCLUDED.label,
  subject     = EXCLUDED.subject,
  body_html   = EXCLUDED.body_html,
  body_text   = EXCLUDED.body_text,
  placeholders = EXCLUDED.placeholders,
  active      = TRUE,
  updated_at  = NOW();
