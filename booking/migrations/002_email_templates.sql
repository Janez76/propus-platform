-- Migration 002: E-Mail-Template-System
-- Erstellt die Tabellen email_templates und email_template_history (idempotent).

-- Haupt-Tabelle
CREATE TABLE IF NOT EXISTS email_templates (
  id           SERIAL PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,   -- z.B. 'provisional_created', 'confirmed_customer'
  label        TEXT NOT NULL DEFAULT '',
  subject      TEXT NOT NULL DEFAULT '',
  body_html    TEXT NOT NULL DEFAULT '',
  body_text    TEXT NOT NULL DEFAULT '',
  placeholders JSONB NOT NULL DEFAULT '[]',  -- Dokumentation der Platzhalter
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_key ON email_templates(key);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(active);

-- Versionshistorie fuer Rollback
CREATE TABLE IF NOT EXISTS email_template_history (
  id          BIGSERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  subject     TEXT NOT NULL DEFAULT '',
  body_html   TEXT NOT NULL DEFAULT '',
  body_text   TEXT NOT NULL DEFAULT '',
  changed_by  TEXT NOT NULL DEFAULT 'system',
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_tmpl_history_tmpl_id
  ON email_template_history(template_id, changed_at DESC);

-- Idempotenz-Log fuer gesendete Mails (verhindert Doppelversand bei Job-Retries)
CREATE TABLE IF NOT EXISTS email_send_log (
  id           BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,   -- z.B. '<orderNo>_<template_key>_<recipientHash>'
  order_no     INTEGER,
  template_key TEXT NOT NULL,
  recipient    TEXT NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_send_log_order ON email_send_log(order_no, template_key);
CREATE INDEX IF NOT EXISTS idx_email_send_log_key   ON email_send_log(idempotency_key);
