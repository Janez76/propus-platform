-- Kontakt 69 in 89 zusammenführen: 89 behalten, Daten von 69 übernehmen, 69 löschen.
-- Fall „038 schon gelaufen“ (nur noch Zeile id 69): id 69 → 89 umnummerieren, Sequenz anpassen.

DO $$
DECLARE
  has69 boolean;
  has89 boolean;
  r69   customer_contacts%ROWTYPE;
  r89   customer_contacts%ROWTYPE;
  seq   text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM customer_contacts WHERE id = 69) INTO has69;
  SELECT EXISTS (SELECT 1 FROM customer_contacts WHERE id = 89) INTO has89;

  IF has69 AND has89 THEN
    SELECT * INTO r69 FROM customer_contacts WHERE id = 69;
    SELECT * INTO r89 FROM customer_contacts WHERE id = 89;
    IF r69.customer_id IS DISTINCT FROM r89.customer_id THEN
      RAISE NOTICE
        '039_merge_keep_89: customer_id unterschiedlich (69→%, 89→%) - Merge uebersprungen.',
        r69.customer_id,
        r89.customer_id;
      RETURN;
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
    WHERE u.id = 89 AND o.id = 69;

    DELETE FROM customer_contacts WHERE id = 69;
    RAISE NOTICE '039_merge_keep_89: Daten von 69 nach 89 übernommen, 69 gelöscht.';
    RETURN;
  END IF;

  IF has69 AND NOT has89 THEN
    UPDATE customer_contacts SET id = 89 WHERE id = 69;
    seq := pg_get_serial_sequence('customer_contacts', 'id');
    IF seq IS NOT NULL THEN
      PERFORM setval(seq, (SELECT COALESCE(MAX(id), 1) FROM customer_contacts), true);
    END IF;
    RAISE NOTICE '039_merge_keep_89: ehemals id 69 auf id 89 umnummeriert (nach vorherigem Merge 038).';
    RETURN;
  END IF;

  IF NOT has69 AND has89 THEN
    RAISE NOTICE '039_merge_keep_89: nur id 89 vorhanden – OK.';
    RETURN;
  END IF;

  RAISE NOTICE '039_merge_keep_89: weder 69 noch 89 – übersprungen.';
END $$;
