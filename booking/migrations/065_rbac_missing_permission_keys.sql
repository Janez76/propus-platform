-- Migration 065: Fehlende Permission-Keys in permission_definitions eintragen (idempotent)
-- Behebt Foreign-Key-Fehler beim Speichern von Rollen-Presets via PATCH /api/admin/access/role-presets/:roleKey
-- Alle Keys aus ALL_PERMISSION_KEYS (access-rbac.js) müssen in permission_definitions vorhanden sein.

INSERT INTO permission_definitions (permission_key, description, module_tag) VALUES
  ('orders.assign',          'Auftrag zuweisen',              'orders'),
  ('orders.export',          'Auftraege exportieren',         'orders'),
  ('contacts.read',          'Kontakte ansehen',              'contacts'),
  ('contacts.manage',        'Kontakte verwalten',            'contacts'),
  ('products.manage',        'Produkte verwalten',            'products'),
  ('discount_codes.manage',  'Gutscheine verwalten',          'products'),
  ('calendar.manage',        'Kalender bearbeiten',           'calendar'),
  ('settings.manage',        'Einstellungen verwalten',       'settings'),
  ('billing.read',           'Abrechnung einsehen',           'billing'),
  ('backups.manage',         'Backups verwalten',             'system'),
  ('bugs.read',              'Fehlerberichte ansehen',        'system'),
  ('roles.manage',           'Rollen verwalten',              'system'),
  ('users.manage',           'Benutzer verwalten',            'system')
ON CONFLICT (permission_key) DO NOTHING;

-- super_admin und internal_admin bekommen alle neuen Keys
INSERT INTO system_role_permissions (role_key, permission_key)
SELECT r.role_key, pd.permission_key
FROM (VALUES ('super_admin'), ('internal_admin')) AS r(role_key)
CROSS JOIN permission_definitions pd
WHERE pd.permission_key IN (
  'orders.assign', 'orders.export',
  'contacts.read', 'contacts.manage',
  'products.manage', 'discount_codes.manage',
  'calendar.manage',
  'settings.manage', 'billing.read', 'backups.manage',
  'bugs.read', 'roles.manage', 'users.manage'
)
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- customer_admin: contacts.read + contacts.manage
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('customer_admin', 'contacts.read'),
  ('customer_admin', 'contacts.manage')
ON CONFLICT (role_key, permission_key) DO NOTHING;
