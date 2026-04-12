-- 039: Zahlungen — Payrexx Zahlungslog für Rechnungen
-- Standalone-Tabelle für alle Zahlungsvorgänge.
-- Kann später per FK an eine Dokumente-Tabelle gebunden werden.

CREATE TABLE IF NOT EXISTS core.zahlungen (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dokument_id       UUID,                    -- FK wird ergänzt wenn dokumente-Tabelle existiert
  payrexx_id        INT,
  payrexx_hash      TEXT,
  payrexx_uuid      TEXT,
  status            TEXT NOT NULL DEFAULT 'waiting',
  betrag            NUMERIC(10,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'CHF',
  zahlungsmethode   TEXT,                    -- 'mastercard', 'visa', 'twint', 'paypal' etc.
  referenz          TEXT,                    -- Rechnungsnummer z.B. RE-2026-042
  webhook_payload   JSONB,                   -- roher Webhook für Debugging
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zahlungen_dokument_id ON core.zahlungen(dokument_id);
CREATE INDEX IF NOT EXISTS zahlungen_payrexx_hash ON core.zahlungen(payrexx_hash);
CREATE INDEX IF NOT EXISTS zahlungen_referenz ON core.zahlungen(referenz);
