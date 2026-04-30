-- 046_assistant_conversation_links.sql — Assistant-Verlauf mit Kunden-/Bestellungs-/Tour-Bezug
SET search_path TO tour_manager, core, booking, public;

ALTER TABLE tour_manager.assistant_conversations
  ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_order_no INTEGER REFERENCES booking.orders(order_no) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tour_id INTEGER REFERENCES tour_manager.tours(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_customer
  ON tour_manager.assistant_conversations(customer_id, updated_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_order
  ON tour_manager.assistant_conversations(booking_order_no, updated_at DESC)
  WHERE booking_order_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_tour
  ON tour_manager.assistant_conversations(tour_id, updated_at DESC)
  WHERE tour_id IS NOT NULL;
