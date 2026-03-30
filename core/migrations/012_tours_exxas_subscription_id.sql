-- ═══════════════════════════════════════════════════════════════════════════
-- 012_tours_exxas_subscription_id.sql
-- Fügt exxas_subscription_id zu tour_manager.tours hinzu (separates Feld
-- neben exxas_abo_id für neuere Exxas-Vertragsreferenzen).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tour_manager.tours
  ADD COLUMN IF NOT EXISTS exxas_subscription_id TEXT;
