-- Einmalig: Kontakt 89 in 69 zusammenführen (gleicher Kunde).
-- Behält id 69, übernimmt fehlende Felder von 89, löscht 89.
-- Fehlt eine Zeile oder unterschiedlicher customer_id: kein Daten-Update (nur NOTICE).

DO $$
DECLARE
  r69 customer_contacts%ROWTYPE;
  r89 customer_contacts%ROWTYPE;
BEGIN
  SELECT * INTO r69 FROM customer_contacts WHERE id = 69;
  IF NOT FOUND THEN
    RAISE NOTICE '038_merge_customer_contacts_69_89: id 69 nicht gefunden – übersprungen.';
    RETURN;
  END IF;

  SELECT * INTO r89 FROM customer_contacts WHERE id = 89;
  IF NOT FOUND THEN
    RAISE NOTICE '038_merge_customer_contacts_69_89: id 89 nicht gefunden – bereits zusammengeführt oder gelöscht.';
    RETURN;
  END IF;

  IF r69.customer_id IS DISTINCT FROM r89.customer_id THEN
    RAISE EXCEPTION
      '038_merge_customer_contacts_69_89: customer_id unterschiedlich (69→%, 89→%). Bitte zuerst dieselbe Firma zuordnen.',
      r69.customer_id,
      r89.customer_id;
  END IF;

  UPDATE customer_contacts u
  SET
    name = COALESCE(NULLIF(TRIM(u.name), ''), NULLIF(TRIM(o.name), ''), ''),
    role = COALESCE(NULLIF(TRIM(u.role), ''), NULLIF(TRIM(o.role), ''), ''),
    phone = COALESCE(NULLIF(TRIM(u.phone), ''), NULLIF(TRIM(o.phone), ''), ''),
    email = COALESCE(NULLIF(TRIM(u.email), ''), NULLIF(TRIM(o.email), ''), ''),
    sort_order = LEAST(COALESCE(u.sort_order, 0), COALESCE(o.sort_order, 0)),
    salutation = COALESCE(NULLIF(TRIM(u.salutation), ''), NULLIF(TRIM(o.salutation), ''), ''),
    first_name = COALESCE(NULLIF(TRIM(u.first_name), ''), NULLIF(TRIM(o.first_name), ''), ''),
    last_name = COALESCE(NULLIF(TRIM(u.last_name), ''), NULLIF(TRIM(o.last_name), ''), ''),
    phone_mobile = COALESCE(NULLIF(TRIM(u.phone_mobile), ''), NULLIF(TRIM(o.phone_mobile), ''), ''),
    department = COALESCE(NULLIF(TRIM(u.department), ''), NULLIF(TRIM(o.department), ''), '')
  FROM customer_contacts o
  WHERE u.id = 69 AND o.id = 89;

  DELETE FROM customer_contacts WHERE id = 89;

  RAISE NOTICE '038_merge_customer_contacts_69_89: Kontakt 89 in 69 gemerged, 89 gelöscht.';
END $$;
