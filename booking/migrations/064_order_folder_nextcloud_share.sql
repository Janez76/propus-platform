-- Migration 064: Nextcloud-Freigabelink für Kundenordner
-- Fügt nextcloud_share_url zur order_folder_links Tabelle hinzu.
-- Wird automatisch befüllt wenn NEXTCLOUD_* Env-Vars konfiguriert sind.

ALTER TABLE booking.order_folder_links
  ADD COLUMN IF NOT EXISTS nextcloud_share_url TEXT;
