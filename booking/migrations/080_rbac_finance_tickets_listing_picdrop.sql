-- Migration 080: Neue Permission-Keys für Finanzen, Tickets, Listing, Picdrop und Portal-Rechnungen.
-- Spiegelt die Erweiterungen in booking/access-rbac.js → ALL_PERMISSION_KEYS und ROLE_PRESETS.
-- Idempotent: mehrfach ausführbar ohne Seiteneffekte.

-- ── Neue Permission-Definitionen ───────────────────────────────────────────
INSERT INTO permission_definitions (permission_key, description, module_tag) VALUES
  ('finance.read',         'Finanzen / Rechnungen einsehen',        'finance'),
  ('finance.manage',       'Finanzen / Rechnungen verwalten',       'finance'),
  ('tickets.read',         'Tickets / Postfach einsehen',           'tickets'),
  ('tickets.manage',       'Tickets / Postfach verwalten',          'tickets'),
  ('listing.manage',       'Listing-Page verwalten',                'listing'),
  ('picdrop.manage',       'Selekto (Bildauswahl) verwalten',       'picdrop'),
  ('portal_invoices.read', 'Portal-Rechnungen im Kundenportal',     'portal')
ON CONFLICT (permission_key) DO NOTHING;

-- ── super_admin & internal_admin bekommen alle neuen Keys ──────────────────
INSERT INTO system_role_permissions (role_key, permission_key)
SELECT r.role_key, pd.permission_key
FROM (VALUES ('super_admin'), ('internal_admin')) AS r(role_key)
CROSS JOIN permission_definitions pd
WHERE pd.permission_key IN (
  'finance.read', 'finance.manage',
  'tickets.read', 'tickets.manage',
  'listing.manage', 'picdrop.manage',
  'portal_invoices.read'
)
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- ── tour_manager: Finanzen, Tickets, Listing, Portal-Rechnungen ───────────
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('tour_manager', 'finance.read'),
  ('tour_manager', 'finance.manage'),
  ('tour_manager', 'tickets.read'),
  ('tour_manager', 'tickets.manage'),
  ('tour_manager', 'listing.manage'),
  ('tour_manager', 'portal_invoices.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- ── photographer: picdrop.manage (Bildauswahl-Workflow) ───────────────────
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('photographer', 'picdrop.manage')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- ── Portal-Rollen: portal_invoices.read ───────────────────────────────────
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('company_owner',    'portal_invoices.read'),
  ('company_admin',    'portal_invoices.read'),
  ('company_employee', 'portal_invoices.read'),
  ('customer_admin',   'portal_invoices.read'),
  ('customer_user',    'portal_invoices.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;
