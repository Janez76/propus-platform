-- Globale Portal-Rollen (z. B. interner Tour-Manager: sieht alle Kunden-Touren)
CREATE TABLE IF NOT EXISTS tour_manager.portal_staff_roles (
  email_norm TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'tour_manager',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NULL,
  PRIMARY KEY (email_norm, role)
);

CREATE INDEX IF NOT EXISTS idx_portal_staff_roles_role
  ON tour_manager.portal_staff_roles (role);
