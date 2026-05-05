-- Galerie-Modul: Mehrere Videos pro Galerie unterstuetzen
--
-- videos_json speichert ein JSON-Array von { title, url, source_type,
-- source_root_kind, source_path } analog zu floor_plans_json. Die alten
-- video_*-Spalten bleiben fuer Rueckwaerts-Kompatibilitaet bestehen und werden
-- mit dem ersten Element aus videos_json gespiegelt.

ALTER TABLE tour_manager.galleries
  ADD COLUMN IF NOT EXISTS videos_json TEXT;
