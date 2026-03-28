-- Migration 020: Acanta AG Duplikat (ID 83) in Kunde 64 zusammenführen
-- Stammdaten von Kunde 64 bleiben unverändert.
-- Bestellungen und Kontakte von 83 werden auf 64 umgestellt, danach 83 entfernt.

-- Bestellungen: customer_id 83 → 64
UPDATE orders SET customer_id = 64 WHERE customer_id = 83;

-- Kontakte: customer_id 83 → 64
UPDATE customer_contacts SET customer_id = 64 WHERE customer_id = 83;

-- Sessions/Token für 83 aufräumen
DELETE FROM customer_sessions WHERE customer_id = 83;
DELETE FROM customer_email_verifications WHERE customer_id = 83;
DELETE FROM customer_password_resets WHERE customer_id = 83;

-- Duplikat 83 löschen
DELETE FROM customers WHERE id = 83;
