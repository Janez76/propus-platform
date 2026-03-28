-- Aktivitätsprotokoll für Fotografen/Mitarbeiter
CREATE TABLE IF NOT EXISTS employee_activity_log (
  id            BIGSERIAL PRIMARY KEY,
  employee_key  TEXT        NOT NULL,
  action        TEXT        NOT NULL,
  details       JSONB       NOT NULL DEFAULT '{}',
  performed_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employee_activity_log_employee_key_idx
  ON employee_activity_log (employee_key, created_at DESC);
