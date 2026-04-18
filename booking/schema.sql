-- Propus Buchungstool – PostgreSQL Schema
-- Wird automatisch beim ersten Start ausgeführt (via migrate.js)

-- Kunden (dedupliziert per E-Mail)
CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  company       TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  onsite_name   TEXT NOT NULL DEFAULT '',
  onsite_phone  TEXT NOT NULL DEFAULT '',
  street        TEXT NOT NULL DEFAULT '',
  zipcity       TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  exxas_contact_id TEXT,
  blocked       BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration: blocked + notes Spalten hinzufügen falls nicht vorhanden
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='blocked') THEN
    ALTER TABLE customers ADD COLUMN blocked BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='notes') THEN
    ALTER TABLE customers ADD COLUMN notes TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='onsite_name') THEN
    ALTER TABLE customers ADD COLUMN onsite_name TEXT NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='onsite_phone') THEN
    ALTER TABLE customers ADD COLUMN onsite_phone TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

-- Bestellungen
CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  order_no        INTEGER NOT NULL UNIQUE,
  customer_id     INTEGER REFERENCES customers(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paused','confirmed','completed','done','cancelled','archived')),
  address         TEXT NOT NULL DEFAULT '',
  object          JSONB NOT NULL DEFAULT '{}',
  services        JSONB NOT NULL DEFAULT '{}',
  photographer    JSONB NOT NULL DEFAULT '{}',
  schedule        JSONB NOT NULL DEFAULT '{}',
  billing         JSONB NOT NULL DEFAULT '{}',
  pricing         JSONB NOT NULL DEFAULT '{}',
  settings_snapshot JSONB NOT NULL DEFAULT '{}',
  discount        JSONB,
  key_pickup      JSONB,
  ics_uid         TEXT,
  photographer_event_id TEXT,
  office_event_id TEXT,
  exxas_order_id  TEXT,
  exxas_status    TEXT NOT NULL DEFAULT 'not_sent'
                    CHECK (exxas_status IN ('not_sent','sent','error')),
  exxas_error     TEXT,
  done_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS settings_snapshot JSONB NOT NULL DEFAULT '{}';

-- Migration: erlaubte Statuswerte für orders.status erweitern (idempotent)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_status_check'
  ) THEN
    ALTER TABLE orders DROP CONSTRAINT orders_status_check;
  END IF;
  ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
    CHECK (status IN ('pending','paused','confirmed','completed','done','cancelled','archived'));
END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

-- Migration: key_pickup von BOOLEAN -> JSONB (Objekt mit enabled/address/floor/info)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name='orders'
      AND column_name='key_pickup'
      AND data_type='boolean'
  ) THEN
    ALTER TABLE orders
      ALTER COLUMN key_pickup DROP DEFAULT;

    ALTER TABLE orders
      ALTER COLUMN key_pickup TYPE JSONB
      USING (
        CASE
          WHEN key_pickup IS TRUE THEN '{"enabled":true}'::jsonb
          ELSE NULL
        END
      );
  END IF;
END $$;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS onsite_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Fotografen (aus photographers.config.js)
CREATE TABLE IF NOT EXISTS photographers (
  id        SERIAL PRIMARY KEY,
  key       TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  initials  TEXT NOT NULL DEFAULT '',
  is_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index für häufige Abfragen
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer   ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_email   ON customers(email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email_nonempty
  ON customers(email)
  WHERE email <> '';

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS phone_mobile TEXT NOT NULL DEFAULT '';

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS whatsapp TEXT NOT NULL DEFAULT '';

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS bookable BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT '';

ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── Customer Auth (idempotent upgrades) ─────────────────────────────────────
-- Falls customers Tabelle schon existiert: Spalte ergänzen.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS auth_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS customers_auth_sub_uq
  ON customers (auth_sub)
  WHERE auth_sub IS NOT NULL;

-- Sessions (Bearer Tokens) für Kunden-Login
CREATE TABLE IF NOT EXISTS customer_sessions (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer_id ON customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_expires_at  ON customer_sessions(expires_at);

-- ─── E-Mail-Verifikation für Kunden ──────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS customer_email_verifications (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verif_customer ON customer_email_verifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_verif_expires  ON customer_email_verifications(expires_at);

-- ─── Passwort-Reset für Kunden ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_password_resets (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pw_reset_customer ON customer_password_resets(customer_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_expires  ON customer_password_resets(expires_at);

-- Bug Reports
CREATE TABLE IF NOT EXISTS bug_reports (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  text        TEXT NOT NULL,
  page        TEXT,
  file_name   TEXT,
  file_data   BYTEA,
  file_mime   TEXT,
  status      TEXT NOT NULL DEFAULT 'new',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC);

-- Nachrichtenverlauf pro Auftrag
CREATE TABLE IF NOT EXISTS order_messages (
  id              SERIAL PRIMARY KEY,
  order_no        INTEGER NOT NULL REFERENCES orders(order_no) ON DELETE CASCADE,
  sender_role     TEXT NOT NULL,
  sender_name     TEXT NOT NULL DEFAULT '',
  recipient_roles JSONB NOT NULL DEFAULT '[]',
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_messages_order_no ON order_messages(order_no, created_at);

-- Auftrags-Chat Kunde <-> Fotograf (auftragsgebunden, bleibt bei Fotografenwechsel)
CREATE TABLE IF NOT EXISTS order_chat_messages (
  id          SERIAL PRIMARY KEY,
  order_no    INTEGER NOT NULL REFERENCES orders(order_no) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  sender_id   TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL,
  read_at     TIMESTAMPTZ DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_chat_order_no ON order_chat_messages(order_no, created_at);

-- ─── Fotografen-Einstellungen (Skills, Startpunkt, Abwesenheiten) ─────────────
CREATE TABLE IF NOT EXISTS photographer_settings (
  photographer_key  TEXT PRIMARY KEY REFERENCES photographers(key) ON DELETE CASCADE,
  home_address      TEXT NOT NULL DEFAULT '',
  home_lat          FLOAT,
  home_lon          FLOAT,
  max_radius_km     INTEGER DEFAULT NULL,
  skills            JSONB NOT NULL DEFAULT '{}',
  blocked_dates     JSONB NOT NULL DEFAULT '[]',
  depart_times      JSONB NOT NULL DEFAULT '{}',
  work_start        TEXT,
  work_end          TEXT,
  workdays          JSONB,
  work_hours_by_day JSONB,
  buffer_minutes    INTEGER,
  slot_minutes      INTEGER,
  national_holidays BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotente Migrationen (bestehende Installationen)
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS depart_times JSONB NOT NULL DEFAULT '{}';
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS work_start TEXT;
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS work_end TEXT;
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS workdays JSONB;
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS work_hours_by_day JSONB;
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER;
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS slot_minutes INTEGER;

-- ─── Admin-Rolle für Kunden ───────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Fotografen-Login (Passwort für Mitarbeiter-Zugang) ──────────────────────
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ─── Fotografen: Sprachen & Muttersprache ─────────────────────────────────────
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS languages JSONB NOT NULL DEFAULT '[]';
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS native_language TEXT NOT NULL DEFAULT 'de';
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS event_color TEXT NOT NULL DEFAULT '#3b82f6';

-- ─── Admin/Mitarbeiter Sessions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash    TEXT PRIMARY KEY,
  role          TEXT NOT NULL,
  user_key      TEXT, -- photographer_key oder admin username
  user_name     TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

-- ─── Fotografen-Passwort-Reset ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS photographer_password_resets (
  token_hash        TEXT PRIMARY KEY,
  photographer_key  TEXT NOT NULL REFERENCES photographer_settings(photographer_key) ON DELETE CASCADE,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photog_pw_reset_key     ON photographer_password_resets(photographer_key);
CREATE INDEX IF NOT EXISTS idx_photog_pw_reset_expires ON photographer_password_resets(expires_at);

-- ─── Produktkatalog & Preisregeln ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_categories (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind_scope  TEXT NOT NULL DEFAULT 'addon' CHECK (kind_scope IN ('package', 'addon', 'both')),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  show_in_frontpanel BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id            BIGSERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('package','addon')),
  group_key     TEXT NOT NULL DEFAULT '',
  category_key  TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  affects_travel BOOLEAN NOT NULL DEFAULT TRUE,
  affects_duration BOOLEAN NOT NULL DEFAULT FALSE,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  skill_key     TEXT NOT NULL DEFAULT '',
  required_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  show_on_website BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS affects_travel BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS affects_duration BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS skill_key TEXT NOT NULL DEFAULT '';
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS required_skills JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_key TEXT NOT NULL DEFAULT '';
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS show_on_website BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS pricing_rules (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('fixed','per_floor','per_room','area_tier','conditional')),
  config_json   JSONB NOT NULL DEFAULT '{}',
  priority      INTEGER NOT NULL DEFAULT 100,
  valid_from    DATE,
  valid_to      DATE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS valid_from DATE;
ALTER TABLE pricing_rules
  ADD COLUMN IF NOT EXISTS valid_to DATE;

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value_json  JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discount_codes (
  id               BIGSERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  amount           NUMERIC(10,2) NOT NULL,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from       DATE,
  valid_to         DATE,
  max_uses         INTEGER,
  uses_count       INTEGER NOT NULL DEFAULT 0,
  uses_per_customer INTEGER,
  conditions_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS discount_code_usages (
  id               BIGSERIAL PRIMARY KEY,
  discount_code_id BIGINT NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  customer_email   TEXT NOT NULL,
  order_id         INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  used_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE discount_code_usages
  ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_discount_code_usages_code_email
  ON discount_code_usages(discount_code_id, customer_email);

CREATE INDEX IF NOT EXISTS idx_products_kind_active_sort ON products(kind, active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_products_group_key ON products(group_key);
CREATE INDEX IF NOT EXISTS idx_products_category_key ON products(category_key);
CREATE INDEX IF NOT EXISTS idx_service_categories_kind_active_sort ON service_categories(kind_scope, active, sort_order, key);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_product_priority ON pricing_rules(product_id, active, priority, id);

-- ─── Kunden-Kontaktpersonen (mehrere Mitarbeiter pro Kunde) ─────────────────
CREATE TABLE IF NOT EXISTS customer_contacts (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);

-- ─── Company Workspace (B2B Mandantenmodell) ────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  billing_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  standort            TEXT NOT NULL DEFAULT '',
  notiz               TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv','ausstehend','inaktiv')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

CREATE TABLE IF NOT EXISTS company_members (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auth_subject TEXT NOT NULL DEFAULT '',
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  email           TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL CHECK (role IN ('company_owner','company_admin','company_employee')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','disabled')),
  is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_members_company_auth_subject
  ON company_members(company_id, auth_subject)
  WHERE auth_subject <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_members_company_customer
  ON company_members(company_id, customer_id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_members_company_email
  ON company_members(company_id, LOWER(email));
CREATE INDEX IF NOT EXISTS idx_company_members_auth_subject ON company_members(auth_subject);

CREATE TABLE IF NOT EXISTS company_invitations (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('company_owner','company_admin','company_employee')),
  token         TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ,
  invited_by    TEXT NOT NULL DEFAULT '',
  given_name    TEXT NOT NULL DEFAULT '',
  family_name   TEXT NOT NULL DEFAULT '',
  login_name    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON company_invitations(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON company_invitations(LOWER(email));

ALTER TABLE company_members ADD COLUMN IF NOT EXISTS is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_member_id INTEGER REFERENCES company_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_by_member_id ON orders(created_by_member_id) WHERE created_by_member_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_id TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  ip_address TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at ON auth_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_action ON auth_audit_log(action);

-- ─── NAS-Ordner und Upload-Batches ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_folder_links (
  id            SERIAL PRIMARY KEY,
  order_no      INTEGER NOT NULL REFERENCES orders(order_no) ON DELETE CASCADE,
  folder_type   TEXT NOT NULL CHECK (folder_type IN ('raw_material','customer_folder')),
  root_kind     TEXT NOT NULL CHECK (root_kind IN ('raw','customer')),
  relative_path TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  company_name  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'ready'
                 CHECK (status IN ('pending','ready','linked','archived','failed')),
  last_error    TEXT,
  nextcloud_share_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_folder_links_active
  ON order_folder_links(order_no, folder_type)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_order_folder_links_order_no
  ON order_folder_links(order_no, created_at DESC);

CREATE TABLE IF NOT EXISTS upload_batches (
  id                   TEXT PRIMARY KEY,
  order_no             INTEGER NOT NULL REFERENCES orders(order_no) ON DELETE CASCADE,
  folder_type          TEXT NOT NULL DEFAULT 'customer_folder'
                       CHECK (folder_type IN ('raw_material','customer_folder')),
  category             TEXT NOT NULL,
  upload_mode          TEXT NOT NULL CHECK (upload_mode IN ('existing','new_batch')),
  status               TEXT NOT NULL DEFAULT 'staged'
                       CHECK (status IN ('staged','transferring','completed','failed','retrying','cancelled')),
  local_path           TEXT NOT NULL,
  target_relative_path TEXT,
  target_absolute_path TEXT,
  batch_folder         TEXT,
  comment              TEXT NOT NULL DEFAULT '',
  file_count           INTEGER NOT NULL DEFAULT 0,
  total_bytes          BIGINT NOT NULL DEFAULT 0,
  uploaded_by          TEXT NOT NULL DEFAULT '',
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  conflict_mode        TEXT NOT NULL DEFAULT 'skip',
  custom_folder_name   TEXT,
  upload_group_id      TEXT,
  upload_group_total_parts INTEGER NOT NULL DEFAULT 1,
  upload_group_part_index INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_upload_batches_order_no
  ON upload_batches(order_no, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_batches_status
  ON upload_batches(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_batches_group_id
  ON upload_batches(upload_group_id, upload_group_part_index, created_at DESC);

CREATE TABLE IF NOT EXISTS upload_batch_files (
  id            SERIAL PRIMARY KEY,
  batch_id      TEXT NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  staging_path  TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  sha256        TEXT,
  status        TEXT NOT NULL DEFAULT 'staged'
                CHECK (status IN ('staged','stored','skipped_duplicate','skipped_invalid_type','failed')),
  duplicate_of  TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_batch_files_batch_id
  ON upload_batch_files(batch_id, id);

-- ─── Lokale Admin-Benutzer ───────────────────────────────────────────────────
-- booking.admin_users ist seit Migration 040 ein VIEW über core.admin_users mit
-- INSTEAD-OF-Triggern (INSERT/UPDATE/DELETE). Die physische Tabelle heisst
-- core.admin_users und wird in core/migrations/018 angelegt.
-- Dieser schema.sql-Block ist nur für Erst-Schema-Anlage auf leeren DBs relevant;
-- Produktions-Deploys laufen ausschliesslich über den Migration-Runner.

-- ─── Zentrales RBAC (Subjects, Rollen, Gruppen) ─────────────────────────────
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
  -- FK-Target ist seit Migration 040: core.admin_users(id) (booking.admin_users ist ein VIEW).
  admin_user_id        BIGINT,
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
