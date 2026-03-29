-- Migration 047: Neue Permission-Keys fuer granulare Modul-Absicherung
-- Ergaenzt orders.create, orders.delete, photographers.read/manage,
-- calendar.view, emails.manage, bugs.manage, reviews.manage

INSERT INTO permission_definitions (permission_key, description, module_tag) VALUES
  ('orders.create',        'Bestellungen anlegen',          'orders'),
  ('orders.delete',        'Bestellungen loeschen',         'orders'),
  ('photographers.read',   'Fotografen ansehen',            'photographers'),
  ('photographers.manage', 'Fotografen verwalten',          'photographers'),
  ('calendar.view',        'Kalender ansehen',              'calendar'),
  ('emails.manage',        'E-Mail-Templates verwalten',    'emails'),
  ('bugs.manage',          'Bug-Reports verwalten',         'bugs'),
  ('reviews.manage',       'Bewertungen verwalten',         'reviews')
ON CONFLICT (permission_key) DO NOTHING;

-- Aeltere Installationen koennen RBAC-Tabellen bereits haben, aber ohne seedRbacIfNeeded
-- gestartete Rollenstammdaten. 047 referenziert diese Rollen per FK und muss sie daher
-- vorab idempotent anlegen.
INSERT INTO system_roles (role_key, label, description) VALUES
  ('super_admin', 'Super-Admin', 'Voller Zugriff'),
  ('internal_admin', 'Interner Admin', 'Admin-Panel'),
  ('photographer', 'Fotograf', 'Auftraege und Kalender'),
  ('company_owner', 'Firmen-Hauptkontakt', 'Company Workspace volle Firmensicht'),
  ('company_admin', 'Firmen-Admin', 'Company Workspace'),
  ('company_employee', 'Firmen-Mitarbeiter', 'Company Workspace eingeschraenkt'),
  ('customer_admin', 'Kunden-Admin', 'Portal / Kunde erweitert'),
  ('customer_user', 'Kunden-Benutzer', 'Portal eingeschraenkt')
ON CONFLICT (role_key) DO NOTHING;

-- super_admin + internal_admin: alle neuen Keys
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('super_admin',    'orders.create'),
  ('super_admin',    'orders.delete'),
  ('super_admin',    'photographers.read'),
  ('super_admin',    'photographers.manage'),
  ('super_admin',    'calendar.view'),
  ('super_admin',    'emails.manage'),
  ('super_admin',    'bugs.manage'),
  ('super_admin',    'reviews.manage'),
  ('internal_admin', 'orders.create'),
  ('internal_admin', 'orders.delete'),
  ('internal_admin', 'photographers.read'),
  ('internal_admin', 'photographers.manage'),
  ('internal_admin', 'calendar.view'),
  ('internal_admin', 'emails.manage'),
  ('internal_admin', 'bugs.manage'),
  ('internal_admin', 'reviews.manage')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- photographer: calendar.view + photographers.read
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('photographer', 'calendar.view'),
  ('photographer', 'photographers.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- company_admin: orders.create + calendar.view
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('company_admin', 'orders.create'),
  ('company_admin', 'calendar.view')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- company_employee: calendar.view
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('company_employee', 'calendar.view')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- customer_admin: orders.create
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('customer_admin', 'orders.create')
ON CONFLICT (role_key, permission_key) DO NOTHING;
