-- Exxas-ähnliche Struktur: Kunde (Adresse) + Kontakt Felder
-- Kunde: Anrede, Vorname, Adresszusatz, Postfach, PLZ/Ort getrennt, Land, Telefon 2/Mobile/Fax, Website
-- Kontakt: Anrede, Vorname, Nachname, Direkt, Mobile, Abteilung

-- Kunden (customers)
ALTER TABLE customers ADD COLUMN IF NOT EXISTS salutation TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_addon_1 TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_addon_2 TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS address_addon_3 TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS po_box TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS zip TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'Schweiz';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_2 TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_mobile TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_fax TEXT NOT NULL DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '';

-- Kontaktpersonen (customer_contacts)
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS salutation TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS phone_direct TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS phone_mobile TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_contacts ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT '';
