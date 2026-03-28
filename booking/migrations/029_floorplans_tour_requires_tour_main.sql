-- Migration 029: 2D Grundriss von Tour nur mit 360° Tour berechnen
-- Beibehaltung bestehender unitPrice/meta-Werte

UPDATE pricing_rules pr
SET config_json = (
  (pr.config_json - 'requireAnyPackageCodes' - 'requireAnyAddonCodes')
  || jsonb_build_object(
    'unitPrice', COALESCE(pr.config_json->'unitPrice', '0'::jsonb),
    'requireAnyProductCodes', '["tour:main"]'::jsonb
  )
)
FROM products p
WHERE pr.product_id = p.id
  AND p.code = 'floorplans:tour'
  AND pr.rule_type = 'per_floor'
  AND (
    NOT (pr.config_json ? 'requireAnyProductCodes')
    OR pr.config_json->'requireAnyProductCodes' <> '["tour:main"]'::jsonb
    OR pr.config_json ? 'requireAnyPackageCodes'
    OR pr.config_json ? 'requireAnyAddonCodes'
  );
