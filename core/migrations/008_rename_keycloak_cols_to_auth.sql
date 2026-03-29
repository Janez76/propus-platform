-- ═══════════════════════════════════════════════════════════════════════════
-- 008_rename_keycloak_cols_to_auth.sql
-- Benennt Legacy-Spalten keycloak_* in generische auth_* um (OIDC/Logto-Subject).
-- Idempotent: laeuft auch, wenn Spalten bereits umbenannt wurden.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO core, public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'customers' AND column_name = 'keycloak_sub'
  ) THEN
    ALTER TABLE core.customers RENAME COLUMN keycloak_sub TO auth_sub;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'core' AND table_name = 'company_members' AND column_name = 'keycloak_subject'
  ) THEN
    ALTER TABLE core.company_members RENAME COLUMN keycloak_subject TO auth_subject;
  END IF;
END $$;

-- Optional: eindeutiger Index auf Kunden-auth_sub (Name aus Migration 022)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS ns, i.relname AS idx
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = i.relnamespace
    WHERE t.relname = 'customers'
      AND n.nspname = 'core'
      AND i.relname = 'customers_keycloak_sub_uq'
  LOOP
    EXECUTE format('ALTER INDEX %I.%I RENAME TO customers_auth_sub_uq', r.ns, r.idx);
  END LOOP;
END $$;

-- Index-Namen auf company_members an neue Semantik anpassen (falls vorhanden)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'core' AND c.relname = 'idx_core_company_members_company_subject'
  ) THEN
    ALTER INDEX core.idx_core_company_members_company_subject
      RENAME TO idx_core_company_members_company_auth_subject;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'core' AND c.relname = 'idx_core_company_members_subject'
  ) THEN
    ALTER INDEX core.idx_core_company_members_subject
      RENAME TO idx_core_company_members_auth_subject;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
