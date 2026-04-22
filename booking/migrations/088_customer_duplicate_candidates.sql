-- Warteschlange für wahrscheinliche Kundendubletten (manuell merge/dismiss)
SET search_path TO booking, core, public;

CREATE TABLE IF NOT EXISTS booking.customer_duplicate_candidates (
  id                    bigserial primary key,
  new_customer_id        integer not null,
  suspected_keep_id      integer not null,
  score                 double precision,
  reason                 text not null default '',
  status                 text not null default 'open',
  created_at             timestamptz not null default now(),
  CONSTRAINT book_customer_dup_candidates_status_chk
    CHECK (status IN ('open','merged','dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_dup_candidates_pair
  ON booking.customer_duplicate_candidates (new_customer_id, suspected_keep_id);

CREATE INDEX IF NOT EXISTS idx_customer_dup_candidates_status
  ON booking.customer_duplicate_candidates (status)
  WHERE status = 'open';

DO $$
BEGIN
  IF to_regclass('core.customers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'book_dup_cand_new_fk'
     ) THEN
    ALTER TABLE booking.customer_duplicate_candidates
      ADD CONSTRAINT book_dup_cand_new_fk
      FOREIGN KEY (new_customer_id) REFERENCES core.customers (id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'book_dup_cand_new_fk skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF to_regclass('core.customers') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'book_dup_cand_sus_fk'
     ) THEN
    ALTER TABLE booking.customer_duplicate_candidates
      ADD CONSTRAINT book_dup_cand_sus_fk
      FOREIGN KEY (suspected_keep_id) REFERENCES core.customers (id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'book_dup_cand_sus_fk skipped: %', SQLERRM;
END $$;
