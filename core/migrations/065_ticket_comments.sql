-- 065_ticket_comments.sql
-- Verlaufs-/Notiz-Thread pro Ticket + Performance-Indizes für die Ticket-Liste.

CREATE TABLE IF NOT EXISTS tour_manager.ticket_comments (
  id              SERIAL PRIMARY KEY,
  ticket_id       INTEGER NOT NULL REFERENCES tour_manager.tickets(id) ON DELETE CASCADE,
  author          TEXT,
  author_role     TEXT DEFAULT 'admin',
  kind            TEXT NOT NULL DEFAULT 'comment',   -- 'comment' = Notiz, 'system' = automatischer Eintrag
  body            TEXT NOT NULL,
  attachment_path TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket
  ON tour_manager.ticket_comments(ticket_id, created_at);

-- Standard-Liste filtert nach status und sortiert created_at DESC.
CREATE INDEX IF NOT EXISTS idx_tickets_status_created
  ON tour_manager.tickets(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to
  ON tour_manager.tickets(assigned_to);
