-- Migration 025: MwSt-Rate und Grundriss-Preis in booking.app_settings / pricing_rules
-- Stellt sicher, dass vat_rate (8.1% CH MwSt) und der floorplan-Preis gesetzt sind.

-- MwSt-Rate: 8.1% (Schweizer Normalsatz, gültig ab 2024)
INSERT INTO booking.app_settings (key, value_json, updated_at)
VALUES ('vat_rate', '0.081'::jsonb, NOW())
ON CONFLICT (key) DO UPDATE
  SET value_json = EXCLUDED.value_json,
      updated_at  = NOW()
  WHERE booking.app_settings.value_json = '0'::jsonb
     OR booking.app_settings.value_json = 'null'::jsonb;

-- Grundriss-Preis sicherstellen (falls noch nicht vorhanden)
-- Produkt floorplans:tour muss existieren
DO $$
DECLARE
  v_product_id BIGINT;
BEGIN
  SELECT id INTO v_product_id
  FROM booking.products
  WHERE code = 'floorplans:tour'
  LIMIT 1;

  IF v_product_id IS NOT NULL THEN
    -- Preis-Regel setzen, falls noch keine aktive per_floor-Regel existiert
    INSERT INTO booking.pricing_rules (product_id, rule_type, config_json, active, priority)
    SELECT v_product_id, 'per_floor', '{"unitPrice": 49}'::jsonb, TRUE, 10
    WHERE NOT EXISTS (
      SELECT 1 FROM booking.pricing_rules
      WHERE product_id = v_product_id
        AND rule_type = 'per_floor'
        AND active = TRUE
    );
  END IF;
END;
$$;
