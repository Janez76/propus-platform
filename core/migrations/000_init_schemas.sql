-- Wird beim allerersten postgres-Start via docker-entrypoint-initdb.d ausgeführt.
-- Erstellt die drei Schemas falls sie noch nicht existieren.

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS booking;
CREATE SCHEMA IF NOT EXISTS tour_manager;
