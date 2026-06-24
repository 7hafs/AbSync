-- ============================================================================
-- Phase 1 (v2 — corrected for live database): Organisation Foundation
-- ============================================================================
-- CORRECTED for Rork Auth (user_id() instead of auth.uid()) and text-type profile IDs.
--
-- Live DB facts:
--   - profiles.id = text (NOT uuid)
--   - All entity user_id columns = text
--   - organisations.id = uuid
--   - organisation_members and organisation_invitations do NOT exist yet
--
-- Changes vs original:
--   1. owner_id: uuid → text (profiles.id is text)
--   2. organisation_members.user_id: uuid → text
--   3. Backfill uses text-compatible values throughout
-- ============================================================================

BEGIN;

-- ── 1. Extend organisations ─────────────────────────────────────────────────

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS owner_id text REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS settings  jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organisations.owner_id IS 'Profile ID (text) of the organisation owner.';
COMMENT ON COLUMN organisations.settings  IS 'Organisation-wide settings as JSONB.';

-- ── 2. Link profiles to organisations ───────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

COMMENT ON COLUMN profiles.organisation_id IS 'The organisation this user belongs to.';

-- ── 3. Add organisation_id to notification_preferences ──────────────────────
-- (audit_logs.organisation_id already exists in the live DB — skip it)

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

COMMENT ON COLUMN notification_preferences.organisation_id IS 'The organisation context for these notification preferences.';

-- ── 4. Create organisation_members junction table ───────────────────────────
-- user_id is text because profiles.id is text in the live database.

CREATE TABLE IF NOT EXISTS organisation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'staff',
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organisation_id, user_id)
);

COMMENT ON TABLE organisation_members IS 'Junction table linking users to their organisations.';
COMMENT ON COLUMN organisation_members.role IS 'Role within the organisation: owner, manager, or staff.';

-- Enable pgcrypto if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 5. Backfill existing users ──────────────────────────────────────────────
-- One organisation per user who doesn't have one yet. The user becomes owner.
-- entity organisation_id columns on absences, staff_members, etc. already exist
-- in the live DB; we populate them from the user's new organisation.

-- 5a & 5b: Create organisations and link profiles
WITH new_orgs AS (
  INSERT INTO organisations (id, name, slug, owner_id)
  SELECT
    gen_random_uuid(),
    COALESCE(p.name, p.email, 'My Organisation'),
    NULL,
    p.id  -- text, matches owner_id type (text)
  FROM profiles p
  WHERE p.organisation_id IS NULL
  RETURNING id, owner_id
)
UPDATE profiles p
SET organisation_id = no.id
FROM new_orgs no
WHERE p.id = no.owner_id
  AND p.organisation_id IS NULL;

-- 5c: Create owner membership rows
INSERT INTO organisation_members (organisation_id, user_id, role)
SELECT p.organisation_id, p.id, 'owner'
FROM profiles p
WHERE p.organisation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organisation_members om
    WHERE om.organisation_id = p.organisation_id
      AND om.user_id = p.id
  );

-- 5d: Link entity data to the user's organisation
-- Entity tables already have nullable organisation_id columns in the live DB.

UPDATE absences a
SET organisation_id = p.organisation_id
FROM profiles p
WHERE a.user_id = p.id
  AND a.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

UPDATE staff_members s
SET organisation_id = p.organisation_id
FROM profiles p
WHERE s.user_id = p.id
  AND s.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

UPDATE calendar_events ce
SET organisation_id = p.organisation_id
FROM profiles p
WHERE ce.user_id = p.id
  AND ce.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

UPDATE notes n
SET organisation_id = p.organisation_id
FROM profiles p
WHERE n.user_id = p.id
  AND n.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

UPDATE reminders r
SET organisation_id = p.organisation_id
FROM profiles p
WHERE r.user_id = p.id
  AND r.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

-- Departments — deterministic ownership resolution
-- Same logic as original; user_id / profile.id are text — comparisons work fine.

WITH dept_org_stats AS (
  SELECT
    d.id          AS dept_id,
    d.name        AS dept_name,
    p.organisation_id,
    COUNT(*)      AS staff_count,
    MIN(sm.created_at) AS earliest_staff_created
  FROM departments d
  JOIN staff_members sm ON sm.department_id = d.id
  JOIN profiles      p  ON p.id = sm.user_id
  WHERE d.organisation_id IS NULL
    AND p.organisation_id IS NOT NULL
  GROUP BY d.id, d.name, p.organisation_id
),
dept_winner AS (
  SELECT DISTINCT ON (dept_id)
    dept_id,
    dept_name,
    organisation_id AS winner_org_id,
    SUM(staff_count) OVER (PARTITION BY dept_id) AS total_staff,
    COUNT(*) OVER (PARTITION BY dept_id) AS distinct_orgs
  FROM dept_org_stats
  ORDER BY dept_id, staff_count DESC, earliest_staff_created ASC
),
dept_classified AS (
  SELECT
    dept_id,
    dept_name,
    winner_org_id,
    total_staff,
    distinct_orgs,
    CASE
      WHEN distinct_orgs = 1 THEN 'normal'
      ELSE 'fallback'
    END AS assignment_type
  FROM dept_winner
)
UPDATE departments d
SET organisation_id = dc.winner_org_id
FROM dept_classified dc
WHERE d.id = dc.dept_id
  AND d.organisation_id IS NULL;

-- Department migration report (same as original)
DO $$
DECLARE
  r record;
BEGIN
  RAISE NOTICE '━━━ DEPARTMENT MIGRATION REPORT ━━━';
  RAISE NOTICE 'NORMAL (unambiguous ownership):';
  FOR r IN
    WITH dept_org_stats AS (
      SELECT
        d.id          AS dept_id,
        d.name        AS dept_name,
        p.organisation_id,
        COUNT(*)      AS staff_count,
        MIN(sm.created_at) AS earliest_staff_created
      FROM departments d
      JOIN staff_members sm ON sm.department_id = d.id
      JOIN profiles      p  ON p.id = sm.user_id
      WHERE p.organisation_id IS NOT NULL
      GROUP BY d.id, d.name, p.organisation_id
    ),
    dept_winner AS (
      SELECT DISTINCT ON (dept_id)
        dept_id,
        dept_name,
        organisation_id AS winner_org_id,
        SUM(staff_count) OVER (PARTITION BY dept_id) AS total_staff,
        COUNT(*) OVER (PARTITION BY dept_id) AS distinct_orgs
      FROM dept_org_stats
      ORDER BY dept_id, staff_count DESC, earliest_staff_created ASC
    )
    SELECT dw.dept_id, dw.dept_name, dw.total_staff, dw.winner_org_id
    FROM dept_winner dw
    JOIN departments d ON d.id = dw.dept_id
    WHERE dw.distinct_orgs = 1
      AND d.organisation_id IS NOT NULL
    ORDER BY dw.dept_name
  LOOP
    RAISE NOTICE '  [NORMAL] dept=%, id=%, staff=%, org=%',
      r.dept_name, r.dept_id, r.total_staff, r.winner_org_id;
  END LOOP;

  RAISE NOTICE 'FALLBACK (ambiguous → assigned to majority/earliest org):';
  FOR r IN
    WITH dept_org_stats AS (
      SELECT
        d.id          AS dept_id,
        d.name        AS dept_name,
        p.organisation_id,
        COUNT(*)      AS staff_count,
        MIN(sm.created_at) AS earliest_staff_created
      FROM departments d
      JOIN staff_members sm ON sm.department_id = d.id
      JOIN profiles      p  ON p.id = sm.user_id
      WHERE p.organisation_id IS NOT NULL
      GROUP BY d.id, d.name, p.organisation_id
    ),
    dept_winner AS (
      SELECT DISTINCT ON (dept_id)
        dept_id,
        dept_name,
        organisation_id AS winner_org_id,
        SUM(staff_count) OVER (PARTITION BY dept_id) AS total_staff,
        COUNT(*) OVER (PARTITION BY dept_id) AS distinct_orgs
      FROM dept_org_stats
      ORDER BY dept_id, staff_count DESC, earliest_staff_created ASC
    )
    SELECT dw.dept_id, dw.dept_name, dw.total_staff, dw.distinct_orgs, dw.winner_org_id
    FROM dept_winner dw
    JOIN departments d ON d.id = dw.dept_id
    WHERE dw.distinct_orgs > 1
      AND d.organisation_id IS NOT NULL
    ORDER BY dw.dept_name
  LOOP
    RAISE NOTICE '  [FALLBACK] dept=%, id=%, staff=% across % orgs → assigned org=%',
      r.dept_name, r.dept_id, r.total_staff, r.distinct_orgs, r.winner_org_id;
  END LOOP;

  RAISE NOTICE 'MANUAL REVIEW (no staff members — left unassigned):';
  FOR r IN
    SELECT d.id AS dept_id, d.name AS dept_name
    FROM departments d
    WHERE d.organisation_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM staff_members sm WHERE sm.department_id = d.id
      )
    ORDER BY d.name
  LOOP
    RAISE NOTICE '  [MANUAL_REVIEW] dept=%, id=%',
      r.dept_name, r.dept_id;
  END LOOP;
  RAISE NOTICE '━━━ END DEPARTMENT REPORT ━━━';
END $$;

-- Audit logs and notification preferences backfill
UPDATE audit_logs al
SET organisation_id = p.organisation_id
FROM profiles p
WHERE al.user_id = p.id
  AND al.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

UPDATE notification_preferences np
SET organisation_id = p.organisation_id
FROM profiles p
WHERE np.user_id = p.id
  AND np.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

COMMIT;
