ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS standort TEXT,
  ADD COLUMN IF NOT EXISTS notiz TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aktiv';

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS companies_status_check;

ALTER TABLE companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('aktiv', 'ausstehend', 'inaktiv'));

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
