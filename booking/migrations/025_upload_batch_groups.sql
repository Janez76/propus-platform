-- 025: Group multipart uploads into one logical session
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS upload_group_id TEXT;
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS upload_group_total_parts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS upload_group_part_index INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_upload_batches_group_id
  ON upload_batches(upload_group_id, upload_group_part_index, created_at DESC);
