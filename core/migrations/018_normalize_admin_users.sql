-- Migration 018: Admin-User-Tabellen normalisieren
-- 
-- Ziel: Konsolidierung von booking.admin_users und tour_manager.admin_users
-- zu einer zentralen core.admin_users Tabelle.
--
-- Da Logto die primäre Authentifizierungsquelle ist, werden die lokalen
-- Passwort-Hashes beibehalten aber als "Legacy" markiert. 
-- Neue Felder: logto_user_id, last_login_at, profile_photo_url, language, phone
--
-- HINWEIS: Diese Migration ist nicht-destruktiv -- die alten Tabellen bleiben
-- als Views (core.v_booking_admin_users, core.v_tour_admin_users) weiterhin
-- verfügbar für Rückwärtskompatibilität.

-- ─── Zentrale Admin-User-Tabelle ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.admin_users (
  id                  BIGSERIAL PRIMARY KEY,
  
  -- Identitätsfelder
  email               TEXT NOT NULL,
  username            TEXT,
  full_name           TEXT,
  
  -- Logto-Integration (primäre Auth-Quelle)
  logto_user_id       TEXT,
  
  -- Legacy-Passwort (für Migration, wird schrittweise entfernt)
  password_hash       TEXT,
  
  -- Zugangssteuerung
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Rollen (combiniert booking + tour_manager)
  -- booking: admin, super_admin, photographer, employee
  -- tour_manager: admin (implizit)
  roles               TEXT[] NOT NULL DEFAULT ARRAY['admin'],
  
  -- Modul-Zugehörigkeit (für RBAC und Filterung)
  -- Werte: booking, tour_manager, both
  module_access       TEXT NOT NULL DEFAULT 'booking',
  
  -- Profil
  phone               TEXT,
  language            TEXT NOT NULL DEFAULT 'de',
  profile_photo_url   TEXT,
  profile_photo_version BIGINT NOT NULL DEFAULT 0,
  
  -- Session-Tracking
  last_login_at       TIMESTAMPTZ,
  invited_by          TEXT,
  
  -- Timestamps
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_admin_users_email
  ON core.admin_users ((LOWER(email)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_admin_users_logto_user_id
  ON core.admin_users (logto_user_id)
  WHERE logto_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_core_admin_users_username
  ON core.admin_users (username)
  WHERE username IS NOT NULL;

-- ─── Bestehende Benutzer migrieren: booking.admin_users ────────────────────
-- Booking-Admins (haben username, role, password_hash)
INSERT INTO core.admin_users (
  email, username, full_name,
  password_hash, is_active, roles, module_access,
  created_at, updated_at
)
SELECT
  COALESCE(b.email, b.username || '@propus.internal'),
  b.username,
  b.name,
  b.password_hash,
  b.active,
  ARRAY[b.role],
  'booking',
  b.created_at,
  b.updated_at
FROM booking.admin_users b
ON CONFLICT (LOWER(email)) DO UPDATE
  SET
    username     = EXCLUDED.username,
    full_name    = COALESCE(core.admin_users.full_name, EXCLUDED.full_name),
    password_hash= COALESCE(core.admin_users.password_hash, EXCLUDED.password_hash),
    is_active    = EXCLUDED.is_active,
    updated_at   = GREATEST(core.admin_users.updated_at, EXCLUDED.updated_at);

-- Logto-User-IDs aus booking.admin_users übernehmen (falls vorhanden, via Migration 047)
UPDATE core.admin_users cu
SET logto_user_id = ba.logto_user_id
FROM booking.admin_users ba
WHERE LOWER(cu.email) = LOWER(COALESCE(ba.email, ba.username || '@propus.internal'))
  AND ba.logto_user_id IS NOT NULL
  AND cu.logto_user_id IS NULL;

-- ─── Bestehende Benutzer migrieren: tour_manager.admin_users ───────────────
-- Tour-Manager-Admins (haben nur email, full_name, password_hash)
INSERT INTO core.admin_users (
  email, full_name,
  password_hash, is_active, roles, module_access,
  last_login_at, created_at, updated_at
)
SELECT
  LOWER(t.email),
  t.full_name,
  t.password_hash,
  t.is_active,
  ARRAY['admin'],
  'tour_manager',
  t.last_login_at,
  t.created_at,
  t.updated_at
FROM tour_manager.admin_users t
ON CONFLICT (LOWER(email)) DO UPDATE
  SET
    module_access = CASE
      WHEN core.admin_users.module_access = 'booking' THEN 'both'
      ELSE core.admin_users.module_access
    END,
    full_name     = COALESCE(core.admin_users.full_name, EXCLUDED.full_name),
    is_active     = core.admin_users.is_active OR EXCLUDED.is_active,
    last_login_at = GREATEST(core.admin_users.last_login_at, EXCLUDED.last_login_at),
    updated_at    = GREATEST(core.admin_users.updated_at, EXCLUDED.updated_at);

-- ─── Kompatibilitäts-Views ─────────────────────────────────────────────────
-- Booking-Module-Code kann weiterhin booking.admin_users abfragen
CREATE OR REPLACE VIEW booking.v_admin_users AS
  SELECT
    id,
    username,
    email,
    full_name AS name,
    roles[1]  AS role,
    password_hash,
    is_active AS active,
    logto_user_id,
    phone,
    language,
    profile_photo_version AS photo_version,
    created_at,
    updated_at
  FROM core.admin_users
  WHERE module_access IN ('booking', 'both');

-- Tour-Manager-Module-Code kann weiterhin tour_manager.admin_users abfragen
CREATE OR REPLACE VIEW tour_manager.v_admin_users AS
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

-- ─── Timestamp-Trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_core_admin_users_updated_at ON core.admin_users;
CREATE TRIGGER trg_core_admin_users_updated_at
  BEFORE UPDATE ON core.admin_users
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
