-- Migration 079: portalMagicLink-Platzhalter in Kunden-E-Mail-Templates ergänzen
--
-- Fügt {{portalMagicLink}} als CTA-Button in kundenseitige Templates ein,
-- die noch keinen Portal-Link enthalten.
-- Idempotent: UPDATE WHERE body_html NOT LIKE '%portalMagicLink%'
--
-- Betroffene Templates (customer-facing):
--   confirmed_customer     - Buchungsbestätigung
--   provisional_created    - Provisorische Buchung
--   booking_confirmation_request - Bestätigungsanfrage
--   review_request         - Bewertungsanfrage
--   review_reminder        - Bewertungserinnerung
--   paused_customer        - Buchung pausiert
--
-- Der Button wird nach dem letzten Absatz eingefügt, vor dem Abschluss-div.
-- Formatierung: gleicher Stil wie bestehende CTA-Buttons im System.

-- confirmed_customer
UPDATE email_templates
SET body_html = REPLACE(
  body_html,
  '</div><!-- /content -->',
  '<div style="margin-top:24px;text-align:center">'
  || '<a href="{{portalMagicLink}}" style="display:inline-block;background:#111827;color:#ffffff;'
  || 'padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">'
  || 'Buchung im Portal ansehen</a></div>'
  || '</div><!-- /content -->'
),
updated_at = NOW()
WHERE key = 'confirmed_customer'
  AND active = true
  AND body_html NOT LIKE '%portalMagicLink%'
  AND body_html LIKE '%</div><!-- /content -->%';

-- provisional_created
UPDATE email_templates
SET body_html = REPLACE(
  body_html,
  '</div><!-- /content -->',
  '<div style="margin-top:24px;text-align:center">'
  || '<a href="{{portalMagicLink}}" style="display:inline-block;background:#111827;color:#ffffff;'
  || 'padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">'
  || 'Buchung im Portal ansehen</a></div>'
  || '</div><!-- /content -->'
),
updated_at = NOW()
WHERE key = 'provisional_created'
  AND active = true
  AND body_html NOT LIKE '%portalMagicLink%'
  AND body_html LIKE '%</div><!-- /content -->%';

-- booking_confirmation_request
UPDATE email_templates
SET body_html = REPLACE(
  body_html,
  '</div><!-- /content -->',
  '<div style="margin-top:24px;text-align:center">'
  || '<a href="{{portalMagicLink}}" style="display:inline-block;background:#111827;color:#ffffff;'
  || 'padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">'
  || 'Buchung im Portal ansehen</a></div>'
  || '</div><!-- /content -->'
),
updated_at = NOW()
WHERE key = 'booking_confirmation_request'
  AND active = true
  AND body_html NOT LIKE '%portalMagicLink%'
  AND body_html LIKE '%</div><!-- /content -->%';

-- review_request
UPDATE email_templates
SET body_html = REPLACE(
  body_html,
  '</div><!-- /content -->',
  '<div style="margin-top:24px;text-align:center">'
  || '<a href="{{portalMagicLink}}" style="display:inline-block;background:#9e8649;color:#ffffff;'
  || 'padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px">'
  || 'Meine Touren ansehen</a></div>'
  || '</div><!-- /content -->'
),
updated_at = NOW()
WHERE key IN ('review_request', 'review_reminder')
  AND active = true
  AND body_html NOT LIKE '%portalMagicLink%'
  AND body_html LIKE '%</div><!-- /content -->%';
