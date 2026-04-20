-- Audit log for order changes shown in the EditOrderDrawer "Verlauf" tab.
CREATE TABLE IF NOT EXISTS order_event_log (
  id           BIGSERIAL PRIMARY KEY,
  order_no     BIGINT NOT NULL,
  event_type   TEXT NOT NULL,
  actor_user   TEXT NOT NULL DEFAULT '',
  actor_role   TEXT NOT NULL DEFAULT '',
  old_value    JSONB,
  new_value    JSONB,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_event_log_order_no_created
  ON order_event_log (order_no, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_event_log_event_type
  ON order_event_log (event_type);
