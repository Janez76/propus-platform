-- Migration 046: Zentrales Rechte- und Rollensystem (RBAC)
-- Subjects, Systemrollen, Gruppen, Overrides

CREATE TABLE IF NOT EXISTS permission_definitions (
  permission_key TEXT PRIMARY KEY,
  description    TEXT NOT NULL DEFAULT '',
  module_tag     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS system_roles (
  role_key    TEXT PRIMARY KEY,
  label       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS system_role_permissions (
  role_key        TEXT NOT NULL REFERENCES system_roles(role_key) ON DELETE CASCADE,
  permission_key  TEXT NOT NULL REFERENCES permission_definitions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS access_subjects (
  id                   BIGSERIAL PRIMARY KEY,
  subject_type         TEXT NOT NULL CHECK (subject_type IN (
                          'admin_user','photographer','customer','customer_contact','company_member'
                        )),
  admin_user_id        BIGINT REFERENCES admin_users(id) ON DELETE CASCADE,
  photographer_key     TEXT REFERENCES photographers(key) ON DELETE CASCADE,
  customer_id          INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  customer_contact_id  INTEGER REFERENCES customer_contacts(id) ON DELETE CASCADE,
  company_member_id    INTEGER REFERENCES company_members(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT access_subjects_one_fk CHECK (
    (CASE WHEN admin_user_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN photographer_key IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN customer_contact_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN company_member_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_subjects_admin_user
  ON access_subjects(admin_user_id) WHERE admin_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_subjects_photographer
  ON access_subjects(photographer_key) WHERE photographer_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_subjects_customer
  ON access_subjects(customer_id) WHERE customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_subjects_contact
  ON access_subjects(customer_contact_id) WHERE customer_contact_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_access_subjects_company_member
  ON access_subjects(company_member_id) WHERE company_member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS access_subject_system_roles (
  subject_id BIGINT NOT NULL REFERENCES access_subjects(id) ON DELETE CASCADE,
  role_key   TEXT NOT NULL REFERENCES system_roles(role_key) ON DELETE CASCADE,
  PRIMARY KEY (subject_id, role_key)
);

CREATE TABLE IF NOT EXISTS permission_groups (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  scope_type          TEXT NOT NULL CHECK (scope_type IN ('system','company','customer')),
  scope_company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  scope_customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT permission_groups_scope_ok CHECK (
    (scope_type = 'system' AND scope_company_id IS NULL AND scope_customer_id IS NULL)
    OR (scope_type = 'company' AND scope_company_id IS NOT NULL AND scope_customer_id IS NULL)
    OR (scope_type = 'customer' AND scope_customer_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_permission_groups_company ON permission_groups(scope_company_id);
CREATE INDEX IF NOT EXISTS idx_permission_groups_customer ON permission_groups(scope_customer_id);

CREATE TABLE IF NOT EXISTS permission_group_permissions (
  group_id        INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  permission_key  TEXT NOT NULL REFERENCES permission_definitions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (group_id, permission_key)
);

CREATE TABLE IF NOT EXISTS permission_group_members (
  group_id   INTEGER NOT NULL REFERENCES permission_groups(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES access_subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, subject_id)
);

CREATE TABLE IF NOT EXISTS subject_permission_overrides (
  id                  BIGSERIAL PRIMARY KEY,
  subject_id          BIGINT NOT NULL REFERENCES access_subjects(id) ON DELETE CASCADE,
  permission_key      TEXT NOT NULL REFERENCES permission_definitions(permission_key) ON DELETE CASCADE,
  effect              TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  scope_type          TEXT NOT NULL DEFAULT 'system' CHECK (scope_type IN ('system','company','customer')),
  scope_company_id    INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  scope_customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_perm_override_uq
  ON subject_permission_overrides(
    subject_id,
    permission_key,
    scope_type,
    COALESCE(scope_company_id, -1),
    COALESCE(scope_customer_id, -1)
  );

CREATE INDEX IF NOT EXISTS idx_subject_perm_override_subject ON subject_permission_overrides(subject_id);
