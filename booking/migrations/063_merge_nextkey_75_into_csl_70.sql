-- ═══════════════════════════════════════════════════════════════════════════
-- 063_merge_nextkey_75_into_csl_70.sql
--
-- Nextkey by CSL (Kunden-ID 75) in CSL Immobilien AG (Kunden-ID 70) zusammenführen.
-- Nextkey ist ein Markenname von CSL – Mitarbeiter, Touren und Bestellungen
-- sind identisch. Die Nextkey-E-Mail-Domain wird als Alias bei CSL (70) hinterlegt.
--
-- Sicherheitscheck: Migration wird übersprungen wenn 75 nicht existiert oder
-- 70 nicht existiert (z.B. bereits durchgeführter Merge, andere Umgebung).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_csl       customers%ROWTYPE;
  v_nextkey   customers%ROWTYPE;
  v_new_aliases TEXT[];
BEGIN
  SELECT * INTO v_csl FROM customers WHERE id = 70;
  IF NOT FOUND THEN
    RAISE NOTICE '063_merge_nextkey_75_into_csl_70: CSL (id=70) nicht gefunden – übersprungen.';
    RETURN;
  END IF;

  SELECT * INTO v_nextkey FROM customers WHERE id = 75;
  IF NOT FOUND THEN
    RAISE NOTICE '063_merge_nextkey_75_into_csl_70: Nextkey (id=75) nicht gefunden – bereits zusammengeführt oder gelöscht.';
    RETURN;
  END IF;

  -- Bestellungen
  UPDATE orders SET customer_id = 70 WHERE customer_id = 75;

  -- Kontakte
  UPDATE customer_contacts SET customer_id = 70 WHERE customer_id = 75;

  -- Companies
  UPDATE companies SET billing_customer_id = 70 WHERE billing_customer_id = 75;

  -- Company Members: Duplikate entfernen, Rest umhängen
  DELETE FROM company_members cm
  USING company_members ck
  WHERE cm.customer_id = 75
    AND ck.customer_id = 70
    AND ck.company_id = cm.company_id;

  UPDATE company_members SET customer_id = 70, updated_at = NOW() WHERE customer_id = 75;

  -- Permission Groups
  UPDATE permission_groups SET scope_customer_id = 70, updated_at = NOW() WHERE scope_customer_id = 75;
  UPDATE subject_permission_overrides SET scope_customer_id = 70 WHERE scope_customer_id = 75;

  -- RBAC / Portal
  BEGIN
    UPDATE tour_manager.portal_users SET core_customer_id = 70 WHERE core_customer_id = 75;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  -- Sessions / Auth bereinigen
  DELETE FROM access_subjects WHERE customer_id = 75;
  DELETE FROM customer_sessions WHERE customer_id = 75;
  DELETE FROM customer_email_verifications WHERE customer_id = 75;
  DELETE FROM customer_password_resets WHERE customer_id = 75;

  -- E-Mail-Alias der Nextkey-E-Mail bei CSL hinterlegen
  v_new_aliases := ARRAY(
    SELECT DISTINCT LOWER(TRIM(e))
    FROM unnest(
      COALESCE(v_csl.email_aliases, '{}')
      || COALESCE(v_nextkey.email_aliases, '{}')
      || ARRAY[LOWER(TRIM(v_nextkey.email))]
    ) AS e
    WHERE LOWER(TRIM(e)) <> ''
      AND LOWER(TRIM(e)) <> LOWER(TRIM(v_csl.email))
  );

  UPDATE customers
  SET
    email_aliases = v_new_aliases,
    notes = COALESCE(NULLIF(TRIM(notes), ''), '') ||
            E'\n\n--- Zusammengeführt (aufgelöster Kunde ID 75 / Nextkey) ---' ||
            CASE WHEN LOWER(TRIM(v_nextkey.email)) <> LOWER(TRIM(v_csl.email))
              THEN E'\nE-Mail des aufgelösten Kunden: ' || LOWER(TRIM(v_nextkey.email))
              ELSE ''
            END,
    updated_at = NOW()
  WHERE id = 70;

  -- Nextkey-Datensatz löschen
  DELETE FROM customers WHERE id = 75;

  RAISE NOTICE '063_merge_nextkey_75_into_csl_70: Nextkey (75) erfolgreich in CSL (70) zusammengeführt. Aliases: %', v_new_aliases;
END $$;
