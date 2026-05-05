-- 060_assistant_self_learning.sql — Self-Learning Schleife für Propus Assistant
-- Implicit-Signal-Erfassung (passiv aus echten Konversationen), Vorschlags-Inbox,
-- Auto-Tune-Run-Historie und Settings (Toggle, Quota, Stop-Loss).
SET search_path TO tour_manager, core, booking, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Implicit Signals: Roh-Signale aus Konversationen ("user korrigiert", "user
-- bedankt sich", "tool 3× erfolglos", …). Werden vom Aggregator zu Suggestions
-- verdichtet — diese Tabelle ist nur das Ledger.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_implicit_signals (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      UUID REFERENCES tour_manager.assistant_conversations(id) ON DELETE CASCADE,
  user_message_id      UUID REFERENCES tour_manager.assistant_messages(id) ON DELETE SET NULL,
  assistant_message_id UUID REFERENCES tour_manager.assistant_messages(id) ON DELETE SET NULL,
  user_id              TEXT NOT NULL,
  signal_type          TEXT NOT NULL CHECK (signal_type IN (
    'thanks',           -- "danke", "passt", "perfekt"
    'correction',       -- "nein, ich meinte…", "falsch"
    'repeat',           -- ähnliche Frage 2× → Antwort hat nicht geholfen
    'topic_shift',      -- abrupt anderes Thema nach Tool-Fehler
    'tool_error_loop',  -- gleiches Tool 3× hintereinander mit error
    'follow_up'         -- Folgefrage zur selben Entität → Antwort war brauchbar
  )),
  polarity             SMALLINT NOT NULL CHECK (polarity IN (-1, 0, 1)),
  confidence           NUMERIC(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  user_message_text    TEXT,
  assistant_text       TEXT,
  evidence             JSONB,                          -- z. B. matched-regex, durations
  processed_at         TIMESTAMPTZ,                    -- vom Aggregator gesetzt
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_implicit_signals_unprocessed
  ON tour_manager.assistant_implicit_signals(created_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_implicit_signals_polarity
  ON tour_manager.assistant_implicit_signals(polarity, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Vorschlags-Inbox: aggregierte Signale → konkrete Empfehlung
-- (z. B. "Speichere dies als Negativ-Beispiel" / "Auto-Tune empfohlen")
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_self_learning_suggestions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                 TEXT NOT NULL CHECK (kind IN (
    'add_few_shot',     -- positives Muster sichtbar
    'add_negative',     -- schlechte Antwort sichtbar
    'tune_prompt',      -- mehrere Failures in einer Kategorie → Prompt-Patch
    'replay_harvest'    -- Drift erkannt → Replay-Refresh empfohlen
  )),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'auto_applied')),
  confidence           NUMERIC(3,2) NOT NULL DEFAULT 0,
  signal_count         INTEGER NOT NULL DEFAULT 1,
  preview              JSONB NOT NULL,                 -- vorgeschlagener Inhalt (user_message, bad_response, why, …)
  supporting_signals   UUID[] NOT NULL DEFAULT '{}',
  reviewed_by          TEXT,
  reviewed_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_self_learning_suggestions_pending
  ON tour_manager.assistant_self_learning_suggestions(status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-Tune-Run-Historie: jeder Nightly-Lauf
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_self_learning_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at          TIMESTAMPTZ,
  trigger              TEXT NOT NULL CHECK (trigger IN ('cron', 'manual', 'webhook')),
  baseline_pass_rate   NUMERIC(4,3),
  candidate_pass_rate  NUMERIC(4,3),
  decision             TEXT CHECK (decision IN ('activated', 'rejected', 'no_change', 'error', 'paused_stop_loss')),
  prompt_version_id    UUID REFERENCES tour_manager.assistant_prompt_versions(id) ON DELETE SET NULL,
  signal_window_hours  INTEGER NOT NULL DEFAULT 24,
  signals_processed    INTEGER NOT NULL DEFAULT 0,
  notes                TEXT,
  error_text           TEXT
);

CREATE INDEX IF NOT EXISTS idx_assistant_self_learning_runs_recent
  ON tour_manager.assistant_self_learning_runs(started_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Settings: zentrale Konfiguration für die Schleife (Singleton-Row)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_self_learning_settings (
  id                          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  implicit_feedback_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  auto_tune_enabled           BOOLEAN NOT NULL DEFAULT FALSE, -- Default OFF, User schaltet ein
  auto_tune_cron              TEXT NOT NULL DEFAULT '0 3 * * *',
  min_signal_confidence       NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  protected_case_ids          TEXT[] NOT NULL DEFAULT ARRAY[
    'smalltalk-greeting', 'german-only', 'email-send',
    'weather-honest', 'routing-honest', 'no-hallu-id'
  ],
  max_auto_activations_24h    INTEGER NOT NULL DEFAULT 1,
  max_auto_activations_7d     INTEGER NOT NULL DEFAULT 3,
  consecutive_failures        INTEGER NOT NULL DEFAULT 0,
  paused_until                TIMESTAMPTZ,
  notify_email                TEXT,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                  TEXT
);

INSERT INTO tour_manager.assistant_self_learning_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
