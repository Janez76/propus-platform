-- Galerie-Modul: Verknuepfung mit Kunde, Kontakt und Bestellung

ALTER TABLE tour_manager.galleries
  ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES core.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_contact_id INTEGER REFERENCES core.customer_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_order_no INTEGER REFERENCES booking.orders(order_no) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_contact TEXT;

CREATE INDEX IF NOT EXISTS idx_galleries_customer_id
  ON tour_manager.galleries (customer_id)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_galleries_customer_contact_id
  ON tour_manager.galleries (customer_contact_id)
  WHERE customer_contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_galleries_booking_order_no
  ON tour_manager.galleries (booking_order_no)
  WHERE booking_order_no IS NOT NULL;
