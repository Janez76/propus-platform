-- Company workspace and tenant-aware membership model

CREATE TABLE IF NOT EXISTS companies (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  billing_customer_id INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

CREATE TABLE IF NOT EXISTS company_members (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  auth_subject TEXT NOT NULL DEFAULT '',
  customer_id      INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  email            TEXT NOT NULL DEFAULT '',
  role             TEXT NOT NULL CHECK (role IN ('company_admin','company_employee')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','disabled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('company_admin','company_employee')),
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  invited_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_invitations_company ON company_invitations(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_company_invitations_email ON company_invitations(LOWER(email));

