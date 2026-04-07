-- Migration 072: Backfill Anfahrtszonen in bestehenden Bestellungen
-- Diese Migration fuegt rückwirkend das Zonen-Addon in bestehende Orders ein,
-- die noch kein travel:zone-* Addon enthalten.
-- Die Zonen-Zuordnung basiert auf einem statischen PLZ-zu-Kanton-Mapping
-- (da app_settings nicht direkt in SQL auswertbar).
--
-- Hinweis: Der Admin-Endpoint POST /api/admin/orders/backfill-travel-zones
-- nutzt das aktuelle dynamische Mapping aus app_settings und sollte bevorzugt
-- verwendet werden. Diese Migration dient als einmalige, reproduzierbare DB-Änderung.

-- Schritt 1: Hilfsfunktion – PLZ-Prefix zu Kanton (Schweiz)
-- Wird als CTE inline genutzt, keine persistente Funktion nötig.

DO $$
DECLARE
  v_order RECORD;
  v_zip   TEXT;
  v_canton TEXT;
  v_zone_product TEXT;
  v_zone_price NUMERIC;
  v_zone_label TEXT;
  v_addons JSONB;
  v_new_addon JSONB;
  v_has_zone BOOLEAN;
  v_subtotal NUMERIC;
  v_discount NUMERIC;
  v_vat_rate NUMERIC;
  v_vat_base NUMERIC;
  v_new_vat NUMERIC;
  v_new_total NUMERIC;
BEGIN
  -- VAT-Rate aus app_settings lesen (Fallback: 0.081)
  SELECT COALESCE((value_json #>> '{}')::NUMERIC, 0.081)
    INTO v_vat_rate
    FROM app_settings
   WHERE key = 'pricing.vatRate'
   LIMIT 1;
  IF v_vat_rate IS NULL OR v_vat_rate <= 0 THEN
    v_vat_rate := 0.081;
  END IF;

  FOR v_order IN
    SELECT o.order_no,
           o.services,
           o.billing,
           COALESCE(o.services->>'zip', '') AS order_zip,
           COALESCE((o.billing->>'zipcity'), (o.billing->>'zip_city'), (o.billing->>'zip'), '') AS billing_zip_raw,
           COALESCE((o.pricing->>'subtotal')::NUMERIC, (o.subtotal)::NUMERIC, 0) AS subtotal_val,
           COALESCE((o.pricing->>'discount')::NUMERIC, (o.discount)::NUMERIC, 0) AS discount_val
      FROM orders o
     WHERE NOT EXISTS (
       SELECT 1
         FROM jsonb_array_elements(COALESCE(o.services->'addons', '[]'::jsonb)) AS addon
        WHERE addon->>'id' LIKE 'travel:zone-%'
           OR addon->>'labelKey' LIKE 'travel:zone-%'
     )
  LOOP
    -- PLZ extrahieren (erstes Token aus zipcity)
    v_zip := SPLIT_PART(TRIM(v_order.billing_zip_raw), ' ', 1);
    IF v_zip = '' THEN
      v_zip := TRIM(v_order.order_zip);
    END IF;

    IF v_zip = '' THEN
      CONTINUE; -- Keine PLZ vorhanden, überspringen
    END IF;

    -- PLZ → Kanton → Zone (statisches Mapping)
    v_canton := CASE
      -- Zone A (inkl.): ZH, AG, ZG
      WHEN v_zip ~ '^8[0-4]' THEN 'ZH'
      WHEN v_zip ~ '^85[0-6]' THEN 'ZH'
      WHEN v_zip ~ '^5[0-4]' THEN 'AG'
      WHEN v_zip ~ '^6[34]' THEN 'ZG'
      -- Zone B: LU, SZ, SH, TG, GL, AR, AI, SG (ohne Rheintal/Engadin)
      WHEN v_zip ~ '^6[0-2]' THEN 'LU'
      WHEN v_zip ~ '^88[0-8]' THEN 'SZ'
      WHEN v_zip ~ '^889' THEN 'SZ'
      WHEN v_zip ~ '^8[23]' AND v_zip::INTEGER >= 8200 AND v_zip::INTEGER <= 8260 THEN 'SH'
      WHEN v_zip ~ '^87[0-9]' THEN 'TG'
      WHEN v_zip ~ '^886[0-9]' THEN 'GL'
      WHEN v_zip ~ '^906[0-9]' THEN 'AR'
      WHEN v_zip ~ '^90[578]' THEN 'AI'
      WHEN v_zip ~ '^9[012][0-9]' THEN 'SG'
      -- Zone B special: SG (ohne Rheintal)
      WHEN v_zip ~ '^93[0-9]' THEN 'SG'
      -- Zone C special override: SG Rheintal (94xx, 95xx) → Zone C
      WHEN v_zip ~ '^9[45]' THEN 'SG_RHEINTAL'
      -- Zone C: BE, BS, BL, SO, FR, NW, OW, UR, GR (ohne Engadin)
      WHEN v_zip ~ '^3[0-9]' THEN 'BE'
      WHEN v_zip ~ '^40[0-9]' THEN 'BS'
      WHEN v_zip ~ '^41[0-9]' THEN 'BS'
      WHEN v_zip ~ '^42[0-9]' THEN 'BL'
      WHEN v_zip ~ '^43[0-9]' THEN 'BL'
      WHEN v_zip ~ '^44[0-9]' THEN 'SO'
      WHEN v_zip ~ '^45[0-9]' THEN 'SO'
      WHEN v_zip ~ '^17[0-9]' THEN 'FR'
      WHEN v_zip ~ '^16[0-9]' THEN 'FR'
      WHEN v_zip ~ '^63[0-9]' THEN 'NW'
      WHEN v_zip ~ '^62[4-9]' THEN 'NW'
      WHEN v_zip ~ '^64[0-9]' THEN 'OW'
      WHEN v_zip ~ '^68[0-9]' THEN 'UR'
      WHEN v_zip ~ '^70[0-9]' THEN 'GR'
      WHEN v_zip ~ '^71[0-9]' THEN 'GR'
      WHEN v_zip ~ '^72[0-9]' THEN 'GR'
      WHEN v_zip ~ '^73[0-9]' THEN 'GR'
      WHEN v_zip ~ '^74[0-9]' THEN 'GR'
      -- Zone D special override: GR Engadin (75xx, 76xx) → Zone D
      WHEN v_zip ~ '^7[56]' THEN 'GR_ENGADIN'
      -- Zone D: TI, VS, VD, NE, JU, GE
      WHEN v_zip ~ '^65[0-9]' THEN 'TI'
      WHEN v_zip ~ '^66[0-9]' THEN 'TI'
      WHEN v_zip ~ '^67[0-9]' THEN 'TI'
      WHEN v_zip ~ '^69[0-9]' THEN 'TI'
      WHEN v_zip ~ '^19[0-9]' THEN 'VS'
      WHEN v_zip ~ '^18[0-9]' THEN 'VS'
      WHEN v_zip ~ '^1[0-4][0-9]' THEN 'VD'
      WHEN v_zip ~ '^20[0-9]' THEN 'NE'
      WHEN v_zip ~ '^21[0-9]' THEN 'NE'
      WHEN v_zip ~ '^23[0-9]' THEN 'JU'
      WHEN v_zip ~ '^12[0-9]' THEN 'GE'
      WHEN v_zip ~ '^11[0-9]' THEN 'GE'
      ELSE 'ZH' -- Default: Zone A
    END;

    -- Zone-Produkt bestimmen
    v_zone_product := CASE
      WHEN v_canton IN ('ZH', 'AG', 'ZG') THEN 'travel:zone-a'
      WHEN v_canton IN ('LU', 'SZ', 'SH', 'TG', 'GL', 'AR', 'AI', 'SG') THEN 'travel:zone-b'
      WHEN v_canton IN ('BE', 'BS', 'BL', 'SO', 'FR', 'NW', 'OW', 'UR', 'GR', 'SG_RHEINTAL') THEN 'travel:zone-c'
      WHEN v_canton IN ('TI', 'VS', 'VD', 'NE', 'JU', 'GE', 'GR_ENGADIN') THEN 'travel:zone-d'
      ELSE 'travel:zone-a'
    END;

    -- Preis aus Produktkatalog lesen
    SELECT COALESCE((pr.config_json->>'price')::NUMERIC, 0),
           COALESCE(p.name, 'Anfahrtszone')
      INTO v_zone_price, v_zone_label
      FROM products p
      JOIN product_rules pr ON pr.product_id = p.id AND (pr.active IS NULL OR pr.active = TRUE)
     WHERE p.code = v_zone_product
     ORDER BY pr.priority DESC NULLS LAST
     LIMIT 1;

    IF v_zone_price IS NULL THEN
      v_zone_price := 0;
    END IF;
    IF v_zone_label IS NULL THEN
      v_zone_label := v_zone_product;
    END IF;

    -- Addon-Array aufbauen
    v_addons := COALESCE(v_order.services->'addons', '[]'::jsonb);
    v_new_addon := jsonb_build_object(
      'id', v_zone_product,
      'group', 'travel_zone',
      'label', v_zone_label,
      'labelKey', v_zone_product
    );
    v_addons := v_addons || v_new_addon;

    -- Preise aktualisieren
    v_subtotal    := ROUND((v_order.subtotal_val + v_zone_price)::NUMERIC, 2);
    v_discount    := v_order.discount_val;
    v_vat_base    := GREATEST(0, v_subtotal - v_discount);
    v_new_vat     := ROUND(v_vat_base * v_vat_rate, 2);
    v_new_total   := ROUND(v_vat_base + v_new_vat, 2);

    -- Order aktualisieren
    UPDATE orders
       SET services = jsonb_set(
             COALESCE(services, '{}'::jsonb),
             '{addons}',
             v_addons
           ),
           subtotal  = v_subtotal,
           vat       = v_new_vat,
           total     = v_new_total,
           updated_at = NOW()
     WHERE order_no = v_order.order_no;

  END LOOP;
END $$;
