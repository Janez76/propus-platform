-- Migration 072: Backfill Anfahrtszonen in bestehenden Bestellungen
-- Schema-robust: fuegt nur das travel:zone-* Addon in services.addons ein.
-- Preis-Neuberechnung erfolgt ueber den wiederholbaren Admin-Endpoint
-- /api/admin/orders/backfill-travel-zones.

DO $$
DECLARE
  v_order RECORD;
  v_zip TEXT;
  v_canton TEXT;
  v_zone_product TEXT;
  v_zone_label TEXT;
  v_addons JSONB;
  v_new_addon JSONB;
BEGIN
  FOR v_order IN
    SELECT o.order_no,
           o.services,
           o.billing,
           COALESCE((o.billing->>'zipcity'), (o.billing->>'zip_city'), (o.billing->>'zip'), '') AS billing_zip_raw
      FROM orders o
     WHERE NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(COALESCE(o.services->'addons', '[]'::jsonb)) AS addon
        WHERE addon->>'id' LIKE 'travel:zone-%'
           OR addon->>'labelKey' LIKE 'travel:zone-%'
     )
  LOOP
    v_zip := SPLIT_PART(TRIM(v_order.billing_zip_raw), ' ', 1);
    IF v_zip = '' THEN
      CONTINUE;
    END IF;

    -- PLZ -> Kanton (vereinfachtes statisches Mapping inkl. Sonderfaelle)
    v_canton := CASE
      WHEN v_zip ~ '^94|^95' THEN 'SG_RHEINTAL'
      WHEN v_zip ~ '^75|^76' THEN 'GR_ENGADIN'
      WHEN v_zip ~ '^8[0-4]|^85[0-6]|^5[0-4]|^63|^64' THEN 'ZONE_A'
      WHEN v_zip ~ '^6[0-2]|^88|^87|^9[0-3]' THEN 'ZONE_B'
      WHEN v_zip ~ '^3|^4|^17|^16|^68|^70|^71|^72|^73|^74' THEN 'ZONE_C'
      ELSE 'ZONE_D'
    END;

    v_zone_product := CASE
      WHEN v_canton = 'ZONE_A' THEN 'travel:zone-a'
      WHEN v_canton IN ('ZONE_B') THEN 'travel:zone-b'
      WHEN v_canton IN ('ZONE_C', 'SG_RHEINTAL') THEN 'travel:zone-c'
      WHEN v_canton IN ('ZONE_D', 'GR_ENGADIN') THEN 'travel:zone-d'
      ELSE 'travel:zone-a'
    END;

    v_zone_label := CASE v_zone_product
      WHEN 'travel:zone-a' THEN 'Anfahrt Zone A (inkl.)'
      WHEN 'travel:zone-b' THEN 'Anfahrt Zone B'
      WHEN 'travel:zone-c' THEN 'Anfahrt Zone C'
      WHEN 'travel:zone-d' THEN 'Anfahrt Zone D'
      ELSE 'Anfahrt Zone'
    END;

    v_addons := COALESCE(v_order.services->'addons', '[]'::jsonb);
    v_new_addon := jsonb_build_object(
      'id', v_zone_product,
      'group', 'travel_zone',
      'label', v_zone_label,
      'labelKey', v_zone_product
    );

    UPDATE orders
       SET services = jsonb_set(
             COALESCE(services, '{}'::jsonb),
             '{addons}',
             (v_addons || v_new_addon)
           )
     WHERE order_no = v_order.order_no;
  END LOOP;
END $$;