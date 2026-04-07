-- Migration 070: Google-Bewertungs-Flag in order_reviews
-- Admin kann manuell markieren ob der Kunde auf Google bewertet hat.
-- Beeinflusst Erinnerungs-Logik: keine automatische Erinnerung wenn google_review_left=TRUE.

ALTER TABLE order_reviews
  ADD COLUMN IF NOT EXISTS google_review_left BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN order_reviews.google_review_left IS
  'Admin-Flag: TRUE = Kunde hat auf Google bewertet. NULL/FALSE = noch keine Google-Bewertung bekannt.';

-- Auch Erinnerungs-Template seeden
INSERT INTO email_templates (key, label, subject, body_html, body_text, placeholders, active, updated_at)
VALUES (
  'review_reminder',
  'Review-Erinnerung (Google)',
  'Haben Sie uns auf Google bewertet? Wir wuerden uns freuen!',
  '<p>Guten Tag {{customerName}},</p>
<p>wir haben festgestellt, dass Sie unsere interne Bewertung noch nicht abgegeben haben – falls Sie noch kurz Zeit haben, wuerden wir uns sehr darueber freuen!</p>
<p>Und falls Sie uns noch nicht auf Google bewertet haben, ist das ganz einfach:</p>
<p style="margin: 20px 0;">
  <a href="{{googleReviewLink}}" style="background:#4285F4;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Auf Google bewerten</a>
</p>
<p>Oder hinterlassen Sie uns hier eine kurze Bewertung:</p>
<p style="margin: 16px 0;">
  <a href="{{reviewLink}}" style="background:#4f46e5;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Interne Bewertung (1–5 Sterne)</a>
</p>
<p>Herzliche Gruesse<br>Ihr {{companyName}}-Team</p>',
  'Auf Google bewerten: {{googleReviewLink}}
Interne Bewertung: {{reviewLink}}

Herzliche Gruesse
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
