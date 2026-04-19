-- Admin-Users: Avatar-URL (Pfad unter /assets/admin-avatars/... oder absolute URL).
-- Nach core/migrations/040: booking.admin_users ist eine VIEW → Spalte nur auf core.admin_users,
-- dann Views + INSTEAD-OF-Trigger wie in 040 erneuern.

BEGIN;

ALTER TABLE core.admin_users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- booking.admin_users: Spalte durchreichen (Kompatibilität mit Legacy-Spaltennamen)
CREATE OR REPLACE VIEW booking.admin_users AS
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
    avatar_url,
    last_login_at,
    created_at,
    updated_at
  FROM core.admin_users
  WHERE module_access IN ('booking', 'both');

CREATE OR REPLACE VIEW tour_manager.admin_users AS
  SELECT
    id,
    email,
    full_name,
    password_hash,
    is_active,
    invited_by,
    avatar_url,
    last_login_at,
    created_at,
    updated_at
  FROM core.admin_users
  WHERE module_access IN ('tour_manager', 'both');

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
    avatar_url            = COALESCE(NEW.avatar_url, avatar_url),
    last_login_at         = NEW.last_login_at,
    updated_at            = NOW()
  WHERE id = OLD.id;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

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
      avatar_url    = COALESCE(EXCLUDED.avatar_url, core.admin_users.avatar_url),
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
    avatar_url    = COALESCE(NEW.avatar_url, avatar_url),
    last_login_at = NEW.last_login_at,
    updated_at    = NOW()
  WHERE id = OLD.id;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

COMMIT;
