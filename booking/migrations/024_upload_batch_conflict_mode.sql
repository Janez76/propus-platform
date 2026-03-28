-- 024: Add conflict_mode and custom_folder_name to upload_batches
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS conflict_mode TEXT NOT NULL DEFAULT 'skip';
ALTER TABLE upload_batches ADD COLUMN IF NOT EXISTS custom_folder_name TEXT;
