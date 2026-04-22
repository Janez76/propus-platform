-- 086: Portal-Permissions + tour_manager-Scope laut Kunden-Portal-Plan
-- (Seed im Code legt fehlende Keys an; Migration bereinigt tour_manager-Altrechte.)

INSERT INTO permission_definitions (permission_key, description, module_tag) VALUES
  ('reviews.read', 'Rezensionen ansehen', 'reviews')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO permission_definitions (permission_key, description, module_tag) VALUES
  ('portal.orders.read', 'Portal: Bestellungen ansehen', 'portal'),
  ('portal.orders.cancel', 'Portal: Stornieren', 'portal'),
  ('portal.orders.reschedule', 'Portal: Umbuchen', 'portal'),
  ('portal.messages.read', 'Portal: Nachrichten lesen', 'portal'),
  ('portal.messages.write', 'Portal: Nachrichten senden', 'portal'),
  ('portal.invoices.read', 'Portal: Rechnungsdaten ansehen', 'portal'),
  ('portal.team.read', 'Portal: Team ansehen', 'portal'),
  ('portal.team.manage', 'Portal: Team verwalten', 'portal'),
  ('portal.profile.update', 'Portal: Profil bearbeiten', 'portal')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO system_roles (role_key, label, description) VALUES
  ('customer_admin', 'Kunden-Admin (Portal)', 'Eigener Workspace inkl. Teamverwaltung'),
  ('customer_user', 'Kunden-Benutzer (Portal)', 'Eingeschraenkt: Bestellungen, Nachrichten, Rechnungen'),
  ('company_owner', 'Firmen-Inhaber (Portal)', 'Legacy-Parallel zu customer_admin'),
  ('company_employee', 'Firmen-Mitarbeiter (Portal)', 'Legacy-Parallel zu customer_user')
ON CONFLICT (role_key) DO NOTHING;

-- Alte breite tour_manager-Rechte entfernen (wurden ersetzt)
DELETE FROM system_role_permissions
 WHERE role_key = 'tour_manager'
   AND permission_key IN (
     'finance.read', 'finance.manage', 'tickets.read', 'tickets.manage', 'listing.manage'
   );

INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('tour_manager', 'orders.read'),
  ('tour_manager', 'orders.update'),
  ('tour_manager', 'calendar.view'),
  ('tour_manager', 'customers.read'),
  ('tour_manager', 'reviews.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- Kunden-Portal: Presets (idempotent)
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('customer_admin', 'portal.orders.read'),
  ('customer_admin', 'portal.orders.cancel'),
  ('customer_admin', 'portal.orders.reschedule'),
  ('customer_admin', 'portal.messages.read'),
  ('customer_admin', 'portal.messages.write'),
  ('customer_admin', 'portal.invoices.read'),
  ('customer_admin', 'portal.team.read'),
  ('customer_admin', 'portal.team.manage'),
  ('customer_admin', 'portal.profile.update')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('customer_user', 'portal.orders.read'),
  ('customer_user', 'portal.orders.cancel'),
  ('customer_user', 'portal.orders.reschedule'),
  ('customer_user', 'portal.messages.read'),
  ('customer_user', 'portal.messages.write'),
  ('customer_user', 'portal.invoices.read'),
  ('customer_user', 'portal.profile.update')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('company_owner', 'portal.orders.read'),
  ('company_owner', 'portal.orders.cancel'),
  ('company_owner', 'portal.orders.reschedule'),
  ('company_owner', 'portal.messages.read'),
  ('company_owner', 'portal.messages.write'),
  ('company_owner', 'portal.invoices.read'),
  ('company_owner', 'portal.team.read'),
  ('company_owner', 'portal.team.manage'),
  ('company_owner', 'portal.profile.update')
ON CONFLICT (role_key, permission_key) DO NOTHING;

INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('company_employee', 'portal.orders.read'),
  ('company_employee', 'portal.orders.cancel'),
  ('company_employee', 'portal.orders.reschedule'),
  ('company_employee', 'portal.messages.read'),
  ('company_employee', 'portal.messages.write'),
  ('company_employee', 'portal.invoices.read'),
  ('company_employee', 'portal.profile.update')
ON CONFLICT (role_key, permission_key) DO NOTHING;
