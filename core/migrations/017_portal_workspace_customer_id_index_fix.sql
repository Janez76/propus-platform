-- ═══════════════════════════════════════════════════════════════════════════
-- 017_portal_workspace_customer_id_index_fix.sql
-- Reparatur falls 016 mit alter Index-Definition (LOWER ohne TRIM) lief:
-- Indizes droppen, trimmen, Duplikate entfernen, Indizes mit LOWER(TRIM(...))
-- neu anlegen. Idempotent und sicher für bereits korrigierte DBs.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO tour_manager, core, public;

UPDATE tour_manager.portal_team_members
SET member_email = TRIM(member_email)
WHERE member_email IS NOT NULL AND member_email <> TRIM(member_email);

UPDATE tour_manager.portal_team_exclusions
SET member_email = TRIM(member_email)
WHERE member_email IS NOT NULL AND member_email <> TRIM(member_email);

DROP INDEX IF EXISTS tour_manager.idx_portal_team_customer_member;
DROP INDEX IF EXISTS tour_manager.idx_portal_team_exclusions_customer_member;

DELETE FROM tour_manager.portal_team_members
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY customer_id, LOWER(TRIM(member_email))
             ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END,
                      accepted_at DESC NULLS LAST,
                      created_at DESC NULLS LAST
           ) AS rn
    FROM tour_manager.portal_team_members
    WHERE customer_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

DELETE FROM tour_manager.portal_team_exclusions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY customer_id, LOWER(TRIM(member_email))
             ORDER BY created_at DESC NULLS LAST
           ) AS rn
    FROM tour_manager.portal_team_exclusions
    WHERE customer_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_customer_member
  ON tour_manager.portal_team_members (customer_id, (LOWER(TRIM(member_email))))
  WHERE customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_team_exclusions_customer_member
  ON tour_manager.portal_team_exclusions (customer_id, (LOWER(TRIM(member_email))))
  WHERE customer_id IS NOT NULL;
