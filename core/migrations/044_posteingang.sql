-- 044_posteingang.sql — Zentrales Posteingang-Modul (Konversationen, Nachrichten, Aufgaben)
SET search_path TO tour_manager, core, booking, public;

CREATE TABLE IF NOT EXISTS tour_manager.posteingang_conversations (
  id                       BIGSERIAL PRIMARY KEY,
  subject                  TEXT NOT NULL DEFAULT '',
  channel                  TEXT NOT NULL DEFAULT 'email'
                             CHECK (channel IN ('email', 'internal', 'task_only')),
  status                   TEXT NOT NULL DEFAULT 'open'
                             CHECK (status IN ('open', 'in_progress', 'waiting', 'resolved', 'archived')),
  priority                 TEXT NOT NULL DEFAULT 'medium'
                             CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  customer_id              INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  order_id                 INTEGER REFERENCES booking.orders(id) ON DELETE SET NULL,
  tour_id                  INTEGER REFERENCES tour_manager.tours(id) ON DELETE SET NULL,
  assigned_admin_user_id   BIGINT REFERENCES core.admin_users(id) ON DELETE SET NULL,
  created_by_email         TEXT NOT NULL DEFAULT '',
  graph_conversation_id    TEXT,
  graph_mailbox_address    TEXT,
  external_source          TEXT,
  external_id                TEXT,
  last_message_at          TIMESTAMPTZ,
  first_response_at        TIMESTAMPTZ,
  resolved_at              TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (external_source, external_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_posteingang_conv_graph_conv
  ON tour_manager.posteingang_conversations (graph_conversation_id)
  WHERE graph_conversation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posteingang_conv_status_last
  ON tour_manager.posteingang_conversations (status, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_posteingang_conv_customer
  ON tour_manager.posteingang_conversations (customer_id, status);

CREATE INDEX IF NOT EXISTS idx_posteingang_conv_assigned
  ON tour_manager.posteingang_conversations (assigned_admin_user_id, status);

CREATE TABLE IF NOT EXISTS tour_manager.posteingang_messages (
  id                         BIGSERIAL PRIMARY KEY,
  conversation_id            BIGINT NOT NULL REFERENCES tour_manager.posteingang_conversations(id) ON DELETE CASCADE,
  direction                  TEXT NOT NULL
                             CHECK (direction IN ('inbound', 'outbound', 'internal_note', 'system')),
  from_name                  TEXT,
  from_email                 TEXT,
  to_emails                  TEXT[] NOT NULL DEFAULT '{}',
  cc_emails                  TEXT[] NOT NULL DEFAULT '{}',
  bcc_emails                 TEXT[] NOT NULL DEFAULT '{}',
  subject                    TEXT,
  body_html                  TEXT,
  body_text                  TEXT,
  graph_message_id           TEXT,
  graph_internet_message_id  TEXT,
  in_reply_to_message_id     TEXT,
  author_email               TEXT,
  sent_at                    TIMESTAMPTZ NOT NULL,
  received_at                TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_posteingang_msg_graph_id
  ON tour_manager.posteingang_messages (graph_message_id)
  WHERE graph_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posteingang_msg_conv_sent
  ON tour_manager.posteingang_messages (conversation_id, sent_at);

CREATE TABLE IF NOT EXISTS tour_manager.posteingang_message_attachments (
  id            BIGSERIAL PRIMARY KEY,
  message_id    BIGINT NOT NULL REFERENCES tour_manager.posteingang_messages(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  content_type  TEXT,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  storage_key   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tour_manager.posteingang_tasks (
  id                       BIGSERIAL PRIMARY KEY,
  title                    TEXT NOT NULL,
  description              TEXT,
  status                   TEXT NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  priority                 TEXT NOT NULL DEFAULT 'medium'
                           CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_at                   TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  conversation_id          BIGINT REFERENCES tour_manager.posteingang_conversations(id) ON DELETE SET NULL,
  customer_id              INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  order_id                 INTEGER REFERENCES booking.orders(id) ON DELETE SET NULL,
  tour_id                  INTEGER REFERENCES tour_manager.tours(id) ON DELETE SET NULL,
  assigned_admin_user_id   BIGINT REFERENCES core.admin_users(id) ON DELETE SET NULL,
  created_by_email         TEXT NOT NULL DEFAULT '',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posteingang_tasks_status_due
  ON tour_manager.posteingang_tasks (status, due_at);

CREATE INDEX IF NOT EXISTS idx_posteingang_tasks_assignee
  ON tour_manager.posteingang_tasks (assigned_admin_user_id, status);

CREATE TABLE IF NOT EXISTS tour_manager.posteingang_tags (
  conversation_id BIGINT NOT NULL REFERENCES tour_manager.posteingang_conversations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  PRIMARY KEY (conversation_id, name)
);

CREATE TABLE IF NOT EXISTS tour_manager.posteingang_graph_sync_state (
  mailbox_address TEXT NOT NULL,
  folder_scope    TEXT NOT NULL DEFAULT 'inbox',
  delta_token     TEXT,
  last_sync_at    TIMESTAMPTZ,
  last_error_at   TIMESTAMPTZ,
  last_error_message TEXT,
  PRIMARY KEY (mailbox_address, folder_scope)
);
