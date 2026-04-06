-- ═══════════════════════════════════════════════════════════════════════════
-- 035_fix_bank_import_sequences.sql
-- Synchronisiert die BIGSERIAL-Sequenzen der bank_import Tabellen mit dem
-- tatsaechlichen MAX(id), um duplicate key Fehler zu beheben.
-- ═══════════════════════════════════════════════════════════════════════════

SET search_path TO tour_manager, public;

SELECT setval(
  pg_get_serial_sequence('tour_manager.bank_import_runs', 'id'),
  COALESCE((SELECT MAX(id) FROM tour_manager.bank_import_runs), 0) + 1,
  false
);

SELECT setval(
  pg_get_serial_sequence('tour_manager.bank_import_transactions', 'id'),
  COALESCE((SELECT MAX(id) FROM tour_manager.bank_import_transactions), 0) + 1,
  false
);
