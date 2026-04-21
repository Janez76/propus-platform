-- Fügt in gespeicherten E-Mail-Templates (tour_manager.settings, key email_templates)
-- Platzhalter für die Matterport-Objektadresse ein, falls noch nicht vorhanden.
-- HTML: nach {{objectLabel}} in Summary-Zellen (wie buildSummaryCard)
-- Text: nach "Objekt: {{objectLabel}}"

DO $$
DECLARE
  raw JSONB;
  tpl_key TEXT;
  v JSONB;
  nh TEXT;
  nt TEXT;
  new_val JSONB := '{}'::jsonb;
BEGIN
  SELECT s.value INTO raw
  FROM tour_manager.settings s
  WHERE s.key = 'email_templates'
  LIMIT 1;

  IF raw IS NULL OR jsonb_typeof(raw) != 'object' THEN
    RETURN;
  END IF;

  FOR tpl_key, v IN SELECT * FROM jsonb_each(raw)
  LOOP
    nh := COALESCE(v->>'html', '');
    nt := COALESCE(v->>'text', '');

    IF position('{{objectAddressHtmlLine}}' IN nh) = 0 AND position('{{objectLabel}}' IN nh) > 0 THEN
      nh := replace(
        nh,
        'line-height:1.6;">{{objectLabel}}</td>',
        'line-height:1.6;">{{objectLabel}}{{objectAddressHtmlLine}}</td>'
      );
      IF position('{{objectAddressHtmlLine}}' IN nh) = 0 THEN
        nh := replace(nh, '>{{objectLabel}}</td>', '>{{objectLabel}}{{objectAddressHtmlLine}}</td>');
      END IF;
    END IF;

    -- Nur einfügen, wenn direkt nach {{objectLabel}} noch nicht {{objectAddressTextLine}} steht (idempotent)
    IF position('{{objectAddressTextLine}}' IN nt) = 0 AND position('Objekt: {{objectLabel}}' IN nt) > 0 THEN
      nt := regexp_replace(
        nt,
        'Objekt: \{\{objectLabel\}\}(?!\{\{objectAddressTextLine\}\})',
        'Objekt: {{objectLabel}}{{objectAddressTextLine}}',
        'g'
      );
    END IF;

    new_val := new_val || jsonb_build_object(
      tpl_key,
      jsonb_set(jsonb_set(v, '{html}', to_jsonb(nh)), '{text}', to_jsonb(nt))
    );
  END LOOP;

  UPDATE tour_manager.settings
  SET value = new_val,
      updated_at = NOW()
  WHERE key = 'email_templates';
END $$;
