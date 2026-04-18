-- Migration 041: booking.companies / company_members / company_invitations konsolidieren
--
-- Portal-Firmen-Feature wurde im April 2026 aus dem Runtime-Code entfernt
-- (booking/server.js enthält den Kommentar "Company Workspace — ENTFERNT"),
-- aber die booking-Tabellen blieben bestehen. Diese Migration räumt auf:
--
--   1. Daten-Merge booking.* → core.* (ON CONFLICT-safe, preserviert Referenzen)
--   2. ID-Remap für FK-Targets in booking.orders und booking.access_subjects,
--      falls diese noch auf booking.company_members zeigen
--   3. DROP der booking-Tabellen
--
-- Im Gegensatz zu Migration 040 (admin_users) werden KEINE Kompat-Views
-- angelegt — es gibt keinen Runtime-Code, der auf die Legacy-Namen lesen/schreiben
-- würde. migrate-from-vps.js importiert von einer externen Quell-DB nach core.*
-- und ist von dieser Migration nicht betroffen.

BEGIN;

-- ─── 1. Existieren die Legacy-Tabellen überhaupt? ──────────────────────────
-- Auf fresh-Installationen laufen core/migrations/001 + 002 zuerst und legen
-- core.* an; booking/migrations/021 + 048 + 051 + 066 erzeugen booking.* auf
-- existierenden Installationen. Der folgende DO-Block macht die Migration
-- auf beiden Zuständen idempotent.

DO $$
DECLARE
  has_b_companies      BOOLEAN;
  has_b_members        BOOLEAN;
  has_b_invites        BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='booking' AND table_name='companies'           AND table_type='BASE TABLE') INTO has_b_companies;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='booking' AND table_name='company_members'     AND table_type='BASE TABLE') INTO has_b_members;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='booking' AND table_name='company_invitations' AND table_type='BASE TABLE') INTO has_b_invites;

  IF NOT (has_b_companies OR has_b_members OR has_b_invites) THEN
    RAISE NOTICE 'Migration 041: keine Legacy-booking-Firmen-Tabellen vorhanden, nichts zu tun.';
    RETURN;
  END IF;

  -- ─── 2. ID-Remap-Tabellen ──────────────────────────────────────────────
  CREATE TEMP TABLE _companies_remap      (old_id INT, new_id INT) ON COMMIT DROP;
  CREATE TEMP TABLE _members_remap        (old_id INT, new_id INT) ON COMMIT DROP;

  -- ─── 3. Companies mergen ──────────────────────────────────────────────
  IF has_b_companies THEN
    -- Upsert via natural key (slug). Populate remap mit old_id ↔ resultierendem core.id.
    WITH src AS (
      SELECT id AS old_id, name, slug, billing_customer_id,
             COALESCE(standort,'') AS standort,
             COALESCE(notiz,'')    AS notiz,
             COALESCE(status,'aktiv') AS status,
             created_at, updated_at
      FROM booking.companies
    ),
    upserted AS (
      INSERT INTO core.companies
        (name, slug, billing_customer_id, standort, notiz, status, created_at, updated_at)
      SELECT name, slug, billing_customer_id, standort, notiz, status, created_at, updated_at
      FROM src
      ON CONFLICT (slug) DO UPDATE
        SET name                = COALESCE(EXCLUDED.name,                core.companies.name),
            billing_customer_id = COALESCE(EXCLUDED.billing_customer_id, core.companies.billing_customer_id),
            standort            = COALESCE(NULLIF(EXCLUDED.standort,''), core.companies.standort),
            notiz               = COALESCE(NULLIF(EXCLUDED.notiz,''),    core.companies.notiz),
            status              = EXCLUDED.status,
            updated_at          = GREATEST(core.companies.updated_at, EXCLUDED.updated_at)
      RETURNING id, slug
    )
    INSERT INTO _companies_remap (old_id, new_id)
    SELECT s.old_id, u.id FROM src s JOIN upserted u ON u.slug = s.slug;
  END IF;

  -- ─── 4. Company-Members mergen ────────────────────────────────────────
  IF has_b_members THEN
    WITH src AS (
      SELECT
        bm.id                                        AS old_id,
        COALESCE(r.new_id, bm.company_id)            AS new_company_id,
        COALESCE(bm.auth_subject,'')                 AS auth_subject,
        bm.customer_id,
        COALESCE(bm.email,'')                        AS email,
        bm.role,
        COALESCE(bm.status,'active')                 AS status,
        COALESCE(bm.is_primary_contact, FALSE)       AS is_primary_contact,
        bm.created_at, bm.updated_at
      FROM booking.company_members bm
      LEFT JOIN _companies_remap r ON r.old_id = bm.company_id
    ),
    -- Eindeutiger Join-Key für den Remap:
    --   1. (company_id, auth_subject) falls auth_subject <> ''
    --   2. (company_id, customer_id)  falls customer_id IS NOT NULL
    --   3. (company_id, LOWER(email)) falls email <> ''
    upserted AS (
      INSERT INTO core.company_members
        (company_id, auth_subject, customer_id, email, role, status, is_primary_contact, created_at, updated_at)
      SELECT new_company_id, auth_subject, customer_id, email, role, status, is_primary_contact, created_at, updated_at
      FROM src
      -- Keine direkte ON CONFLICT-Klausel möglich, weil mehrere partial unique
      -- indices bestehen. Deshalb: Einfaches INSERT mit Duplikat-Check im JOIN.
      ON CONFLICT DO NOTHING
      RETURNING id, company_id, auth_subject, customer_id, email
    )
    INSERT INTO _members_remap (old_id, new_id)
    SELECT s.old_id,
           COALESCE(
             u.id,
             -- Konflikt-Fall: bereits vorhandenes core.company_members finden
             (SELECT cm.id FROM core.company_members cm
               WHERE cm.company_id = s.new_company_id
                 AND (
                   (s.auth_subject <> '' AND cm.auth_subject = s.auth_subject)
                   OR (s.customer_id IS NOT NULL AND cm.customer_id = s.customer_id)
                   OR (s.email <> '' AND LOWER(cm.email) = LOWER(s.email))
                 )
               ORDER BY cm.id ASC LIMIT 1)
           )
    FROM src s
    LEFT JOIN upserted u
      ON u.company_id   = s.new_company_id
     AND u.auth_subject = s.auth_subject
     AND COALESCE(u.customer_id, -1) = COALESCE(s.customer_id, -1)
     AND LOWER(u.email) = LOWER(s.email);
  END IF;

  -- ─── 5. Company-Invitations mergen ────────────────────────────────────
  IF has_b_invites THEN
    -- Natural key: token (UNIQUE in beiden Schemas)
    INSERT INTO core.company_invitations
      (company_id, email, role, token, expires_at, accepted_at, invited_by,
       given_name, family_name, login_name, created_at)
    SELECT
      COALESCE(r.new_id, bi.company_id),
      bi.email, bi.role, bi.token, bi.expires_at, bi.accepted_at,
      COALESCE(bi.invited_by,''),
      COALESCE(bi.given_name,''),
      COALESCE(bi.family_name,''),
      COALESCE(bi.login_name,''),
      bi.created_at
    FROM booking.company_invitations bi
    LEFT JOIN _companies_remap r ON r.old_id = bi.company_id
    ON CONFLICT (token) DO NOTHING;
  END IF;

  -- ─── 6. FK-Targets in booking.orders + booking.access_subjects umlenken ─
  -- Auf Alt-DBs zeigen diese FKs noch auf booking.company_members; auf Fresh-DBs
  -- bereits auf core.company_members (via core/migrations/002). Ermitteln und
  -- remappen.

  PERFORM 1
  FROM pg_constraint c
  WHERE c.conrelid = 'booking.orders'::regclass
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%created_by_member_id%booking.company_members%';
  IF FOUND THEN
    UPDATE booking.orders o
      SET created_by_member_id = r.new_id
      FROM _members_remap r
      WHERE o.created_by_member_id = r.old_id;

    -- FK droppen + auf core zeigen lassen
    EXECUTE (
      SELECT format('ALTER TABLE booking.orders DROP CONSTRAINT %I', conname)
      FROM pg_constraint
      WHERE conrelid = 'booking.orders'::regclass
        AND contype='f'
        AND pg_get_constraintdef(oid) ILIKE '%created_by_member_id%booking.company_members%'
      LIMIT 1
    );
    ALTER TABLE booking.orders
      ADD CONSTRAINT orders_created_by_member_id_fkey
      FOREIGN KEY (created_by_member_id)
      REFERENCES core.company_members(id)
      ON DELETE SET NULL;
  END IF;

  PERFORM 1
  FROM pg_constraint c
  WHERE c.conrelid = 'booking.access_subjects'::regclass
    AND c.contype = 'f'
    AND pg_get_constraintdef(c.oid) ILIKE '%company_member_id%booking.company_members%';
  IF FOUND THEN
    UPDATE booking.access_subjects s
      SET company_member_id = r.new_id
      FROM _members_remap r
      WHERE s.company_member_id = r.old_id;

    EXECUTE (
      SELECT format('ALTER TABLE booking.access_subjects DROP CONSTRAINT %I', conname)
      FROM pg_constraint
      WHERE conrelid = 'booking.access_subjects'::regclass
        AND contype='f'
        AND pg_get_constraintdef(oid) ILIKE '%company_member_id%booking.company_members%'
      LIMIT 1
    );
    ALTER TABLE booking.access_subjects
      ADD CONSTRAINT access_subjects_company_member_id_fkey
      FOREIGN KEY (company_member_id)
      REFERENCES core.company_members(id)
      ON DELETE CASCADE;
  END IF;

  -- ─── 7. Legacy-Tabellen droppen ────────────────────────────────────────
  -- CASCADE entfernt alle verbleibenden abhängigen FKs (sollte nach Schritt 6
  -- keine mehr geben).
  DROP TABLE IF EXISTS booking.company_invitations CASCADE;
  DROP TABLE IF EXISTS booking.company_members     CASCADE;
  DROP TABLE IF EXISTS booking.companies           CASCADE;
END;
$$;

COMMIT;
