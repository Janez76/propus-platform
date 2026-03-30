-- ═══════════════════════════════════════════════════════════════════════════
-- 016_portal_workspace_customer_id.sql
-- Cutover: Tour-Portal-Workspace-Schlüssel von owner_email → customer_id
--
-- Ziel: 1 Firma = 1 Workspace, identifiziert über core.customers.id
--
-- Schritte:
--   1. customer_id-Spalten in portal_team_members / exclusions / assignees
--   2. Backfill über core.customers.email = owner_email
--      (sekund. Fallback über tour_manager.tours.kunde_ref → core.customers)
--   3. Unique-Index von (owner_email, member_email) → (customer_id, member_email)
--   4. owner_email / workspace_owner_email als gedeprecated markieren
--      (werden nicht sofort gedroppt, damit kein Breaking-Change auf einmal)
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO tour_manager, core, public;

-- ─── 1. Spalten hinzufügen ────────────────────────────────────────────────

ALTER TABLE tour_manager.portal_team_members
  ADD COLUMN IF NOT EXISTS customer_id BIGINT
    REFERENCES core.customers(id) ON DELETE CASCADE;

ALTER TABLE tour_manager.portal_team_exclusions
  ADD COLUMN IF NOT EXISTS customer_id BIGINT
    REFERENCES core.customers(id) ON DELETE CASCADE;

ALTER TABLE tour_manager.portal_tour_assignees
  ADD COLUMN IF NOT EXISTS customer_id BIGINT
    REFERENCES core.customers(id) ON DELETE CASCADE;

-- ─── 2. Backfill: Primär über core.customers.email = owner_email ──────────

-- portal_team_members: direkt per E-Mail-Match
UPDATE tour_manager.portal_team_members m
SET customer_id = cu.id
FROM core.customers cu
WHERE m.customer_id IS NULL
  AND LOWER(TRIM(cu.email)) = LOWER(TRIM(m.owner_email));

-- portal_team_members: Fallback über tours.kunde_ref → customer_number
UPDATE tour_manager.portal_team_members m
SET customer_id = cu.id
FROM tour_manager.tours t
JOIN core.customers cu ON cu.customer_number = TRIM(CAST(t.kunde_ref AS TEXT))
WHERE m.customer_id IS NULL
  AND LOWER(TRIM(t.customer_email)) = LOWER(TRIM(m.owner_email))
  AND t.kunde_ref IS NOT NULL
  AND TRIM(CAST(t.kunde_ref AS TEXT)) <> ''
  AND (
    SELECT COUNT(DISTINCT cu2.id)
    FROM tour_manager.tours t2
    JOIN core.customers cu2 ON cu2.customer_number = TRIM(CAST(t2.kunde_ref AS TEXT))
    WHERE LOWER(TRIM(t2.customer_email)) = LOWER(TRIM(m.owner_email))
      AND t2.kunde_ref IS NOT NULL
  ) = 1;

-- portal_team_members: Fallback über tours.customer_name → core.customers.name/company
UPDATE tour_manager.portal_team_members m
SET customer_id = cu.id
FROM tour_manager.tours t
JOIN core.customers cu ON (
  LOWER(TRIM(cu.name)) = LOWER(TRIM(t.customer_name))
  OR LOWER(TRIM(cu.company)) = LOWER(TRIM(t.customer_name))
)
WHERE m.customer_id IS NULL
  AND LOWER(TRIM(t.customer_email)) = LOWER(TRIM(m.owner_email))
  AND t.customer_name IS NOT NULL
  AND TRIM(t.customer_name) <> ''
  AND (
    SELECT COUNT(DISTINCT cu2.id)
    FROM tour_manager.tours t2
    JOIN core.customers cu2b ON (
      LOWER(TRIM(cu2b.name)) = LOWER(TRIM(t2.customer_name))
      OR LOWER(TRIM(cu2b.company)) = LOWER(TRIM(t2.customer_name))
    )
    WHERE LOWER(TRIM(t2.customer_email)) = LOWER(TRIM(m.owner_email))
      AND t2.customer_name IS NOT NULL
  ) = 1;

-- ─── portal_team_exclusions: gleiche Backfill-Kaskade ────────────────────

UPDATE tour_manager.portal_team_exclusions e
SET customer_id = cu.id
FROM core.customers cu
WHERE e.customer_id IS NULL
  AND LOWER(TRIM(cu.email)) = LOWER(TRIM(e.owner_email));

UPDATE tour_manager.portal_team_exclusions e
SET customer_id = cu.id
FROM tour_manager.tours t
JOIN core.customers cu ON cu.customer_number = TRIM(CAST(t.kunde_ref AS TEXT))
WHERE e.customer_id IS NULL
  AND LOWER(TRIM(t.customer_email)) = LOWER(TRIM(e.owner_email))
  AND t.kunde_ref IS NOT NULL
  AND TRIM(CAST(t.kunde_ref AS TEXT)) <> ''
  AND (
    SELECT COUNT(DISTINCT cu2.id)
    FROM tour_manager.tours t2
    JOIN core.customers cu2 ON cu2.customer_number = TRIM(CAST(t2.kunde_ref AS TEXT))
    WHERE LOWER(TRIM(t2.customer_email)) = LOWER(TRIM(e.owner_email))
      AND t2.kunde_ref IS NOT NULL
  ) = 1;

-- ─── portal_tour_assignees: über workspace_owner_email ───────────────────

UPDATE tour_manager.portal_tour_assignees a
SET customer_id = cu.id
FROM core.customers cu
WHERE a.customer_id IS NULL
  AND LOWER(TRIM(cu.email)) = LOWER(TRIM(a.workspace_owner_email));

UPDATE tour_manager.portal_tour_assignees a
SET customer_id = cu.id
FROM tour_manager.tours t
JOIN core.customers cu ON cu.customer_number = TRIM(CAST(t.kunde_ref AS TEXT))
WHERE a.customer_id IS NULL
  AND LOWER(TRIM(t.customer_email)) = LOWER(TRIM(a.workspace_owner_email))
  AND t.kunde_ref IS NOT NULL
  AND TRIM(CAST(t.kunde_ref AS TEXT)) <> ''
  AND (
    SELECT COUNT(DISTINCT cu2.id)
    FROM tour_manager.tours t2
    JOIN core.customers cu2 ON cu2.customer_number = TRIM(CAST(t2.kunde_ref AS TEXT))
    WHERE LOWER(TRIM(t2.customer_email)) = LOWER(TRIM(a.workspace_owner_email))
      AND t2.kunde_ref IS NOT NULL
  ) = 1;

-- ─── 3. Neue Unique-Indexes (customer_id + member_email) ─────────────────

-- Zuerst alte Zeilen zusammenführen: Wenn mehrere owner_emails derselben
-- customer_id gehören, könnte es doppelte (customer_id, member_email) geben.
-- Hier entfernen wir Duplikate und behalten den neuesten aktiven Eintrag.
DELETE FROM tour_manager.portal_team_members m
WHERE customer_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (customer_id, LOWER(TRIM(member_email))) id
    FROM tour_manager.portal_team_members
    WHERE customer_id IS NOT NULL
    ORDER BY customer_id, LOWER(TRIM(member_email)),
             CASE WHEN status = 'active' THEN 0 ELSE 1 END,
             accepted_at DESC NULLS LAST,
             created_at DESC NULLS LAST
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_customer_member
  ON tour_manager.portal_team_members (customer_id, (LOWER(member_email)))
  WHERE customer_id IS NOT NULL;

DELETE FROM tour_manager.portal_team_exclusions e
WHERE customer_id IS NOT NULL
  AND id NOT IN (
    SELECT DISTINCT ON (customer_id, LOWER(TRIM(member_email))) id
    FROM tour_manager.portal_team_exclusions
    WHERE customer_id IS NOT NULL
    ORDER BY customer_id, LOWER(TRIM(member_email)), created_at DESC NULLS LAST
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_exclusions_customer_member
  ON tour_manager.portal_team_exclusions (customer_id, (LOWER(member_email)))
  WHERE customer_id IS NOT NULL;

-- ─── 4. Indexes auf customer_id für effiziente Abfragen ──────────────────

CREATE INDEX IF NOT EXISTS idx_portal_team_members_customer_id
  ON tour_manager.portal_team_members (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_team_exclusions_customer_id
  ON tour_manager.portal_team_exclusions (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portal_tour_assignees_customer_id
  ON tour_manager.portal_tour_assignees (customer_id)
  WHERE customer_id IS NOT NULL;

-- ─── 5. Hilfsfunktion: customer_id aus E-Mail auflösen (für Code-Transition) ─

CREATE OR REPLACE FUNCTION tour_manager.resolve_customer_id_for_email(p_email TEXT)
RETURNS BIGINT AS $$
DECLARE
  v_id BIGINT;
BEGIN
  -- Direkt über core.customers.email
  SELECT id INTO v_id
  FROM core.customers
  WHERE LOWER(TRIM(email)) = LOWER(TRIM(p_email))
  LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  -- Fallback über tour_manager.tours.kunde_ref
  SELECT DISTINCT cu.id INTO v_id
  FROM tour_manager.tours t
  JOIN core.customers cu ON cu.customer_number = TRIM(CAST(t.kunde_ref AS TEXT))
  WHERE LOWER(TRIM(t.customer_email)) = LOWER(TRIM(p_email))
    AND t.kunde_ref IS NOT NULL
  LIMIT 1;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE;
