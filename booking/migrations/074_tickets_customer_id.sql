-- 074_tickets_customer_id.sql
-- Erweiterung des Ticket-Systems: Direkte Kunden-Zuweisung
-- Tickets können nun direkt einem Kunden zugewiesen werden,
-- unabhängig von reference_type/reference_id (Tour oder Bestellung).

ALTER TABLE tour_manager.tickets
  ADD COLUMN IF NOT EXISTS customer_id INTEGER
    REFERENCES core.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_customer
  ON tour_manager.tickets(customer_id);
