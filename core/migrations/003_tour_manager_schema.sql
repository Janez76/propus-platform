-- ═══════════════════════════════════════════════════════════════════════════
-- 003_tour_manager_schema.sql – Tour-Manager-spezifische Tabellen
-- Alle Tabellen im Schema "tour_manager".
-- FK-Referenzen auf core.customers verwenden vollen Schema-Pfad.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO tour_manager, core, public;

-- ─── Touren (Haupttabelle) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.tours (
  id                      SERIAL PRIMARY KEY,
  exxas_abo_id            TEXT,
  matterport_space_id     TEXT,
  tour_url                TEXT,
  kunde_ref               TEXT,
  customer_id             INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  customer_name           TEXT,
  customer_email          TEXT,
  customer_contact        TEXT,
  bezeichnung             TEXT,
  object_label            TEXT,
  matterport_created_at   TIMESTAMPTZ,
  term_end_date           DATE,
  ablaufdatum             DATE,
  matterport_state        VARCHAR(50),
  matterport_is_own       BOOLEAN,
  customer_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  customer_intent         VARCHAR(30),
  customer_intent_source  VARCHAR(30),
  customer_intent_note    TEXT,
  customer_intent_confidence NUMERIC(5,2),
  customer_intent_updated_at TIMESTAMPTZ,
  customer_transfer_requested BOOLEAN NOT NULL DEFAULT FALSE,
  customer_billing_attention  BOOLEAN NOT NULL DEFAULT FALSE,
  status                  TEXT NOT NULL DEFAULT 'ACTIVE',
  canonical_customer_name TEXT,
  canonical_object_label  TEXT,
  canonical_matterport_space_id TEXT,
  canonical_exxas_contract_id TEXT,
  canonical_term_end_date DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tours_status ON tour_manager.tours(status);
CREATE INDEX IF NOT EXISTS idx_tours_customer_email ON tour_manager.tours(customer_email) WHERE customer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tours_customer_intent ON tour_manager.tours(customer_intent) WHERE customer_intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tours_customer_id ON tour_manager.tours(customer_id) WHERE customer_id IS NOT NULL;

-- ─── Exxas-Rechnungen (Sync) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.exxas_invoices (
  id                  SERIAL PRIMARY KEY,
  exxas_document_id   TEXT UNIQUE,
  nummer              TEXT,
  kunde_name          TEXT,
  bezeichnung         TEXT,
  ref_kunde           TEXT,
  ref_vertrag         TEXT,
  exxas_status        TEXT,
  sv_status           TEXT,
  zahlungstermin      DATE,
  dok_datum           DATE,
  preis_brutto        NUMERIC(10,2),
  tour_id             INTEGER REFERENCES tour_manager.tours(id) ON DELETE SET NULL,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exxas_invoices_tour_id ON tour_manager.exxas_invoices(tour_id) WHERE tour_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exxas_invoices_ref_vertrag ON tour_manager.exxas_invoices(ref_vertrag) WHERE ref_vertrag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exxas_invoices_exxas_status ON tour_manager.exxas_invoices(exxas_status);

-- ─── Interne Verlängerungsrechnungen ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.renewal_invoices (
  id                    SERIAL PRIMARY KEY,
  tour_id               INTEGER NOT NULL REFERENCES tour_manager.tours(id) ON DELETE CASCADE,
  invoice_number        VARCHAR(64),
  invoice_status        TEXT NOT NULL DEFAULT 'draft',
  invoice_kind          VARCHAR(40),
  amount_chf            NUMERIC(10,2),
  due_at                TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  payment_method        VARCHAR(30),
  payment_source        VARCHAR(30),
  payment_note          TEXT,
  recorded_by           TEXT,
  recorded_at           TIMESTAMPTZ,
  subscription_start_at DATE,
  subscription_end_at   DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_invoices_tour ON tour_manager.renewal_invoices(tour_id, created_at DESC);

-- ─── Audit / Actions-Log ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.actions_log (
  id            BIGSERIAL PRIMARY KEY,
  tour_id       INTEGER REFERENCES tour_manager.tours(id) ON DELETE CASCADE,
  actor_type    TEXT,
  actor_ref     TEXT,
  action        TEXT NOT NULL,
  details_json  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_actions_log_tour ON tour_manager.actions_log(tour_id, created_at DESC);

-- ─── Admin-Users (Tour-Panel) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.admin_users (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  full_name     TEXT NULL,
  password_hash TEXT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  invited_by    TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm_admin_users_email
  ON tour_manager.admin_users ((LOWER(email)));

-- ─── Admin-Invites (Tour-Panel) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.admin_invites (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  invited_by    TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  accepted_at   TIMESTAMPTZ NULL,
  revoked_at    TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_tm_admin_invites_email
  ON tour_manager.admin_invites ((LOWER(email)));

-- ─── Admin Remember Tokens ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.admin_remember_tokens (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_tm_admin_remember_hash
  ON tour_manager.admin_remember_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tm_admin_remember_email
  ON tour_manager.admin_remember_tokens(email);

-- ─── Portal Users (Kunden-Login Tour-Panel) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.portal_users (
  email         TEXT PRIMARY KEY,
  full_name     TEXT NULL,
  password_hash TEXT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tm_portal_users_email
  ON tour_manager.portal_users ((LOWER(email)));

-- ─── Portal Password-Reset-Tokens ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.portal_password_reset_tokens (
  id            BIGSERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_portal_pw_reset
  ON tour_manager.portal_password_reset_tokens ((LOWER(email)), used_at, expires_at);

-- ─── Portal Team Members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.portal_team_members (
  id BIGSERIAL PRIMARY KEY,
  owner_email TEXT NOT NULL,
  member_email TEXT NOT NULL,
  display_name TEXT NULL,
  role TEXT NOT NULL DEFAULT 'mitarbeiter',
  status TEXT NOT NULL DEFAULT 'pending',
  invite_token_hash TEXT NULL,
  expires_at TIMESTAMPTZ NULL,
  invited_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_owner_member
  ON tour_manager.portal_team_members ((LOWER(owner_email)), (LOWER(member_email)));

-- ─── Portal Team Exclusions ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.portal_team_exclusions (
  id BIGSERIAL PRIMARY KEY,
  owner_email TEXT NOT NULL,
  member_email TEXT NOT NULL,
  reason TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_exclusions_owner_member
  ON tour_manager.portal_team_exclusions ((LOWER(owner_email)), (LOWER(member_email)));

-- ─── Portal Tour Assignees ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.portal_tour_assignees (
  tour_id INTEGER PRIMARY KEY,
  assignee_email TEXT NOT NULL,
  workspace_owner_email TEXT NOT NULL,
  updated_by TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT portal_tour_assignees_tour_fk
    FOREIGN KEY (tour_id) REFERENCES tour_manager.tours(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_portal_tour_assignees_workspace
  ON tour_manager.portal_tour_assignees ((LOWER(workspace_owner_email)));

-- ─── Settings ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.settings (
  key VARCHAR(64) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── User Profile Settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.user_profile_settings (
  realm TEXT NOT NULL,
  user_key TEXT NOT NULL,
  display_name TEXT NULL,
  organization_display TEXT NULL,
  profile_photo_mime TEXT NULL,
  profile_photo_data BYTEA NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (realm, user_key),
  CONSTRAINT user_profile_settings_realm_chk
    CHECK (realm IN ('admin', 'portal'))
);

-- ─── E-Mail Sync (incoming / outgoing) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.incoming_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_upn TEXT NOT NULL,
  graph_message_id TEXT NOT NULL UNIQUE,
  internet_message_id TEXT,
  conversation_id TEXT,
  subject TEXT,
  from_email TEXT,
  from_name TEXT,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  body_preview TEXT,
  body_text TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  matched_tour_id INTEGER REFERENCES tour_manager.tours(id),
  processing_status VARCHAR(20) NOT NULL DEFAULT 'new'
    CHECK (processing_status IN ('new','matched','suggested','reviewed','ignored','error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tour_manager.outgoing_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id INTEGER NOT NULL REFERENCES tour_manager.tours(id) ON DELETE CASCADE,
  mailbox_upn TEXT NOT NULL,
  graph_message_id TEXT UNIQUE,
  internet_message_id TEXT,
  conversation_id TEXT,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  template_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  details_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outgoing_emails_tour_id ON tour_manager.outgoing_emails(tour_id);

-- ─── AI Suggestions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_type VARCHAR(30) NOT NULL CHECK (suggestion_type IN ('invoice_match','email_intent')),
  source_key TEXT NOT NULL UNIQUE,
  source_invoice_id INTEGER REFERENCES tour_manager.exxas_invoices(id),
  source_email_id UUID REFERENCES tour_manager.incoming_emails(id) ON DELETE CASCADE,
  tour_id INTEGER REFERENCES tour_manager.tours(id),
  suggested_action VARCHAR(40) NOT NULL,
  confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  reason TEXT,
  model_name TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','approved','rejected','applied')),
  details_json JSONB,
  reviewed_by TEXT,
  reviewed_note TEXT,
  gold_tour_id INTEGER REFERENCES tour_manager.tours(id),
  gold_intent VARCHAR(40),
  gold_action VARCHAR(40),
  review_reason TEXT,
  review_source VARCHAR(40),
  prompt_version TEXT,
  pipeline_version TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Bank Import ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.bank_import_runs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,
  source_format VARCHAR(16) NOT NULL,
  file_name TEXT,
  total_rows INT NOT NULL DEFAULT 0,
  exact_rows INT NOT NULL DEFAULT 0,
  review_rows INT NOT NULL DEFAULT 0,
  none_rows INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tour_manager.bank_import_transactions (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES tour_manager.bank_import_runs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  booking_date DATE,
  value_date DATE,
  amount_chf NUMERIC(10,2),
  currency VARCHAR(3),
  reference_raw TEXT,
  reference_digits TEXT,
  debtor_name TEXT,
  purpose TEXT,
  match_status VARCHAR(16) NOT NULL DEFAULT 'none',
  confidence INT NOT NULL DEFAULT 0,
  match_reason TEXT,
  matched_invoice_id UUID,
  matched_renewal_id INT,
  matched_tour_id INT
);
