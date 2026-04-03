-- 023_tickets.sql
-- Zentrales Ticketsystem – modulübergreifend (tours, booking, etc.)

CREATE TABLE IF NOT EXISTS tour_manager.tickets (
  id              SERIAL PRIMARY KEY,
  module          TEXT NOT NULL DEFAULT 'tours',
  reference_id    TEXT,
  reference_type  TEXT DEFAULT 'tour',
  category        TEXT NOT NULL DEFAULT 'sonstiges',
  subject         TEXT NOT NULL,
  description     TEXT,
  link_url        TEXT,
  attachment_path TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  priority        TEXT NOT NULL DEFAULT 'normal',
  created_by      TEXT,
  created_by_role TEXT DEFAULT 'admin',
  assigned_to     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_module
  ON tour_manager.tickets(module);

CREATE INDEX IF NOT EXISTS idx_tickets_status
  ON tour_manager.tickets(status);

CREATE INDEX IF NOT EXISTS idx_tickets_ref
  ON tour_manager.tickets(reference_type, reference_id);
