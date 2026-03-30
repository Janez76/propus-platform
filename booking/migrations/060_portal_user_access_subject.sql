-- RBAC: portal_user Subjekttyp für E-Mail-basierte Portal-Sync (Tour-Manager / Kunden-Admin ohne Kontakt-Zeile)

ALTER TABLE access_subjects DROP CONSTRAINT IF EXISTS access_subjects_one_fk;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'access_subjects'::regclass
      AND conname = 'access_subjects_subject_type_check'
  ) THEN
    ALTER TABLE access_subjects DROP CONSTRAINT access_subjects_subject_type_check;
  END IF;
END $$;

ALTER TABLE access_subjects ADD COLUMN IF NOT EXISTS portal_user_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_subjects_portal_user_email_lower
  ON access_subjects (LOWER(portal_user_email))
  WHERE portal_user_email IS NOT NULL AND trim(portal_user_email) <> '';

ALTER TABLE access_subjects ADD CONSTRAINT access_subjects_subject_type_check CHECK (
  subject_type IN (
    'admin_user',
    'photographer',
    'customer',
    'customer_contact',
    'company_member',
    'portal_user'
  )
);

ALTER TABLE access_subjects ADD CONSTRAINT access_subjects_one_fk CHECK (
  (CASE WHEN admin_user_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN photographer_key IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN customer_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN customer_contact_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN company_member_id IS NOT NULL THEN 1 ELSE 0 END
 + CASE WHEN portal_user_email IS NOT NULL AND trim(portal_user_email) <> '' THEN 1 ELSE 0 END) = 1
);
