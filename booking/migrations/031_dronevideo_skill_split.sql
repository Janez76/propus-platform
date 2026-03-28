-- Migration 031: Skill-Aufteilung Video (Boden) vs Video (Drohne)
-- Drohnenvideo-Produkte benötigen nun den dedizierten Skill "dronevideo" statt "drohne" + "video"

UPDATE products
SET required_skills = '["dronevideo"]'::jsonb
WHERE group_key = 'droneVideo'
  AND required_skills = '["drohne","video"]'::jsonb;
