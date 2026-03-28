-- Migration 030: conditional-Regeln auf fixed umstellen und Constraint bereinigen

UPDATE pricing_rules
SET rule_type = 'fixed'
WHERE rule_type = 'conditional';

ALTER TABLE pricing_rules
  DROP CONSTRAINT IF EXISTS pricing_rules_rule_type_check;

ALTER TABLE pricing_rules
  ADD CONSTRAINT pricing_rules_rule_type_check
  CHECK (rule_type IN ('fixed', 'per_floor', 'per_room', 'area_tier'));
