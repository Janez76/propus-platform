-- Migration 060: Bookkeeper-Feedback-Tabelle
--
-- Speichert Korrekturen, die User an KI-Extraktionen vornehmen — wird vom
-- generate_few_shot.py-Skript ausgewertet, um Few-Shot-Beispiele in die
-- Cascade-Prompts (prompts/extractor.txt) einzuweben.
--
-- Quelle der Werte: PATCH /api/admin/bookkeeper/feedback aus der Admin-UI.

CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.bookkeeper_feedback (
  id            BIGSERIAL PRIMARY KEY,
  doc_id        INTEGER       NOT NULL,
  field_id      INTEGER       NOT NULL,             -- Paperless Custom-Field-ID (2..18)
  field_name    VARCHAR(40),                        -- belegart, lieferant, soll_konto, ...
  original_value TEXT,                              -- KI-Output (für Few-Shot-Lerntag)
  corrected_value TEXT,                             -- User-Korrektur
  reason        VARCHAR(200),                       -- optional: warum
  user_id       UUID,                               -- wer korrigierte (admin user id)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_to_prompt BOOLEAN  NOT NULL DEFAULT FALSE -- vom Generator-Skript gesetzt
);

CREATE INDEX IF NOT EXISTS bookkeeper_feedback_doc_idx     ON core.bookkeeper_feedback (doc_id);
CREATE INDEX IF NOT EXISTS bookkeeper_feedback_field_idx   ON core.bookkeeper_feedback (field_id);
CREATE INDEX IF NOT EXISTS bookkeeper_feedback_unapplied_idx ON core.bookkeeper_feedback (created_at) WHERE applied_to_prompt = FALSE;
