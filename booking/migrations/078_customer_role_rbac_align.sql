-- Migration 078: customer-Rolle bereinigen und RBAC-Presets mit Frontend abgleichen
--
-- FK system_role_permissions → permission_definitions: dashboard.view muss existieren
-- (wird unten fuer tour_manager gesetzt; fehlte zuvor in permission_definitions).
INSERT INTO permission_definitions (permission_key, description, module_tag) VALUES
  ('dashboard.view', 'Dashboard ansehen', 'dashboard')
ON CONFLICT (permission_key) DO NOTHING;

--
-- Probleme behoben:
--   1. `customer`-Rolle hatte kein RBAC-Preset → immer Legacy-Fallback
--   2. customer_user/customer_admin fehlten tours.read → Portal-Routen geblockt
--   3. tour_manager fehlte dashboard.view → Dashboard nicht erreichbar
--   4. company_owner/company_employee fehlten tours.read → kein Portal-Zugriff
--   5. access_subject_system_roles-Zeilen mit role_key='customer' → customer_user

-- Schritt 1: Veraltete 'customer'-Rollenzuweisungen auf 'customer_user' migrieren
UPDATE access_subject_system_roles
SET role_key = 'customer_user'
WHERE role_key = 'customer'
  AND NOT EXISTS (
    SELECT 1 FROM access_subject_system_roles r2
    WHERE r2.subject_id = access_subject_system_roles.subject_id
      AND r2.role_key = 'customer_user'
  );

-- Doppelte Einträge bereinigen (falls jemand beide hatte)
DELETE FROM access_subject_system_roles
WHERE role_key = 'customer';

-- Schritt 2: system_roles um 'customer_user' ergänzen falls noch nicht vorhanden
INSERT INTO system_roles (role_key, label, description)
VALUES ('customer_user', 'Kunden-Benutzer', 'Portal eingeschränkt – Touren und Rechnungen einsehen')
ON CONFLICT (role_key) DO NOTHING;

-- Schritt 3: Fehlende Permission-Keys ergänzen (idempotent via ON CONFLICT DO NOTHING)
-- customer_user: tours.read für Portal-Routenzugriff (/portal/dashboard, /portal/tours, /portal/invoices)
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('customer_user', 'tours.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- customer_admin: tours.read + portal_team.manage + tours.manage für Portal-Zugriff und Team-Verwaltung
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('customer_admin', 'tours.read'),
  ('customer_admin', 'tours.manage'),
  ('customer_admin', 'portal_team.manage')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- tour_manager: dashboard.view war im Frontend-Fallback vorhanden, fehlte im Backend-Preset
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('tour_manager', 'dashboard.view')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- company_owner: tours.read für Portal-Touren-Ansicht
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('company_owner', 'tours.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- company_admin (deprecated): tours.read – Altdaten abgesichert, falls noch vorhanden
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('company_admin', 'tours.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;

-- company_employee: tours.read für Portal-Zugriff
INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('company_employee', 'tours.read')
ON CONFLICT (role_key, permission_key) DO NOTHING;
