-- Migration 071: Zonen-basierte Anfahrtspauschalen als Katalog-Produkte
-- Zone A (ZH/AG/ZG) = inklusive, Zone B = 89 CHF, Zone C = 149 CHF, Zone D = 199 CHF

-- Produkte anlegen (kind=addon, group_key=travel_zone, show_on_website=false)
INSERT INTO products (code, name, kind, group_key, category_key, sort_order, active, show_on_website, affects_travel, affects_duration, duration_minutes, description)
VALUES
  ('travel:zone-a', 'Anfahrt Zone A (inkl.)', 'addon', 'travel_zone', 'travel_zone', 900, TRUE, FALSE, FALSE, FALSE, 0, 'Zürich, Aargau, Zug — inklusive'),
  ('travel:zone-b', 'Anfahrt Zone B', 'addon', 'travel_zone', 'travel_zone', 901, TRUE, FALSE, FALSE, FALSE, 0, 'Luzern, Schwyz, Schaffhausen, Thurgau, Glarus, St. Gallen, Appenzell'),
  ('travel:zone-c', 'Anfahrt Zone C', 'addon', 'travel_zone', 'travel_zone', 902, TRUE, FALSE, FALSE, FALSE, 0, 'Bern, Basel, Solothurn, Freiburg, St. Gallen Rheintal, Graubünden Chur, Nid-/Obwalden, Uri'),
  ('travel:zone-d', 'Anfahrt Zone D', 'addon', 'travel_zone', 'travel_zone', 903, TRUE, FALSE, FALSE, FALSE, 0, 'Graubünden Engadin, Tessin, Wallis, Waadt, Neuenburg, Jura, Genf')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  kind = EXCLUDED.kind,
  group_key = EXCLUDED.group_key,
  category_key = EXCLUDED.category_key,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  show_on_website = EXCLUDED.show_on_website,
  description = EXCLUDED.description;

-- Preisregeln (rule_type=fixed) für jedes Zonen-Produkt
INSERT INTO product_rules (product_id, rule_type, config_json, active, priority)
SELECT p.id, 'fixed', '{"price": 0}'::jsonb, TRUE, 1
FROM products p WHERE p.code = 'travel:zone-a'
ON CONFLICT DO NOTHING;

INSERT INTO product_rules (product_id, rule_type, config_json, active, priority)
SELECT p.id, 'fixed', '{"price": 89}'::jsonb, TRUE, 1
FROM products p WHERE p.code = 'travel:zone-b'
ON CONFLICT DO NOTHING;

INSERT INTO product_rules (product_id, rule_type, config_json, active, priority)
SELECT p.id, 'fixed', '{"price": 149}'::jsonb, TRUE, 1
FROM products p WHERE p.code = 'travel:zone-c'
ON CONFLICT DO NOTHING;

INSERT INTO product_rules (product_id, rule_type, config_json, active, priority)
SELECT p.id, 'fixed', '{"price": 199}'::jsonb, TRUE, 1
FROM products p WHERE p.code = 'travel:zone-d'
ON CONFLICT DO NOTHING;

-- Zonen-Mapping als App-Setting
INSERT INTO app_settings (key, value_json, updated_at)
VALUES (
  'travel.zoneMapping',
  '{
    "default": "travel:zone-a",
    "cantons": {
      "ZH": "travel:zone-a", "AG": "travel:zone-a", "ZG": "travel:zone-a",
      "LU": "travel:zone-b", "SZ": "travel:zone-b", "SH": "travel:zone-b",
      "TG": "travel:zone-b", "GL": "travel:zone-b", "AR": "travel:zone-b",
      "AI": "travel:zone-b", "SG": "travel:zone-b",
      "BE": "travel:zone-c", "BS": "travel:zone-c", "BL": "travel:zone-c",
      "SO": "travel:zone-c", "FR": "travel:zone-c", "NW": "travel:zone-c",
      "OW": "travel:zone-c", "UR": "travel:zone-c",
      "GR": "travel:zone-c",
      "TI": "travel:zone-d", "VS": "travel:zone-d", "VD": "travel:zone-d",
      "NE": "travel:zone-d", "JU": "travel:zone-d", "GE": "travel:zone-d"
    },
    "zipOverrides": [
      {"pattern": "^94|^95", "canton": "SG", "product": "travel:zone-c"},
      {"pattern": "^70", "canton": "GR", "product": "travel:zone-c"},
      {"pattern": "^75|^76", "canton": "GR", "product": "travel:zone-d"}
    ]
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = NOW();
