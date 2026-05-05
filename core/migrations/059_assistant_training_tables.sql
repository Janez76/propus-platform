-- 059_assistant_training_tables.sql — Trainer-Chat & Live-Training für Propus Assistant
-- Few-Shots, Negativ-Beispiele, Prompt-Versionen und Eval-Run-Historie. Alles aus
-- der UI heraus pflegbar — Code-FEW_SHOTS in few-shot-examples.ts dient nur noch
-- als Default-Seed für leere DBs.
SET search_path TO tour_manager, core, booking, public;

-- ─────────────────────────────────────────────────────────────────────────────
-- Few-Shots (positiv): kuratierte Beispiel-Antworten für system-prompt
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_few_shots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                 TEXT NOT NULL UNIQUE,            -- stabiler Key (z. B. "typo-search")
  user_message         TEXT NOT NULL,
  assistant_tool_plan  TEXT NOT NULL,
  assistant_final      TEXT NOT NULL,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  source               TEXT NOT NULL CHECK (source IN ('seed', 'admin_ui', 'trainer_chat', 'feedback_thumb')),
  created_by           TEXT,                            -- admin email
  source_conversation  UUID REFERENCES tour_manager.assistant_conversations(id) ON DELETE SET NULL,
  source_message       UUID REFERENCES tour_manager.assistant_messages(id) ON DELETE SET NULL,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_few_shots_active
  ON tour_manager.assistant_few_shots(is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_few_shots_tags
  ON tour_manager.assistant_few_shots USING GIN (tags);

-- ─────────────────────────────────────────────────────────────────────────────
-- Negativ-Beispiele: "so NICHT antworten" — fließen als Anti-Pattern in den Prompt
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_negative_examples (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_message         TEXT NOT NULL,
  bad_response         TEXT NOT NULL,
  why_bad              TEXT NOT NULL,                   -- kurze Begründung vom Trainer
  better_hint          TEXT,                            -- optional: was wäre richtig
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  source               TEXT NOT NULL CHECK (source IN ('admin_ui', 'trainer_chat', 'feedback_thumb')),
  created_by           TEXT,
  source_conversation  UUID REFERENCES tour_manager.assistant_conversations(id) ON DELETE SET NULL,
  source_message       UUID REFERENCES tour_manager.assistant_messages(id) ON DELETE SET NULL,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_negative_active
  ON tour_manager.assistant_negative_examples(is_active, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Prompt-Versionen: jede Trainer-Änderung am System-Prompt landet hier (Diff + Grund)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_prompt_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       INTEGER NOT NULL,                       -- monoton steigend
  body          TEXT NOT NULL,                          -- vollständiger Prompt-Body (Code-Default beim ersten Eintrag)
  changelog     TEXT NOT NULL,                          -- "Regel 4 verschärft: send_email darf nicht abgelehnt werden"
  diff_summary  TEXT,                                   -- kurzer Mensch-lesbarer Diff
  created_by    TEXT,
  source        TEXT NOT NULL CHECK (source IN ('seed', 'trainer_chat', 'admin_ui', 'auto_tuner')),
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_prompt_versions_version
  ON tour_manager.assistant_prompt_versions(version);

-- Genau eine aktive Prompt-Version. Partial Unique Index sichert das.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_prompt_versions_one_active
  ON tour_manager.assistant_prompt_versions((1)) WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Eval-Runs: jede Eval-Ausführung mit Ergebnis pro Case → Trend, Sparkline, Detail
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_eval_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at         TIMESTAMPTZ,
  triggered_by        TEXT,                             -- admin email oder 'trainer_chat' / 'auto'
  total_cases         INTEGER NOT NULL DEFAULT 0,
  passed_cases        INTEGER NOT NULL DEFAULT 0,
  total_input_tokens  INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  prompt_version_id   UUID REFERENCES tour_manager.assistant_prompt_versions(id) ON DELETE SET NULL,
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_assistant_eval_runs_recent
  ON tour_manager.assistant_eval_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS tour_manager.assistant_eval_case_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES tour_manager.assistant_eval_runs(id) ON DELETE CASCADE,
  case_id       TEXT NOT NULL,
  passed        BOOLEAN NOT NULL,
  reason        TEXT,
  tools         TEXT[] NOT NULL DEFAULT '{}',
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  final_text    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_eval_case_results_run
  ON tour_manager.assistant_eval_case_results(run_id);

CREATE INDEX IF NOT EXISTS idx_assistant_eval_case_results_case
  ON tour_manager.assistant_eval_case_results(case_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trainer-Audit: jede Aktion der Trainer-KI (revert-fähig)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tour_manager.assistant_trainer_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT NOT NULL,
  action        TEXT NOT NULL,                          -- z. B. "add_few_shot", "update_prompt_section"
  payload       JSONB NOT NULL,                         -- Tool-Input
  result        JSONB,                                  -- Tool-Output (für Revert)
  reverted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assistant_trainer_actions_recent
  ON tour_manager.assistant_trainer_actions(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at trigger für few_shots
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tour_manager.assistant_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assistant_few_shots_touch ON tour_manager.assistant_few_shots;
CREATE TRIGGER trg_assistant_few_shots_touch
BEFORE UPDATE ON tour_manager.assistant_few_shots
FOR EACH ROW
EXECUTE FUNCTION tour_manager.assistant_touch_updated_at();
