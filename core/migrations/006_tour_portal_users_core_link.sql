-- Optional: Verknüpfung tour_manager.portal_users mit core.customers für Logto-Migration
-- Führe manuell aus / anpassen, wenn portal_users auf SSO umgestellt wird.

ALTER TABLE tour_manager.portal_users
  ADD COLUMN IF NOT EXISTS core_customer_id INTEGER REFERENCES core.customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portal_users_core_customer_id
  ON tour_manager.portal_users(core_customer_id);

COMMENT ON COLUMN tour_manager.portal_users.core_customer_id IS 'Optional: FK zu core.customers nach SSO-Konsolidierung';
