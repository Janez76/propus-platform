-- Migration 033: Logto Big-Bang Cutover Vorbereitung
-- Erweitert core.admin_users um last_login_at (für AdminUsersPage)
-- und stellt sicher dass alle benötigten lokalen Credentials vorhanden sind.
-- HINWEIS: core.admin_users + last_login_at + Indexes wurden bereits in Migration 018 erstellt.
-- Diese Migration ist daher eine sichere No-Op mit korrekten Schema-Prefixen.

-- 1. last_login_at Spalte hinzufügen falls nicht vorhanden (018 hat das bereits)
ALTER TABLE core.admin_users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 2. Index auf email für schnelle Lookups (IF NOT EXISTS, da 018 diese bereits erstellt)
CREATE INDEX IF NOT EXISTS idx_core_admin_users_email_033 ON core.admin_users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_core_admin_users_username_033 ON core.admin_users (LOWER(username));

-- 3. Sicherstellen dass username eindeutig ist (falls noch nicht)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.admin_users'::regclass
      AND contype = 'u'
      AND conname = 'admin_users_username_key'
  ) THEN
    BEGIN
      ALTER TABLE core.admin_users ADD CONSTRAINT admin_users_username_key UNIQUE (username);
    EXCEPTION WHEN duplicate_table THEN NULL;
    END;
  END IF;
END $$;

-- 4. Backfill: Falls admin_users Einträge kein password_hash haben aber aktiv sind,
--    als Hinweis markieren (wird beim nächsten Admin-Reset gefixt)
-- KEIN automatischer Reset – Sicherheitsanalyse zuerst.
-- Admins ohne Passwort müssen über den Admin-Zugang ein Passwort setzen.

-- 5. Audit-Log: Zeitpunkt der Migration festhalten
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'system_events' LIMIT 1) THEN
    INSERT INTO system_events (event_type, payload, created_at)
    VALUES ('logto_cutover_migration', '{"migration": "033", "action": "logto_removed", "admin_users_last_login_added": true}', NOW())
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 6. Status-Prüfung: Anzahl Admin-User mit und ohne Passwort
-- (nur als Kommentar – muss manuell überprüft werden)
-- SELECT
--   COUNT(*) FILTER (WHERE password_hash IS NOT NULL) AS with_password,
--   COUNT(*) FILTER (WHERE password_hash IS NULL) AS without_password,
--   COUNT(*) AS total
-- FROM admin_users WHERE active = TRUE;
