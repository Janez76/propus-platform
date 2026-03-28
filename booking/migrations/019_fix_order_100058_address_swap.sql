-- Migration 019:
-- Bestellung #100058: Objektadresse und Kunden-/Rechnungsadresse waren vertauscht.
-- Ziel:
--   - orders.address (Objektadresse) <- bisherige billing.street + billing.zipcity
--   - orders.billing.street/zipcity (Kundenadresse) <- Kundenstammadresse (Fallback: aus alter address geparst)
--
-- Diese Migration ist bewusst auf order_no = 100058 begrenzt.

DO $$
DECLARE
  rec RECORD;
  old_address TEXT;
  old_billing_street TEXT;
  old_billing_zipcity TEXT;
  customer_street TEXT;
  customer_zipcity TEXT;
  parsed_street TEXT;
  parsed_zipcity TEXT;
  new_object_address TEXT;
  new_billing_street TEXT;
  new_billing_zipcity TEXT;
BEGIN
  SELECT
    o.order_no,
    o.address,
    o.billing,
    c.street AS c_street,
    c.zipcity AS c_zipcity
  INTO rec
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE o.order_no = 100058
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  old_address := COALESCE(rec.address, '');
  old_billing_street := COALESCE(rec.billing->>'street', '');
  old_billing_zipcity := COALESCE(rec.billing->>'zipcity', '');
  customer_street := COALESCE(rec.c_street, '');
  customer_zipcity := COALESCE(rec.c_zipcity, '');

  -- Fallback: alte Objektadresse in street/zipcity aufteilen
  parsed_zipcity := COALESCE(SUBSTRING(old_address FROM '(\d{4,5}\s+.+)$'), '');
  IF parsed_zipcity <> '' THEN
    parsed_street := BTRIM(REGEXP_REPLACE(old_address, '\s*,?\s*\d{4,5}\s+.+$', '', ''));
  ELSE
    parsed_street := BTRIM(old_address);
  END IF;

  -- Objektadresse aus bisheriger Billing-Adresse zusammensetzen
  new_object_address := BTRIM(CONCAT_WS(' ', NULLIF(old_billing_street, ''), NULLIF(old_billing_zipcity, '')));
  IF new_object_address = '' THEN
    new_object_address := old_address;
  END IF;

  -- Billing auf Kundenstammadresse setzen (Fallback auf geparste alte address)
  new_billing_street := COALESCE(NULLIF(customer_street, ''), NULLIF(parsed_street, ''), old_billing_street);
  new_billing_zipcity := COALESCE(NULLIF(customer_zipcity, ''), NULLIF(parsed_zipcity, ''), old_billing_zipcity);

  UPDATE orders
  SET
    address = new_object_address,
    billing = jsonb_set(
      jsonb_set(
        COALESCE(billing, '{}'::jsonb),
        '{street}',
        to_jsonb(COALESCE(new_billing_street, ''))
      ),
      '{zipcity}',
      to_jsonb(COALESCE(new_billing_zipcity, ''))
    ),
    updated_at = NOW()
  WHERE order_no = 100058;
END $$;

