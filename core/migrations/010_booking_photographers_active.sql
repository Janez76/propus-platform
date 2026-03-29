-- ═══════════════════════════════════════════════════════════════════════════
-- 010_booking_photographers_active.sql
-- Ergaenzt booking.photographers um active (vgl. booking/migrations/012).
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE booking.photographers
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
