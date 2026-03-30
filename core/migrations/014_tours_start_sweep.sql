-- Optionaler Matterport-Start-Scan (URL-Parameter ts=) für Tour-Detail / „Tour öffnen“
ALTER TABLE tour_manager.tours ADD COLUMN IF NOT EXISTS matterport_start_sweep TEXT;
