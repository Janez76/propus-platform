-- Migration 009: Order Status Audit-Log
-- Protokolliert alle Statusuebergaenge mit Quelle, Aktor und Kalender-Resultat.
-- Idempotent (IF NOT EXISTS ueberall).

CREATE TABLE IF NOT EXISTS order_status_audit (
  id              BIGSERIAL PRIMARY KEY,
  order_no        BIGINT    NOT NULL REFERENCES orders(order_no) ON DELETE CASCADE,
  from_status     TEXT      NOT NULL,
  to_status       TEXT      NOT NULL,
  source          TEXT      NOT NULL,  -- 'api', 'expiry_job', 'confirmation_job', 'manual'
  actor_id        TEXT,                -- Admin-User-ID oder Job-Name
  calendar_result TEXT,                -- 'ok', 'skipped', 'error', 'partial', 'not_required'
  error_message   TEXT,                -- Fehlermeldung bei calendar_result='error'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index fuer schnelle Suche nach Auftrag
CREATE INDEX IF NOT EXISTS idx_order_status_audit_order
  ON order_status_audit(order_no);

-- Index fuer Zeitreihen-Abfragen
CREATE INDEX IF NOT EXISTS idx_order_status_audit_created
  ON order_status_audit(created_at DESC);

-- Index fuer Fehler-Monitoring
CREATE INDEX IF NOT EXISTS idx_order_status_audit_error
  ON order_status_audit(calendar_result)
  WHERE calendar_result IN ('error', 'partial');

COMMENT ON TABLE order_status_audit IS
  'Audit-Log aller Bestellstatus-Uebergaenge mit Kalender-Resultat (DoD: Logging + Testbarkeit)';

COMMENT ON COLUMN order_status_audit.source IS
  'Quelle des Uebergangs: api (manuell), expiry_job (Ablauf-Job), confirmation_job (Bestaetigungs-Job), manual (direkter DB-Eingriff)';

COMMENT ON COLUMN order_status_audit.calendar_result IS
  'Ergebnis der Kalender-Operation: ok (erfolgreich), skipped (Flag aus), not_required (kein Kalender-Effekt), error (Fehler), partial (teilweise)';
