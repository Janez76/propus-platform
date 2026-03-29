-- ═══════════════════════════════════════════════════════════════════════════
-- 002_booking_schema.sql – Buchungstool-spezifische Tabellen
-- Alle Tabellen liegen im Schema "booking".
-- FK-Referenzen auf core.customers / core.companies verwenden
-- den vollen Schema-Pfad.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO booking, core, public;

-- ─── Bestellungen ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.orders (
  id              SERIAL PRIMARY KEY,
  order_no        INTEGER NOT NULL UNIQUE,
  customer_id     INTEGER REFERENCES core.customers(id),
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
  created_by_member_id INTEGER REFERENCES core.company_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_orders_status ON booking.orders(status);
CREATE INDEX IF NOT EXISTS idx_booking_orders_created_at ON booking.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_orders_customer ON booking.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_booking_orders_created_by ON booking.orders(created_by_member_id) WHERE created_by_member_id IS NOT NULL;

-- ─── Fotografen ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.photographers (
  id        SERIAL PRIMARY KEY,
  key       TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL DEFAULT '',
  email     TEXT NOT NULL DEFAULT '',
  phone     TEXT NOT NULL DEFAULT '',
  phone_mobile TEXT NOT NULL DEFAULT '',
  whatsapp  TEXT NOT NULL DEFAULT '',
  initials  TEXT NOT NULL DEFAULT '',
  is_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  active    BOOLEAN NOT NULL DEFAULT TRUE,
  bookable  BOOLEAN NOT NULL DEFAULT TRUE,
  photo_url TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Fotografen-Einstellungen ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.photographer_settings (
  photographer_key  TEXT PRIMARY KEY REFERENCES booking.photographers(key) ON DELETE CASCADE,
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
  languages         JSONB NOT NULL DEFAULT '[]',
  native_language   TEXT NOT NULL DEFAULT 'de',
  event_color       TEXT NOT NULL DEFAULT '#3b82f6',
  password_hash     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Service-Kategorien ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.service_categories (
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

-- ─── Produkte ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.products (
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
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_products_kind ON booking.products(kind, active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_booking_products_group ON booking.products(group_key);
CREATE INDEX IF NOT EXISTS idx_booking_products_category ON booking.products(category_key);

-- ─── Preisregeln ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.pricing_rules (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES booking.products(id) ON DELETE CASCADE,
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('fixed','per_floor','per_room','area_tier','conditional')),
  config_json   JSONB NOT NULL DEFAULT '{}',
  priority      INTEGER NOT NULL DEFAULT 100,
  valid_from    DATE,
  valid_to      DATE,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_pricing_rules
  ON booking.pricing_rules(product_id, active, priority, id);

-- ─── App Settings ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.app_settings (
  key         TEXT PRIMARY KEY,
  value_json  JSONB NOT NULL DEFAULT 'null'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Rabatt-Codes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.discount_codes (
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

CREATE TABLE IF NOT EXISTS booking.discount_code_usages (
  id               BIGSERIAL PRIMARY KEY,
  discount_code_id BIGINT NOT NULL REFERENCES booking.discount_codes(id) ON DELETE CASCADE,
  customer_email   TEXT NOT NULL,
  order_id         INTEGER REFERENCES booking.orders(id) ON DELETE SET NULL,
  used_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_discount_code_usages
  ON booking.discount_code_usages(discount_code_id, customer_email);

-- ─── Bug Reports ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.bug_reports (
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

-- ─── Auftrags-Nachrichten ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.order_messages (
  id              SERIAL PRIMARY KEY,
  order_no        INTEGER NOT NULL REFERENCES booking.orders(order_no) ON DELETE CASCADE,
  sender_role     TEXT NOT NULL,
  sender_name     TEXT NOT NULL DEFAULT '',
  recipient_roles JSONB NOT NULL DEFAULT '[]',
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_order_messages
  ON booking.order_messages(order_no, created_at);

-- ─── Auftrags-Chat ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.order_chat_messages (
  id          SERIAL PRIMARY KEY,
  order_no    INTEGER NOT NULL REFERENCES booking.orders(order_no) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  sender_id   TEXT NOT NULL DEFAULT '',
  sender_name TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL,
  read_at     TIMESTAMPTZ DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_order_chat
  ON booking.order_chat_messages(order_no, created_at);

-- ─── Fotografen-Passwort-Reset ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.photographer_password_resets (
  token_hash        TEXT PRIMARY KEY,
  photographer_key  TEXT NOT NULL REFERENCES booking.photographer_settings(photographer_key) ON DELETE CASCADE,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Admin Sessions (Booking) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.admin_sessions (
  token_hash    TEXT PRIMARY KEY,
  role          TEXT NOT NULL,
  user_key      TEXT,
  user_name     TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Admin Users (Booking) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.admin_users (
  id            BIGSERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT,
  name          TEXT,
  role          TEXT NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Auth Audit Log ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.auth_audit_log (
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

-- ─── NAS-Ordner und Upload-Batches ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.order_folder_links (
  id            SERIAL PRIMARY KEY,
  order_no      INTEGER NOT NULL REFERENCES booking.orders(order_no) ON DELETE CASCADE,
  folder_type   TEXT NOT NULL CHECK (folder_type IN ('raw_material','customer_folder')),
  root_kind     TEXT NOT NULL CHECK (root_kind IN ('raw','customer')),
  relative_path TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  company_name  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'ready'
                 CHECK (status IN ('pending','ready','linked','archived','failed')),
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS booking.upload_batches (
  id                   TEXT PRIMARY KEY,
  order_no             INTEGER NOT NULL REFERENCES booking.orders(order_no) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS booking.upload_batch_files (
  id            SERIAL PRIMARY KEY,
  batch_id      TEXT NOT NULL REFERENCES booking.upload_batches(id) ON DELETE CASCADE,
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

-- ─── RBAC (Booking-spezifisch) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS booking.permission_definitions (
  permission_key TEXT PRIMARY KEY,
  description    TEXT NOT NULL DEFAULT '',
  module_tag     TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS booking.system_roles (
  role_key    TEXT PRIMARY KEY,
  label       TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS booking.system_role_permissions (
  role_key        TEXT NOT NULL REFERENCES booking.system_roles(role_key) ON DELETE CASCADE,
  permission_key  TEXT NOT NULL REFERENCES booking.permission_definitions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, permission_key)
);

CREATE TABLE IF NOT EXISTS booking.access_subjects (
  id                   BIGSERIAL PRIMARY KEY,
  subject_type         TEXT NOT NULL CHECK (subject_type IN (
                          'admin_user','photographer','customer','customer_contact','company_member'
                        )),
  admin_user_id        BIGINT REFERENCES booking.admin_users(id) ON DELETE CASCADE,
  photographer_key     TEXT REFERENCES booking.photographers(key) ON DELETE CASCADE,
  customer_id          INTEGER REFERENCES core.customers(id) ON DELETE CASCADE,
  customer_contact_id  INTEGER REFERENCES core.customer_contacts(id) ON DELETE CASCADE,
  company_member_id    INTEGER REFERENCES core.company_members(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS booking.access_subject_system_roles (
  subject_id BIGINT NOT NULL REFERENCES booking.access_subjects(id) ON DELETE CASCADE,
  role_key   TEXT NOT NULL REFERENCES booking.system_roles(role_key) ON DELETE CASCADE,
  PRIMARY KEY (subject_id, role_key)
);

CREATE TABLE IF NOT EXISTS booking.permission_groups (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  scope_type          TEXT NOT NULL CHECK (scope_type IN ('system','company','customer')),
  scope_company_id    INTEGER REFERENCES core.companies(id) ON DELETE CASCADE,
  scope_customer_id   INTEGER REFERENCES core.customers(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking.permission_group_permissions (
  group_id        INTEGER NOT NULL REFERENCES booking.permission_groups(id) ON DELETE CASCADE,
  permission_key  TEXT NOT NULL REFERENCES booking.permission_definitions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (group_id, permission_key)
);

CREATE TABLE IF NOT EXISTS booking.permission_group_members (
  group_id   INTEGER NOT NULL REFERENCES booking.permission_groups(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES booking.access_subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, subject_id)
);

CREATE TABLE IF NOT EXISTS booking.subject_permission_overrides (
  id                  BIGSERIAL PRIMARY KEY,
  subject_id          BIGINT NOT NULL REFERENCES booking.access_subjects(id) ON DELETE CASCADE,
  permission_key      TEXT NOT NULL REFERENCES booking.permission_definitions(permission_key) ON DELETE CASCADE,
  effect              TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  scope_type          TEXT NOT NULL DEFAULT 'system' CHECK (scope_type IN ('system','company','customer')),
  scope_company_id    INTEGER REFERENCES core.companies(id) ON DELETE CASCADE,
  scope_customer_id   INTEGER REFERENCES core.customers(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
