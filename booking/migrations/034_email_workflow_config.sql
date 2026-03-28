CREATE TABLE IF NOT EXISTS email_workflow_config (
  id SERIAL PRIMARY KEY,
  status_to VARCHAR(32) NOT NULL,
  template_key VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (status_to, template_key, role)
);

INSERT INTO email_workflow_config (status_to, template_key, role, active) VALUES
  ('provisional', 'provisional_created', 'customer', TRUE),
  ('confirmed', 'confirmed_customer', 'customer', TRUE),
  ('confirmed', 'confirmed_office', 'office', TRUE),
  ('confirmed', 'confirmed_photographer', 'photographer', TRUE),
  ('paused', 'paused_customer', 'customer', TRUE),
  ('paused', 'paused_office', 'office', TRUE),
  ('paused', 'paused_photographer', 'photographer', TRUE),
  ('cancelled', 'cancelled_customer', 'customer', TRUE),
  ('cancelled', 'cancelled_office', 'office', TRUE),
  ('cancelled', 'cancelled_photographer', 'photographer', TRUE)
ON CONFLICT (status_to, template_key, role) DO NOTHING;
