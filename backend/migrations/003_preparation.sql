-- ============================================================================
-- Phase 3B: Pre-RLS Preparation
-- ============================================================================
-- Run BEFORE enabling RLS to guarantee every row has organisation_id populated.
--
-- 1. Backfill NULL organisation_id values in audit_logs.
--    Each audit_logs row links to profiles via user_id — we can look up the
--    user's organisation_id from there. Rows where the user has no org
--    (orphaned profile, deleted org) are flagged but cannot be repaired.
--
-- 2. Harden organisation_invitations:
--    Add an index on (token, email) so the RLS policy that checks both
--    columns runs efficiently even under concurrent load.
--
-- 3. Verify no entity rows have NULL organisation_id after backfill.
--    If any remain, the script RAISEs a WARNING so the operator knows
--    before enabling RLS.
-- ============================================================================

BEGIN;

-- ── 1. Backfill audit_logs.organisation_id ───────────────────────────────────

WITH backfilled AS (
  UPDATE audit_logs al
  SET organisation_id = p.organisation_id
  FROM profiles p
  WHERE al.user_id = p.id
    AND al.organisation_id IS NULL
    AND p.organisation_id IS NOT NULL
  RETURNING al.id
)
SELECT count(*) AS audit_logs_backfilled FROM backfilled;

-- Report any audit_logs rows that remain NULL (user has no organisation)
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT count(*) INTO orphan_count
  FROM audit_logs
  WHERE organisation_id IS NULL;

  IF orphan_count > 0 THEN
    RAISE WARNING '[003_preparation] % audit_logs rows still have NULL organisation_id — these belong to users without an organisation. They will be invisible under RLS.', orphan_count;
  ELSE
    RAISE NOTICE '[003_preparation] All audit_logs rows have non-NULL organisation_id.';
  END IF;
END $$;

-- ── 2. Harden organisation_invitations for token-based access ────────────────
--
-- The RLS policy for non-members checks both token AND email match.
-- Create a composite index to support this query pattern efficiently.

CREATE INDEX IF NOT EXISTS idx_invitations_token_email
  ON organisation_invitations(token, email)
  WHERE status = 'pending';

COMMENT ON INDEX idx_invitations_token_email IS 'Supports RLS policy: non-members can only read invitations matching their token + email.';

-- ── 3. Verify all entity tables have no NULL organisation_id ─────────────────

DO $$
DECLARE
  tbl record;
  null_count integer;
  total_tables integer := 0;
  clean_tables  integer := 0;
BEGIN
  RAISE NOTICE '━━━ PRE-RLS organisation_id NULL CHECK ━━━';

  FOR tbl IN
    VALUES
      ('absences'),
      ('staff_members'),
      ('calendar_events'),
      ('notes'),
      ('reminders'),
      ('departments'),
      ('notification_preferences'),
      ('organisation_invitations'),
      ('organisation_members'),
      ('organisations'),
      ('profiles'),
      ('audit_logs')
  LOOP
    total_tables := total_tables + 1;
    EXECUTE format('SELECT count(*) FROM %I WHERE organisation_id IS NULL', tbl.column1) INTO null_count;

    IF null_count > 0 THEN
      -- audit_logs NULLs are expected for orphaned-user rows (reported above)
      -- organisations never have NULL (it's their PK)
      -- profiles can legitimately have NULL organisation_id (repair path not yet run)
      IF tbl.column1 IN ('audit_logs', 'profiles', 'organisations') THEN
        RAISE NOTICE '  [EXPECTED] %: % rows with NULL organisation_id', tbl.column1, null_count;
      ELSE
        RAISE WARNING '[003_preparation] %: % rows with NULL organisation_id — this will break under RLS!', tbl.column1, null_count;
      END IF;
    ELSE
      clean_tables := clean_tables + 1;
      RAISE NOTICE '  [CLEAN] %: no NULL organisation_id rows', tbl.column1;
    END IF;
  END LOOP;

  RAISE NOTICE '━━━ RESULT: %/% tables clean ━━━', clean_tables, total_tables;
END $$;

COMMIT;
