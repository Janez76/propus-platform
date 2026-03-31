-- Set default descriptions for existing service categories that have no description yet.
-- These match the previously hardcoded i18n values displayed in the booking frontend.
UPDATE service_categories
SET description = 'Professionelle HDR-Immobilienfotos, bearbeitet und geliefert in Web- & Fullsize.',
    updated_at  = NOW()
WHERE key = 'camera' AND COALESCE(TRIM(description), '') = '';

UPDATE service_categories
SET description = 'Luftaufnahmen per Drohne für eindrucksvolle Aussenansichten.',
    updated_at  = NOW()
WHERE key = 'dronePhoto' AND COALESCE(TRIM(description), '') = '';

UPDATE service_categories
SET description = 'Interaktive 360°-Rundgänge — Preis je nach Wohnfläche.',
    updated_at  = NOW()
WHERE key = 'tour' AND COALESCE(TRIM(description), '') = '';

UPDATE service_categories
SET description = 'Maßstabgetreue 2D-Grundrisse nach Tour-Daten oder eigener Skizze.',
    updated_at  = NOW()
WHERE key = 'floorplans' AND COALESCE(TRIM(description), '') = '';

UPDATE service_categories
SET description = 'Professioneller Videoclip mit Innen- & Aussenaufnahmen, inkl. Schnitt & Musik.',
    updated_at  = NOW()
WHERE key = 'groundVideo' AND COALESCE(TRIM(description), '') = '';

UPDATE service_categories
SET description = 'Cineastische Drohnenaufnahmen als Reel oder Clip, fertig geschnitten.',
    updated_at  = NOW()
WHERE key = 'droneVideo' AND COALESCE(TRIM(description), '') = '';

UPDATE service_categories
SET description = 'Virtuelles Home-Staging — leere Räume digital möbliert.',
    updated_at  = NOW()
WHERE key = 'staging' AND COALESCE(TRIM(description), '') = '';

UPDATE service_categories
SET description = 'Expresslieferung innerhalb von 24 h für ausgewählte Leistungen.',
    updated_at  = NOW()
WHERE key = 'express' AND COALESCE(TRIM(description), '') = '';
