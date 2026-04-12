-- 038: Finanz-Einstellungen (Finanzen & Dokumente Settings)
-- Zentrale Konfigurationstabelle für Firmendaten, Nummernkreise,
-- Dokumenttypen, Berechtigungen und PDF-Layout.

CREATE TABLE IF NOT EXISTS core.finanz_einstellungen (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Firma
  firmenname            TEXT NOT NULL DEFAULT '',
  uid                   TEXT,
  strasse               TEXT,
  plz_ort               TEXT,
  iban                  TEXT,
  bankname              TEXT,
  email_absender        TEXT,
  telefon               TEXT,

  -- Standards
  mwst_satz             NUMERIC(4,2)  NOT NULL DEFAULT 8.1,
  zahlungsfrist_tage    INT           NOT NULL DEFAULT 30,
  waehrung              TEXT          NOT NULL DEFAULT 'CHF',
  sprache               TEXT          NOT NULL DEFAULT 'de_CH',
  standard_notiz        TEXT,
  standard_fussnote     TEXT,

  -- Nummernkreise (JSON: { typ: { prefix, naechste } })
  nummernkreise JSONB NOT NULL DEFAULT '{
    "offerte":         {"prefix":"OF","naechste":1},
    "auftrag":         {"prefix":"AU","naechste":1},
    "rechnung":        {"prefix":"RE","naechste":1},
    "teilrechnung":    {"prefix":"TR","naechste":1},
    "schlussrechnung": {"prefix":"SR","naechste":1},
    "gutschrift":      {"prefix":"GU","naechste":1}
  }'::jsonb,

  -- Aktive Dokumenttypen
  aktive_typen JSONB NOT NULL DEFAULT '{
    "offerte":true,"auftrag":true,"rechnung":true,
    "teilrechnung":false,"gutschrift":true,"mahnungen":false
  }'::jsonb,

  -- Berechtigungen pro Aktion × Rolle
  berechtigungen JSONB NOT NULL DEFAULT '{
    "offerte_erstellen":    {"admin":true, "fotograf":false},
    "auftrag_erstellen":    {"admin":true, "fotograf":false},
    "rechnung_erstellen":   {"admin":true, "fotograf":false},
    "dokument_versenden":   {"admin":true, "fotograf":false},
    "rabatt_vergeben":      {"admin":true, "fotograf":false},
    "gutschrift_erstellen": {"admin":true, "fotograf":false},
    "einstellungen_aendern":{"admin":false,"fotograf":false}
  }'::jsonb,

  -- PDF Layout
  logo_url              TEXT,
  akzentfarbe           TEXT          NOT NULL DEFAULT '#B68E20',
  qr_code_aktiv         BOOLEAN       NOT NULL DEFAULT true,
  unterschriftsfeld     BOOLEAN       NOT NULL DEFAULT true,
  fotograf_auf_dokument BOOLEAN       NOT NULL DEFAULT false,

  -- Payrexx Online-Zahlung
  payrexx_aktiv         BOOLEAN       NOT NULL DEFAULT false,
  payrexx_twint         BOOLEAN       NOT NULL DEFAULT true,
  payrexx_karte         BOOLEAN       NOT NULL DEFAULT true,
  payrexx_postfinance   BOOLEAN       NOT NULL DEFAULT true,
  payrexx_paypal        BOOLEAN       NOT NULL DEFAULT false,

  -- Meta
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_by            TEXT
);

-- Exakt eine Zeile erzwingen (Singleton-Pattern)
CREATE UNIQUE INDEX IF NOT EXISTS finanz_einstellungen_single
  ON core.finanz_einstellungen ((true));

-- Seed: Default-Zeile einfügen falls leer
INSERT INTO core.finanz_einstellungen (firmenname)
VALUES ('Propus GmbH')
ON CONFLICT DO NOTHING;
