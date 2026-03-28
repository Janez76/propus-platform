-- Migration 028: Express 24h auf fixed + Bedingungen umstellen
-- Beibehaltung bestehender price/meta-Werte; alte package/addon-Felder werden ersetzt

UPDATE pricing_rules pr
SET rule_type = 'fixed',
    config_json = (
      (pr.config_json - 'requireAnyPackageCodes' - 'requireAnyAddonCodes')
      || jsonb_build_object(
        'price', COALESCE(pr.config_json->'price', '0'::jsonb),
        'requireAnyProductCodes', '["bestseller","fullview"]'::jsonb,
        'requireAnyGroupKeys', '["camera","dronePhoto","tour","floorplans"]'::jsonb
      )
    )
FROM products p
WHERE pr.product_id = p.id
  AND p.code = 'express:24h'
  AND pr.rule_type IN ('conditional', 'fixed')
  AND (
    NOT (pr.config_json ? 'requireAnyProductCodes')
    OR pr.config_json ? 'requireAnyPackageCodes'
    OR pr.config_json ? 'requireAnyAddonCodes'
    OR pr.rule_type = 'conditional'
  );
