-- 021_tours_booking_order_no.sql – Verknüpfung Tour ↔ Buchung (booking.orders)
ALTER TABLE tour_manager.tours
  ADD COLUMN IF NOT EXISTS booking_order_no INTEGER;

CREATE INDEX IF NOT EXISTS idx_tours_booking_order_no
  ON tour_manager.tours(booking_order_no)
  WHERE booking_order_no IS NOT NULL;
