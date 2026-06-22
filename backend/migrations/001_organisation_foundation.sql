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

-- Departments
UPDATE departments d
SET organisation_id = p.organisation_id
FROM profiles p
-- Departments don't have user_id; link via staff_members' departments or just
-- assign all departments to any org. This is a best-effort link.
-- For now, link departments used by the user's staff members.
WHERE d.organisation_id IS NULL
  AND EXISTS (
    SELECT 1 FROM staff_members sm
    WHERE sm.department_id = d.id
      AND sm.user_id = p.id
  );

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

-- ── Optional: backfill departments that are still unlinked ──────────────────
-- If any departments remain unlinked after the user-based backfill,
-- assign them to the first organisation (edge case for orphaned data).
DO $$
DECLARE
  fallback_org_id uuid;
BEGIN
  SELECT id INTO fallback_org_id FROM organisations ORDER BY created_at LIMIT 1;
  IF fallback_org_id IS NOT NULL THEN
    UPDATE departments
    SET organisation_id = fallback_org_id
    WHERE organisation_id IS NULL;
  END IF;
END $$;

COMMIT;
