ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by_member_id INTEGER REFERENCES company_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_created_by_member_id ON orders(created_by_member_id) WHERE created_by_member_id IS NOT NULL;
