-- company_owner, is_primary_contact; Einladungen gleiche Rollen

ALTER TABLE company_members DROP CONSTRAINT IF EXISTS company_members_role_check;
ALTER TABLE company_members
  ADD CONSTRAINT company_members_role_check
  CHECK (role IN ('company_owner', 'company_admin', 'company_employee'));

ALTER TABLE company_invitations DROP CONSTRAINT IF EXISTS company_invitations_role_check;
ALTER TABLE company_invitations
  ADD CONSTRAINT company_invitations_role_check
  CHECK (role IN ('company_owner', 'company_admin', 'company_employee'));

ALTER TABLE company_members ADD COLUMN IF NOT EXISTS is_primary_contact BOOLEAN NOT NULL DEFAULT FALSE;

-- Billing-Kunde der Firma = Hauptkontakt (Owner), nicht jeden frueheren Admin
UPDATE company_members cm
SET
  role = 'company_owner',
  is_primary_contact = TRUE
FROM companies c
WHERE cm.company_id = c.id
  AND cm.customer_id IS NOT NULL
  AND cm.customer_id = c.billing_customer_id
  AND cm.role = 'company_admin';
