ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS standort TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS notiz TEXT NOT NULL DEFAULT '';

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aktiv';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'companies_status_check'
  ) THEN
    ALTER TABLE companies DROP CONSTRAINT companies_status_check;
  END IF;
END $$;

ALTER TABLE companies
  ADD CONSTRAINT companies_status_check
  CHECK (status IN ('aktiv', 'ausstehend', 'inaktiv'));
