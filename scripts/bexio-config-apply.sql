-- bexio kb_order Konfiguration für propus-bookkeeper.
-- Anwenden auf der Prod-DB (gleiche, in der orders-Tabelle liegt).
--
-- Nutzung:
--   psql "$DATABASE_URL" -f scripts/bexio-config-apply.sql
-- oder im VPS-Container:
--   docker exec -i <postgres-container> psql -U $POSTGRES_USER -d $POSTGRES_DB \
--     < scripts/bexio-config-apply.sql
--
-- Idempotent: re-run überschreibt nur den Konfig-Wert, keine Daten.

\set ON_ERROR_STOP on
BEGIN;

-- ─── 1) Migrationen, falls noch nicht eingespielt ───────────────────────────
\i booking/migrations/090_orders_bexio_status.sql
\i booking/migrations/091_customers_bexio_contact_id.sql

-- ─── 2) bexio-Runtime-Config in app_settings setzen ─────────────────────────
-- IDs ermittelt via scripts/bexio-lookup-defaults.js am 2026-05-06:
--   bankAccountId = 1   (UBS Propus, einziges Bankkonto)
--   vatTaxId      = 17  (opted_sales_tax_205.303 / 8.10% — CH ESTV Code 205/303)
--   paymentTypeId = 4   (Rechnung — bexio kennt keine "14 Tage netto"-payment_type;
--                        die Frist wird via footerTemplate auf das Dokument geschrieben)

INSERT INTO app_settings (key, value_json, updated_at) VALUES (
  'integration.bexio.config',
  $$
  {
    "userId": 1,
    "ownerId": 1,
    "currencyId": 1,
    "languageId": 1,
    "paymentTypeId": 4,
    "bankAccountId": 1,
    "vatTaxId": 17,
    "mwstType": 0,
    "mwstIsNet": true,
    "headerTemplate": "{{address}} #{{orderNo}}",
    "footerTemplate": "Zahlbar innert 14 Tagen netto, ohne Abzug."
  }
  $$::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE
   SET value_json = EXCLUDED.value_json,
       updated_at = NOW();

-- ─── 3) Verifikation ─────────────────────────────────────────────────────────
SELECT key, value_json, updated_at
  FROM app_settings
 WHERE key = 'integration.bexio.config';

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'orders'
   AND column_name LIKE 'bexio_%'
 ORDER BY column_name;

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'customers'
   AND column_name = 'bexio_contact_id';

COMMIT;
