-- Migration 040: admin_users Legacy-Tabellen durch Views ersetzen
--
-- Ziel: core.admin_users wird physische Single Source of Truth.
--   - booking.admin_users und tour_manager.admin_users werden VIEWs über core.admin_users
--   - INSTEAD OF INSERT/UPDATE/DELETE-Trigger schreiben zurück auf core.admin_users
--   - FK booking.access_subjects.admin_user_id zeigt künftig auf core.admin_users(id)
--
-- Voraussetzung: Migration 018 hat core.admin_users befüllt und die Read-Views
-- booking.v_admin_users / tour_manager.v_admin_users angelegt. Die Legacy-Tabellen
-- booking.admin_users / tour_manager.admin_users enthalten identische Daten
-- (Migration 018 hat sie nicht gelöscht).
--
-- Diese Migration ist destruktiv für die Legacy-Tabellen – DB-Backup vor Deploy ist Pflicht.

BEGIN;

-- ─── 1. ID-Remap: alte booking-ID → neue core-ID (per Email) ────────────────
-- access_subjects verweist aktuell auf booking.admin_users(id). Wenn Migration 018
-- den Datensatz in core.admin_users unter einer anderen BIGSERIAL-ID angelegt hat,
-- muss access_subjects.admin_user_id umgeschrieben werden, bevor die FK umgelenkt
-- wird.

CREATE TEMP TABLE _admin_id_remap (
  old_booking_id BIGINT,
  new_core_id    BIGINT
) ON COMMIT DROP;

INSERT INTO _admin_id_remap (old_booking_id, new_core_id)
SELECT b.id, c.id
FROM booking.admin_users b
JOIN core.admin_users   c ON LOWER(c.email) = LOWER(COALESCE(b.email, b.username || '@propus.internal'))
WHERE b.id IS DISTINCT FROM c.id;

UPDATE booking.access_subjects s
SET admin_user_id = r.new_core_id
FROM _admin_id_remap r
WHERE s.admin_user_id = r.old_booking_id;

-- ─── 2. FK auf access_subjects.admin_user_id umlenken ───────────────────────
-- Der CASCADE-Drop der Legacy-Tabelle würde den FK implizit entfernen; wir droppen
-- ihn vorher explizit und legen ihn mit neuem Target an.

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'booking.access_subjects'::regclass
    AND contype  = 'f'
    AND pg_get_constraintdef(oid) ILIKE '%admin_user_id%admin_users%';
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE booking.access_subjects DROP CONSTRAINT %I', fk_name);
  END IF;
END;
$$;

-- ─── 3. Alte Read-Views droppen (Namenskollision mit neuen Views vermeiden) ─
DROP VIEW IF EXISTS booking.v_admin_users;
DROP VIEW IF EXISTS tour_manager.v_admin_users;

-- ─── 4. Legacy-Tabellen entfernen ───────────────────────────────────────────
DROP TABLE IF EXISTS booking.admin_users CASCADE;
DROP TABLE IF EXISTS tour_manager.admin_users CASCADE;

-- ─── 5. Kompatibilitäts-Views mit Legacy-Spaltennamen ──────────────────────

CREATE VIEW booking.admin_users AS
  SELECT
    id,
    username,
    email,
    full_name             AS name,
    COALESCE(roles[1], 'admin') AS role,
    password_hash,
    is_active             AS active,
    logto_user_id,
    phone,
    language,
    profile_photo_version,
    last_login_at,
    created_at,
    updated_at
  FROM core.admin_users
  WHERE module_access IN ('booking', 'both');

CREATE VIEW tour_manager.admin_users AS
  SELECT
    id,
    email,
    full_name,
    password_hash,
    is_active,
    invited_by,
    last_login_at,
    created_at,
    updated_at
  FROM core.admin_users
  WHERE module_access IN ('tour_manager', 'both');

-- ─── 6. INSTEAD-OF-Trigger für booking.admin_users ──────────────────────────

CREATE OR REPLACE FUNCTION core.booking_admin_users_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO core.admin_users (
    username, email, full_name, roles, password_hash, is_active,
    logto_user_id, phone, language, profile_photo_version,
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
      last_login_at = COALESCE(EXCLUDED.last_login_at, core.admin_users.last_login_at),
      module_access = CASE
                        WHEN core.admin_users.module_access = 'tour_manager' THEN 'both'
                        ELSE core.admin_users.module_access
                      END,
      updated_at    = NOW()
  RETURNING id INTO v_id;

  NEW.id         := v_id;
  NEW.created_at := COALESCE(NEW.created_at, NOW());
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.booking_admin_users_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE core.admin_users SET
    username              = NEW.username,
    email                 = NEW.email,
    full_name             = NEW.name,
    roles                 = CASE
                              WHEN NEW.role IS NOT NULL
                                THEN ARRAY[NEW.role]::TEXT[]
                              ELSE roles
                            END,
    password_hash         = NEW.password_hash,
    is_active             = NEW.active,
    logto_user_id         = NEW.logto_user_id,
    phone                 = NEW.phone,
    language              = COALESCE(NEW.language, language),
    profile_photo_version = COALESCE(NEW.profile_photo_version, profile_photo_version),
    last_login_at         = NEW.last_login_at,
    updated_at            = NOW()
  WHERE id = OLD.id;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.booking_admin_users_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT module_access FROM core.admin_users WHERE id = OLD.id) = 'both' THEN
    UPDATE core.admin_users
      SET module_access = 'tour_manager',
          updated_at    = NOW()
      WHERE id = OLD.id;
  ELSE
    DELETE FROM core.admin_users WHERE id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER booking_admin_users_instead_insert
  INSTEAD OF INSERT ON booking.admin_users
  FOR EACH ROW EXECUTE FUNCTION core.booking_admin_users_insert();

CREATE TRIGGER booking_admin_users_instead_update
  INSTEAD OF UPDATE ON booking.admin_users
  FOR EACH ROW EXECUTE FUNCTION core.booking_admin_users_update();

CREATE TRIGGER booking_admin_users_instead_delete
  INSTEAD OF DELETE ON booking.admin_users
  FOR EACH ROW EXECUTE FUNCTION core.booking_admin_users_delete();

-- ─── 7. INSTEAD-OF-Trigger für tour_manager.admin_users ─────────────────────

CREATE OR REPLACE FUNCTION core.tour_manager_admin_users_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO core.admin_users (
    email, full_name, password_hash, is_active, invited_by,
    last_login_at, roles, module_access, created_at, updated_at
  )
  VALUES (
    LOWER(NEW.email),
    NEW.full_name,
    NEW.password_hash,
    COALESCE(NEW.is_active, TRUE),
    NEW.invited_by,
    NEW.last_login_at,
    ARRAY['admin']::TEXT[],
    'tour_manager',
    COALESCE(NEW.created_at, NOW()),
    COALESCE(NEW.updated_at, NOW())
  )
  ON CONFLICT ((LOWER(email))) DO UPDATE
    SET
      full_name     = COALESCE(EXCLUDED.full_name, core.admin_users.full_name),
      password_hash = COALESCE(EXCLUDED.password_hash, core.admin_users.password_hash),
      is_active     = EXCLUDED.is_active,
      invited_by    = COALESCE(core.admin_users.invited_by, EXCLUDED.invited_by),
      last_login_at = COALESCE(EXCLUDED.last_login_at, core.admin_users.last_login_at),
      module_access = CASE
                        WHEN core.admin_users.module_access = 'booking' THEN 'both'
                        ELSE core.admin_users.module_access
                      END,
      updated_at    = NOW()
  RETURNING id INTO v_id;

  NEW.id         := v_id;
  NEW.created_at := COALESCE(NEW.created_at, NOW());
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.tour_manager_admin_users_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE core.admin_users SET
    email         = LOWER(NEW.email),
    full_name     = NEW.full_name,
    password_hash = NEW.password_hash,
    is_active     = NEW.is_active,
    invited_by    = NEW.invited_by,
    last_login_at = NEW.last_login_at,
    updated_at    = NOW()
  WHERE id = OLD.id;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION core.tour_manager_admin_users_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT module_access FROM core.admin_users WHERE id = OLD.id) = 'both' THEN
    UPDATE core.admin_users
      SET module_access = 'booking',
          updated_at    = NOW()
      WHERE id = OLD.id;
  ELSE
    DELETE FROM core.admin_users WHERE id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER tour_manager_admin_users_instead_insert
  INSTEAD OF INSERT ON tour_manager.admin_users
  FOR EACH ROW EXECUTE FUNCTION core.tour_manager_admin_users_insert();

CREATE TRIGGER tour_manager_admin_users_instead_update
  INSTEAD OF UPDATE ON tour_manager.admin_users
  FOR EACH ROW EXECUTE FUNCTION core.tour_manager_admin_users_update();

CREATE TRIGGER tour_manager_admin_users_instead_delete
  INSTEAD OF DELETE ON tour_manager.admin_users
  FOR EACH ROW EXECUTE FUNCTION core.tour_manager_admin_users_delete();

-- ─── 8. FK auf access_subjects.admin_user_id neu anlegen ────────────────────
ALTER TABLE booking.access_subjects
  ADD CONSTRAINT access_subjects_admin_user_id_fkey
  FOREIGN KEY (admin_user_id)
  REFERENCES core.admin_users(id)
  ON DELETE CASCADE;

COMMIT;
