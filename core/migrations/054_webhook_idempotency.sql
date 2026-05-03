-- ═══════════════════════════════════════════════════════════════════════════
-- 054_webhook_idempotency.sql
--
-- Idempotency-Tabelle fuer eingehende Webhooks (Payrexx initial; spaeter
-- erweiterbar fuer weitere Provider).
--
-- Hintergrund (Bug-Hunt T09 CRITICAL):
--   Der Payrexx-Webhook prueft eine HMAC-Signatur, hat aber keinen
--   Replay-Schutz. Ein gueltiger Webhook-Body kann beliebig oft erneut
--   eingespielt werden. Der eigentliche DB-Update ist heute idempotent
--   (WHERE invoice_status = 'paid' triggert beim 2. Mal 0 Rows), aber
--   logAction(...) und externe Effekte (Matterport-Unarchive) laufen erneut.
--
-- Loesung: Pro empfangenem Webhook eine Zeile per (provider, event_id)
-- einfuegen, beim Insert mit ON CONFLICT DO NOTHING. Nur wenn die
-- Insertion 1 Row trifft, wird der Webhook tatsaechlich verarbeitet.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tour_manager.webhook_events (
  id            BIGSERIAL PRIMARY KEY,
  provider      TEXT        NOT NULL,
  event_id      TEXT        NOT NULL,
  reference_id  TEXT        NULL,
  status        TEXT        NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_sha256 TEXT       NULL,
  CONSTRAINT webhook_events_provider_event_uniq UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at
  ON tour_manager.webhook_events (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_reference_id
  ON tour_manager.webhook_events (reference_id);

COMMENT ON TABLE  tour_manager.webhook_events IS
  'Idempotency-Log fuer eingehende Webhooks (Payrexx, ggf. weitere). UNIQUE (provider, event_id) blockt Replays.';
COMMENT ON COLUMN tour_manager.webhook_events.event_id IS
  'Provider-spezifische Event/Transaction-ID (z.B. transaction[id] bei Payrexx).';
COMMENT ON COLUMN tour_manager.webhook_events.payload_sha256 IS
  'Optionaler SHA256-Hash des Roh-Bodies fuer Forensik / Replay-Detection.';
