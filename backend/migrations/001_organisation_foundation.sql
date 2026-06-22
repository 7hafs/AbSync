-- ============================================================================
-- Phase 1: Organisation Foundation
-- ============================================================================
-- Adds multi-tenant scaffolding to the AbSync schema without enabling RLS,
-- role enforcement, or invitations.
--
-- Changes:
--   1. ALTER organisations: add owner_id (UUID FK → profiles) and settings (JSONB)
--   2. ALTER profiles: add organisation_id (UUID FK → organisations)
--   3. ALTER audit_logs: add organisation_id (UUID FK → organisations)
--   4. ALTER notification_preferences: add organisation_id (UUID FK → organisations)
--   5. CREATE organisation_members junction table
--   6. BACKFILL: one organisation per existing user, link all their data
--      Departments use a deterministic ownership rule (most staff → earliest staff).
--      A RAISE NOTICE report is emitted showing normal, fallback, and manual-review assignments.
--
-- Run this migration in a transaction. If any step fails, the entire
-- migration rolls back and the database is unchanged.
-- ============================================================================

BEGIN;

-- ── 1. Extend organisations ─────────────────────────────────────────────────

-- owner_id: who owns this organisation (FK to their profile)
-- settings: org-wide configuration (JSONB so it's flexible and queryable)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS settings  jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organisations.owner_id IS 'Profile ID of the organisation owner.';
COMMENT ON COLUMN organisations.settings  IS 'Organisation-wide settings as JSONB (e.g. approval requirements, working days).';

-- ── 2. Link profiles to organisations ───────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

COMMENT ON COLUMN profiles.organisation_id IS 'The organisation this user belongs to.';

-- ── 3. Add organisation_id to audit_logs ────────────────────────────────────

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

COMMENT ON COLUMN audit_logs.organisation_id IS 'The organisation context of this audit entry.';

-- ── 4. Add organisation_id to notification_preferences ──────────────────────

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

COMMENT ON COLUMN notification_preferences.organisation_id IS 'The organisation context for these notification preferences.';

-- ── 5. Create organisation_members junction table ───────────────────────────

CREATE TABLE IF NOT EXISTS organisation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'staff',
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- One membership row per user per organisation
  UNIQUE (organisation_id, user_id)
);

COMMENT ON TABLE organisation_members IS 'Junction table linking users to their organisations.';
COMMENT ON COLUMN organisation_members.role IS 'Role within the organisation: owner, manager, or staff.';

-- Enable the extension if not already enabled (needed for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── 6. Backfill existing users ──────────────────────────────────────────────
--
-- Strategy: ONE organisation per existing user who doesn't have one yet.
-- The user becomes the owner. All their entity data is linked to the new org.
--
-- Step 6a: Create an organisation for each profile missing one.
-- Step 6b: Set profile.organisation_id and the org's owner_id.
-- Step 6c: Create the organisation_members row (role = owner).
-- Step 6d: Link all user-owned entities to the new organisation.

-- 6a & 6b: Create organisations and link profiles (single upsert per user)
WITH new_orgs AS (
  INSERT INTO organisations (id, name, slug, owner_id)
  SELECT
    gen_random_uuid(),
    COALESCE(p.name, p.email, 'My Organisation'),
    NULL,  -- slugs can be added later
    p.id
  FROM profiles p
  WHERE p.organisation_id IS NULL
  RETURNING id, owner_id
)
UPDATE profiles p
SET organisation_id = no.id
FROM new_orgs no
WHERE p.id = no.owner_id
  AND p.organisation_id IS NULL;

-- 6c: Create owner membership rows
INSERT INTO organisation_members (organisation_id, user_id, role)
SELECT p.organisation_id, p.id, 'owner'
FROM profiles p
WHERE p.organisation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organisation_members om
    WHERE om.organisation_id = p.organisation_id
      AND om.user_id = p.id
  );

-- 6d: Link entity data to the user's organisation
-- Each entity table already has a nullable organisation_id column.
-- We populate it from the owning user's profile.organisation_id.

-- Absences
UPDATE absences a
SET organisation_id = p.organisation_id
FROM profiles p
WHERE a.user_id = p.id
  AND a.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

-- Staff members
UPDATE staff_members s
SET organisation_id = p.organisation_id
FROM profiles p
WHERE s.user_id = p.id
  AND s.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

-- Calendar events
UPDATE calendar_events ce
SET organisation_id = p.organisation_id
FROM profiles p
WHERE ce.user_id = p.id
  AND ce.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

-- Notes
UPDATE notes n
SET organisation_id = p.organisation_id
FROM profiles p
WHERE n.user_id = p.id
  AND n.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

-- Reminders
UPDATE reminders r
SET organisation_id = p.organisation_id
FROM profiles p
WHERE r.user_id = p.id
  AND r.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

-- Departments — deterministic ownership resolution
--
-- Departments have no direct user_id. Ownership is derived from the staff_members
-- that reference the department, via the staff member's user → profile → organisation.
--
-- Resolution rules (fully deterministic, no row-order dependence):
--   1. Gather all (organisation_id, staff_count, earliest_created_at) per department.
--   2. If exactly 1 organisation → NORMAL assignment.
--   3. If 2+ organisations → pick the org with the MOST staff; tie-break on earliest
--      staff member created_at → FALLBACK assignment (logged with ambiguity detail).
--   4. If 0 staff members → leave NULL → MANUAL_REVIEW (logged).
--
-- Step A: Compute per-department organisation stats
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
-- Step B: Per department, pick the winning organisation deterministically
--         (most staff → earliest staff breaks ties). Also compute total staff.
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
-- Step C: Classify each department
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
-- Step D: Apply deterministic assignments (normal + fallback only)
UPDATE departments d
SET organisation_id = dc.winner_org_id
FROM dept_classified dc
WHERE d.id = dc.dept_id
  AND d.organisation_id IS NULL;

-- Step E: Report normal assignments
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
      AND d.organisation_id IS NOT NULL  -- was just assigned (or already assigned)
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
      AND d.organisation_id IS NOT NULL  -- was just assigned via fallback
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

-- Audit logs
UPDATE audit_logs al
SET organisation_id = p.organisation_id
FROM profiles p
WHERE al.user_id = p.id
  AND al.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

-- Notification preferences
UPDATE notification_preferences np
SET organisation_id = p.organisation_id
FROM profiles p
WHERE np.user_id = p.id
  AND np.organisation_id IS NULL
  AND p.organisation_id IS NOT NULL;

COMMIT;
