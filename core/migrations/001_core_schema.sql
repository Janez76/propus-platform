-- ═══════════════════════════════════════════════════════════════════════════
-- 001_core_schema.sql – Shared Kernel (core Schema)
-- Enthält alle modul-übergreifenden Entitäten:
-- customers, customer_contacts, companies, company_members, company_invitations
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO core, public;

-- ─── Kunden (dedupliziert per E-Mail, Single Source of Truth) ────────────────
CREATE TABLE IF NOT EXISTS core.customers (
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
  auth_sub  TEXT,
  blocked       BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT NOT NULL DEFAULT '',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_admin      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_customers_email
  ON core.customers (email)
  WHERE email <> '';
CREATE INDEX IF NOT EXISTS idx_core_customers_exxas
  ON core.customers (exxas_contact_id) WHERE exxas_contact_id IS NOT NULL;

-- ─── Kunden-Kontaktpersonen ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.customer_contacts (
  id          SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT '',
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_customer_contacts_customer
  ON core.customer_contacts(customer_id);

-- ─── Companies (B2B Mandantenmodell) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.companies (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  billing_customer_id INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  standort            TEXT NOT NULL DEFAULT '',
  notiz               TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'aktiv'
                        CHECK (status IN ('aktiv','ausstehend','inaktiv')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_companies_name ON core.companies(name);

-- ─── Company Members ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.company_members (
  id              SERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  auth_subject TEXT NOT NULL DEFAULT '',
  customer_id     INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  email           TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL CHECK (role IN ('company_owner','company_admin','company_employee')),
  status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('invited','active','disabled')),
  is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_company_members_company_auth_subject
  ON core.company_members(company_id, auth_subject)
  WHERE auth_subject <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_core_company_members_company_customer
  ON core.company_members(company_id, customer_id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_core_company_members_company_email
  ON core.company_members(company_id, LOWER(email));
CREATE INDEX IF NOT EXISTS idx_core_company_members_auth_subject
  ON core.company_members(auth_subject);

-- ─── Company Invitations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.company_invitations (
  id            SERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_core_company_invitations_company
  ON core.company_invitations(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_core_company_invitations_email
  ON core.company_invitations(LOWER(email));

-- ─── Customer Sessions (für Kunden-Auth via Datenbank) ─────────────────────
CREATE TABLE IF NOT EXISTS core.customer_sessions (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_customer_sessions_customer_id
  ON core.customer_sessions(customer_id);
CREATE INDEX IF NOT EXISTS idx_core_customer_sessions_expires_at
  ON core.customer_sessions(expires_at);

-- ─── Customer E-Mail-Verifikation ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.customer_email_verifications (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Customer Passwort-Reset ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.customer_password_resets (
  id            SERIAL PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES core.customers(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Migration-Tracking ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.applied_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
