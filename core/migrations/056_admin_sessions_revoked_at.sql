-- ═══════════════════════════════════════════════════════════════════════════
-- 056_admin_sessions_revoked_at.sql
--
-- `revoked_at`-Spalte fuer booking.admin_sessions (Bug-Hunt T01 INFO).
--
-- Hintergrund:
--   Bisher konnten Admin-Sessions nur durch Loeschen (`DELETE FROM
--   admin_sessions`) oder durch Ablauf (`expires_at`) ungueltig gemacht
--   werden. Ein expliziter "Logout" loescht den Cookie clientseitig, aber
--   der Token-Hash blieb bis Expiry gueltig — bei Token-Leak (Logs,
--   geteilte Sessions) blieb der Angreifer bis zum Expiry drin.
--
-- Loesung:
--   Soft-Revoke via `revoked_at TIMESTAMPTZ NULL`. Logout setzt
--   `revoked_at = NOW()`. Auth-Lookup filtert `WHERE revoked_at IS NULL`.
--   Vorteil ggueber DELETE: Audit-Trail bleibt erhalten (wann wurde welche
--   Session widerrufen, optional von wem).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE booking.admin_sessions
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;

-- Partial-Index nur auf revoked_at IS NULL: Postgres erlaubt in
-- Index-Predicates ausschliesslich IMMUTABLE-Funktionen, NOW() ist
-- STABLE -> CREATE INDEX wuerde mit "functions in index predicate
-- must be marked IMMUTABLE" failen (Codex P1).
-- Die expires_at-Pruefung laeuft weiterhin im WHERE der Auth-Query;
-- der Index gibt uns kompakte active-rows ueber (token_hash, expires_at).
CREATE INDEX IF NOT EXISTS idx_admin_sessions_active
  ON booking.admin_sessions (token_hash, expires_at)
  WHERE revoked_at IS NULL;

COMMENT ON COLUMN booking.admin_sessions.revoked_at IS
  'Soft-Revoke-Marker fuer expliziten Logout. NULL = aktive Session, sonst der Zeitpunkt der Revocation. Auth-Queries muessen revoked_at IS NULL pruefen.';
