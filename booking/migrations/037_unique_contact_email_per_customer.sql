-- Schritt 1: Bestehende Duplikate bereinigen.
-- Bei mehreren Kontakten mit gleicher E-Mail + customer_id wird der älteste (kleinste id) behalten.
DELETE FROM customer_contacts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY customer_id, LOWER(TRIM(email))
             ORDER BY id ASC
           ) AS rn
    FROM customer_contacts
    WHERE TRIM(email) <> ''
  ) ranked
  WHERE rn > 1
);

-- Schritt 2: Partiellen Unique-Index anlegen.
-- Verhindert künftig zwei Kontakte mit gleicher E-Mail beim selben Kunden (case-insensitiv).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_contacts_email_per_customer
  ON customer_contacts (customer_id, LOWER(TRIM(email)))
  WHERE TRIM(email) <> '';
