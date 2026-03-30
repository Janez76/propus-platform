-- Tour-Manager-Modul: Permission-Keys und System-Rolle (idempotent)
INSERT INTO permission_definitions (permission_key, description, module_tag) VALUES
  ('tours.read', 'Touren ansehen', 'tours'),
  ('tours.manage', 'Touren bearbeiten', 'tours'),
  ('tours.assign', 'Touren zuweisen', 'tours'),
  ('tours.cross_company', 'Alle Touren firmenuebergreifend', 'tours'),
  ('tours.archive', 'Touren archivieren', 'tours'),
  ('tours.link_matterport', 'Matterport verknuepfen', 'tours'),
  ('portal_team.manage', 'Portal-Team verwalten', 'tours')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO system_roles (role_key, label, description) VALUES
  ('tour_manager', 'Tour-Manager (intern)', 'Firmenuebergreifend Touren und Portal-Team')
ON CONFLICT (role_key) DO NOTHING;

INSERT INTO system_role_permissions (role_key, permission_key) VALUES
  ('tour_manager', 'tours.read'),
  ('tour_manager', 'tours.manage'),
  ('tour_manager', 'tours.assign'),
  ('tour_manager', 'tours.cross_company'),
  ('tour_manager', 'tours.archive'),
  ('tour_manager', 'tours.link_matterport'),
  ('tour_manager', 'portal_team.manage'),
  ('super_admin', 'tours.read'),
  ('super_admin', 'tours.manage'),
  ('super_admin', 'tours.assign'),
  ('super_admin', 'tours.cross_company'),
  ('super_admin', 'tours.archive'),
  ('super_admin', 'tours.link_matterport'),
  ('super_admin', 'portal_team.manage'),
  ('internal_admin', 'tours.read'),
  ('internal_admin', 'tours.manage'),
  ('internal_admin', 'tours.assign'),
  ('internal_admin', 'tours.cross_company'),
  ('internal_admin', 'tours.archive'),
  ('internal_admin', 'tours.link_matterport'),
  ('internal_admin', 'portal_team.manage')
ON CONFLICT (role_key, permission_key) DO NOTHING;
