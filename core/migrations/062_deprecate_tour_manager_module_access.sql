-- Migration 062: deprecate `module_access='tour_manager'` Wert
--
-- Hintergrund: Migration 018 hat 3 Werte eingeführt — 'booking', 'tour_manager',
-- 'both'. Inzwischen ist die Frontend/Login-Realität einheitlich:
--   - /auth/login (booking-server) ist der einzige Login-Pfad fuer interne Admins
--   - dieser greift auf die View booking.admin_users (Filter IN 'booking','both')
--   - reine 'tour_manager'-User waren damit unsichtbar (siehe Ivan-Vorfall 2026-05-07)
--
-- Stand 2026-05-07 vor dieser Migration:
--   booking      | 1
--   both         | 2
--   tour_manager | 0  (Ivan wurde manuell auf 'both' gesetzt)
--
-- Diese Migration:
--   1. Migriert evtl. verbliebene 'tour_manager'-Zeilen zu 'both' (idempotent)
--   2. Erweitert View tour_manager.admin_users sodass sie alle aktiven Admins
--      zeigt (Filter angeglichen an booking.admin_users)
--   3. Aktualisiert die INSTEAD-OF-INSERT/DELETE-Trigger-Funktionen sodass sie
--      nicht mehr 'tour_manager' als module_access setzen
--   4. Setzt CHECK-Constraint sodass kuenftige Inserts kein 'tour_manager' mehr
--      erlauben
--
-- Schema `tour_manager.*` (Tabellen tours, portal_users, etc.) bleibt
-- unangetastet — nur der Spalten-WERT 'tour_manager' in core.admin_users.module_access
-- wird deprecated.
--
-- ROLLBACK-Hinweis: Diese Migration ist konzeptionell rueckwaerts-kompatibel,
-- weil bestehender Code auf der View tour_manager.admin_users weiter zugreift —
-- nur Filter ist breiter. Im Notfall kann der Filter via separate Migration
-- wieder enggezogen werden.

BEGIN;

-- ─── 1. Daten-Migration ───────────────────────────────────────────────────
-- Verbliebene 'tour_manager'-Zeilen auf 'both' setzen.
UPDATE core.admin_users
   SET module_access = 'both', updated_at = NOW()
 WHERE module_access = 'tour_manager';

-- ─── 2. View tour_manager.admin_users: Filter angleichen ─────────────────
-- Vorher: WHERE module_access IN ('tour_manager', 'both')
-- Nachher: WHERE module_access IN ('booking', 'both')
-- Damit ist die View effektiv ein Mirror der booking.admin_users-Logik,
-- behaelt aber ihre tour_manager-spezifische Spaltenauswahl (kein username,
-- kein role/active, dafuer invited_by).
CREATE OR REPLACE VIEW tour_manager.admin_users AS
  SELECT
    id,
    email,
    full_name,
    password_hash,
    is_active,
    invited_by,
    last_login_at,
    created_at,
    updated_at,
    avatar_url
  FROM core.admin_users
  WHERE module_access IN ('booking', 'both');

-- ─── 3. INSTEAD-OF-INSERT-Trigger fuer tour_manager.admin_users ──────────
-- Vorher: hardcoded module_access='tour_manager' beim INSERT, +
-- ON CONFLICT-Branch: ('booking' -> 'both')
-- Nachher: module_access='booking' (consistent mit booking.admin_users-Trigger);
-- ON CONFLICT-Branch: kein module_access-Update mehr
CREATE OR REPLACE FUNCTION core.tour_manager_admin_users_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO core.admin_users (
    email, full_name, password_hash, is_active, invited_by,
    avatar_url,
    last_login_at, roles, module_access, created_at, updated_at
  )
  VALUES (
    LOWER(NEW.email),
    NEW.full_name,
    NEW.password_hash,
    COALESCE(NEW.is_active, TRUE),
    NEW.invited_by,
    NEW.avatar_url,
    NEW.last_login_at,
    ARRAY['admin']::TEXT[],
    'booking',
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT ((LOWER(email))) DO UPDATE
    SET
      full_name     = COALESCE(EXCLUDED.full_name, core.admin_users.full_name),
      password_hash = COALESCE(EXCLUDED.password_hash, core.admin_users.password_hash),
      is_active     = EXCLUDED.is_active,
      invited_by    = COALESCE(core.admin_users.invited_by, EXCLUDED.invited_by),
      avatar_url    = COALESCE(EXCLUDED.avatar_url, core.admin_users.avatar_url),
      last_login_at = COALESCE(EXCLUDED.last_login_at, core.admin_users.last_login_at),
      updated_at    = NOW()
  RETURNING id INTO v_id;

  NEW.id         := v_id;
  NEW.created_at := COALESCE(NEW.created_at, NOW());
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ─── 4. INSTEAD-OF-DELETE-Trigger fuer tour_manager.admin_users ──────────
-- Vorher: bei 'both' nur module_access auf 'tour_manager' downgraden, sonst DELETE
-- Nachher: physisch loeschen (wie booking.admin_users-Trigger)
-- Begruendung: 'tour_manager' als Wert ist deprecated, der Sonderfall entfaellt.
CREATE OR REPLACE FUNCTION core.tour_manager_admin_users_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM core.admin_users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

-- ─── 5. INSTEAD-OF-INSERT-Trigger fuer booking.admin_users ───────────────
-- Anpassung im ON CONFLICT-Branch: ('tour_manager' -> 'both') Symmetrie
-- entfaellt, da 'tour_manager' als Wert nicht mehr existieren kann.
CREATE OR REPLACE FUNCTION core.booking_admin_users_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO core.admin_users (
    username, email, full_name, roles, password_hash, is_active,
    logto_user_id, phone, language, profile_photo_version,
    avatar_url,
    last_login_at, module_access, created_at, updated_at
  )
  VALUES (
    NEW.username,
    NEW.email,
    NEW.name,
    ARRAY[COALESCE(NEW.role, 'admin')],
    NEW.password_hash,
    COALESCE(NEW.active, TRUE),
    NEW.logto_user_id,
    NEW.phone,
    COALESCE(NEW.language, 'de'),
    COALESCE(NEW.profile_photo_version, 0),
    NEW.avatar_url,
    NEW.last_login_at,
    'booking',
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT ((LOWER(email))) DO UPDATE
    SET
      username      = COALESCE(EXCLUDED.username, core.admin_users.username),
      full_name     = COALESCE(EXCLUDED.full_name, core.admin_users.full_name),
      roles         = CASE
                        WHEN EXCLUDED.roles IS NOT NULL AND array_length(EXCLUDED.roles, 1) > 0
                          THEN EXCLUDED.roles
                        ELSE core.admin_users.roles
                      END,
      password_hash = COALESCE(EXCLUDED.password_hash, core.admin_users.password_hash),
      is_active     = EXCLUDED.is_active,
      logto_user_id = COALESCE(EXCLUDED.logto_user_id, core.admin_users.logto_user_id),
      phone         = COALESCE(EXCLUDED.phone, core.admin_users.phone),
      language      = COALESCE(EXCLUDED.language, core.admin_users.language),
      profile_photo_version = EXCLUDED.profile_photo_version,
      avatar_url    = COALESCE(EXCLUDED.avatar_url, core.admin_users.avatar_url),
      last_login_at = COALESCE(EXCLUDED.last_login_at, core.admin_users.last_login_at),
      updated_at    = NOW()
  RETURNING id INTO v_id;

  NEW.id         := v_id;
  NEW.created_at := COALESCE(NEW.created_at, NOW());
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- ─── 6. CHECK-Constraint: module_access nur noch 'booking' | 'both' ──────
-- Durch die Migration sind alle Zeilen bereits konform (siehe Schritt 1).
-- Der Constraint verhindert kuenftige Inserts mit 'tour_manager'.
ALTER TABLE core.admin_users
  DROP CONSTRAINT IF EXISTS admin_users_module_access_check;

ALTER TABLE core.admin_users
  ADD CONSTRAINT admin_users_module_access_check
  CHECK (module_access IN ('booking', 'both'));

COMMIT;
