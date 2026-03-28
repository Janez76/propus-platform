-- Migration 003: order_reviews Tabelle + email_templates fehlende Spalten
CREATE TABLE IF NOT EXISTS order_reviews (
  id           SERIAL PRIMARY KEY,
  order_no     INTEGER NOT NULL REFERENCES orders(order_no) ON DELETE CASCADE,
  token        TEXT NOT NULL UNIQUE,
  rating       INTEGER CHECK (rating >= 1 AND rating <= 5),
  comment      TEXT,
  submitted_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_reviews_order_no  ON order_reviews(order_no);
CREATE INDEX IF NOT EXISTS idx_order_reviews_token     ON order_reviews(token);
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS label        TEXT NOT NULL DEFAULT '';
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS body_text    TEXT NOT NULL DEFAULT '';
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS placeholders JSONB NOT NULL DEFAULT '[]';
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS active       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE email_template_history ADD COLUMN IF NOT EXISTS changed_by TEXT NOT NULL DEFAULT 'system';