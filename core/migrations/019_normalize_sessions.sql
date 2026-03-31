-- Migration 019: Session-Tabellen konsolidieren
--
-- Ziel: booking.booking_sessions + tour_manager.tours_sessions -> core.sessions
-- mit einem session_kind-Feld ('booking', 'tour_admin', 'tour_portal')
--
-- Bestehende Tabellen bleiben für Rückwärtskompatibilität erhalten.
-- Die session-stores werden schrittweise auf core.sessions umgestellt.

-- ─── Zentrale Session-Tabelle ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS core.sessions (
  sid         TEXT PRIMARY KEY,
  
  -- Art der Session
  -- Werte: booking_admin, tour_admin, tour_portal
  kind        TEXT NOT NULL DEFAULT 'booking_admin',
  
  sess        JSONB NOT NULL,
  expire      TIMESTAMPTZ NOT NULL,
  
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_sessions_expire
  ON core.sessions (expire);

CREATE INDEX IF NOT EXISTS idx_core_sessions_kind
  ON core.sessions (kind);

-- ─── Bestehende Sessions migrieren ─────────────────────────────────────────
-- Booking-Sessions
INSERT INTO core.sessions (sid, kind, sess, expire)
SELECT
  sid,
  'booking_admin',
  sess::jsonb,
  expire
FROM core.booking_sessions
WHERE expire > NOW()
ON CONFLICT (sid) DO NOTHING;

-- Tour-Sessions (Admin)
INSERT INTO core.sessions (sid, kind, sess, expire)
SELECT
  sid,
  'tour_admin',
  sess::jsonb,
  expire
FROM core.tours_sessions
WHERE expire > NOW()
  AND (sess::jsonb -> 'admin') IS NOT NULL
ON CONFLICT (sid) DO NOTHING;

-- Tour-Sessions (Portal)
INSERT INTO core.sessions (sid, kind, sess, expire)
SELECT
  -- Prefix to avoid conflicts if same SID exists in both
  'portal_' || sid,
  'tour_portal',
  sess::jsonb,
  expire
FROM core.tours_sessions
WHERE expire > NOW()
  AND (sess::jsonb -> 'portal') IS NOT NULL
ON CONFLICT (sid) DO NOTHING;

-- ─── Cleanup-Funktion ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.cleanup_expired_sessions()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM core.sessions WHERE expire < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  DELETE FROM core.booking_sessions WHERE expire < NOW();
  DELETE FROM core.tours_sessions WHERE expire < NOW();
  RETURN deleted_count;
END;
$$;

COMMENT ON TABLE core.sessions IS 'Zentrale Session-Tabelle (konsolidiert aus booking_sessions + tours_sessions)';
COMMENT ON COLUMN core.sessions.kind IS 'Art der Session: booking_admin, tour_admin, tour_portal';
