-- 069_order_folder_selection.sql
-- Dritter Ordner-Typ "selection" (Zur Auswahl) — Quellordner fuer
-- Bildauswahl-Galerien. Erweitert die CHECK-Constraints in
-- booking.order_folder_links und booking.upload_batches.

ALTER TABLE booking.order_folder_links
  DROP CONSTRAINT IF EXISTS order_folder_links_folder_type_check;

ALTER TABLE booking.order_folder_links
  ADD CONSTRAINT order_folder_links_folder_type_check
  CHECK (folder_type IN ('raw_material','customer_folder','selection'));

ALTER TABLE booking.order_folder_links
  DROP CONSTRAINT IF EXISTS order_folder_links_root_kind_check;

ALTER TABLE booking.order_folder_links
  ADD CONSTRAINT order_folder_links_root_kind_check
  CHECK (root_kind IN ('raw','customer','selection'));

ALTER TABLE booking.upload_batches
  DROP CONSTRAINT IF EXISTS upload_batches_folder_type_check;

ALTER TABLE booking.upload_batches
  ADD CONSTRAINT upload_batches_folder_type_check
  CHECK (folder_type IN ('raw_material','customer_folder','selection'));
