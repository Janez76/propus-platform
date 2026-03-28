-- Mitarbeiter: individuelle Wochenarbeitszeiten pro Tag
ALTER TABLE photographer_settings
  ADD COLUMN IF NOT EXISTS work_hours_by_day JSONB;

-- Bestehende Drohnen-Skills auf die neuen Felder abbilden
UPDATE photographer_settings
SET skills = skills
  || jsonb_build_object('drohne_foto', COALESCE((skills->>'drohne_foto')::int, (skills->>'drohne')::int, 0))
  || jsonb_build_object('drohne_video', COALESCE((skills->>'drohne_video')::int, 0))
WHERE skills ? 'drohne'
   OR skills ? 'drohne_foto'
   OR skills ? 'drohne_video';

-- Bestehende global/legacy Produkt-Skills auf neue required_skills umbiegen
UPDATE products
SET required_skills = (
  SELECT COALESCE(jsonb_agg(mapped.skill), '[]'::jsonb)
  FROM (
    SELECT DISTINCT
      CASE
        WHEN skill = 'drohne' THEN 'drohne_foto'
        WHEN skill = 'dronephoto' THEN 'drohne_foto'
        WHEN skill = 'dronevideo' THEN 'drohne_foto'
        ELSE skill
      END AS skill
    FROM jsonb_array_elements_text(required_skills) AS skills(skill)
    UNION
    SELECT 'drohne_video'
    WHERE required_skills @> '["dronevideo"]'::jsonb
  ) AS mapped
)
WHERE required_skills IS NOT NULL;
