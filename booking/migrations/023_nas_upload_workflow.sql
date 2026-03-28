-- Migration 023: NAS upload workflow, folder links and staged upload batches

CREATE TABLE IF NOT EXISTS order_folder_links (
  id            SERIAL PRIMARY KEY,
  order_no      INTEGER NOT NULL REFERENCES orders(order_no) ON DELETE CASCADE,
  folder_type   TEXT NOT NULL CHECK (folder_type IN ('raw_material','customer_folder')),
  root_kind     TEXT NOT NULL CHECK (root_kind IN ('raw','customer')),
  relative_path TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  display_name  TEXT NOT NULL DEFAULT '',
  company_name  TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'ready'
                 CHECK (status IN ('pending','ready','linked','archived','failed')),
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at   TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_folder_links_active
  ON order_folder_links(order_no, folder_type)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_order_folder_links_order_no
  ON order_folder_links(order_no, created_at DESC);

CREATE TABLE IF NOT EXISTS upload_batches (
  id                   TEXT PRIMARY KEY,
  order_no             INTEGER NOT NULL REFERENCES orders(order_no) ON DELETE CASCADE,
  folder_type          TEXT NOT NULL DEFAULT 'customer_folder'
                       CHECK (folder_type IN ('raw_material','customer_folder')),
  category             TEXT NOT NULL,
  upload_mode          TEXT NOT NULL CHECK (upload_mode IN ('existing','new_batch')),
  status               TEXT NOT NULL DEFAULT 'staged'
                       CHECK (status IN ('staged','transferring','completed','failed','retrying','cancelled')),
  local_path           TEXT NOT NULL,
  target_relative_path TEXT,
  target_absolute_path TEXT,
  batch_folder         TEXT,
  comment              TEXT NOT NULL DEFAULT '',
  file_count           INTEGER NOT NULL DEFAULT 0,
  total_bytes          BIGINT NOT NULL DEFAULT 0,
  uploaded_by          TEXT NOT NULL DEFAULT '',
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_batches_order_no
  ON upload_batches(order_no, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_batches_status
  ON upload_batches(status, created_at DESC);

CREATE TABLE IF NOT EXISTS upload_batch_files (
  id            SERIAL PRIMARY KEY,
  batch_id      TEXT NOT NULL REFERENCES upload_batches(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL,
  staging_path  TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL DEFAULT 0,
  sha256        TEXT,
  status        TEXT NOT NULL DEFAULT 'staged'
                CHECK (status IN ('staged','stored','skipped_duplicate','skipped_invalid_type','failed')),
  duplicate_of  TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_batch_files_batch_id
  ON upload_batch_files(batch_id, id);
