-- Migration 073: Fehlende Preisregeln fuer Travel-Zone-Produkte nachtraglich einfuegen
-- (071 hat product_rules gesucht, aber die Tabelle heisst pricing_rules)
SET search_path TO booking;

INSERT INTO pricing_rules (product_id, rule_type, config_json, active, priority)
SELECT p.id, 'fixed', '{"price": 0}'::jsonb, TRUE, 1
FROM products p WHERE p.code = 'travel:zone-a'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (product_id, rule_type, config_json, active, priority)
SELECT p.id, 'fixed', '{"price": 89}'::jsonb, TRUE, 1
FROM products p WHERE p.code = 'travel:zone-b'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (product_id, rule_type, config_json, active, priority)
SELECT p.id, 'fixed', '{"price": 149}'::jsonb, TRUE, 1
FROM products p WHERE p.code = 'travel:zone-c'
ON CONFLICT DO NOTHING;

INSERT INTO pricing_rules (product_id, rule_type, config_json, active, priority)
SELECT p.id, 'fixed', '{"price": 199}'::jsonb, TRUE, 1
FROM products p WHERE p.code = 'travel:zone-d'
ON CONFLICT DO NOTHING;
