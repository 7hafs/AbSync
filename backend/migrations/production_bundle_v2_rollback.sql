-- ============================================================================
-- ROLLBACK for production_bundle_v2.sql
-- ============================================================================
-- Reverses all 7 steps in reverse order. Run this ONLY if the main migration
-- failed mid-way and left the database in an inconsistent state, or if you
-- need to revert the migration for testing.
--
-- WARNING: This drops organisation_members and organisation_invitations tables,
-- which destroys any membership/invitation data created after the migration.
-- Entity data (absences, staff, etc.) retains its organisation_id but
-- RLS policies are dropped so data remains accessible.
-- ============================================================================

BEGIN;

RAISE NOTICE 'Rolling back production_bundle_v2...';

-- ── Reverse Step 7: Fix Member Insert RLS ────────────────────────────────────
DROP POLICY IF EXISTS "org_members_insert_self" ON organisation_members;
DROP POLICY IF EXISTS "org_members_insert_managed" ON organisation_members;
-- Re-create the original combined policy so invite flow still works if we stop here
DROP POLICY IF EXISTS "org_members_insert" ON organisation_members;
CREATE POLICY "org_members_insert" ON organisation_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND (
      EXISTS (SELECT 1 FROM public.organisations WHERE id = organisation_id AND owner_id = user_id())
      OR EXISTS (SELECT 1 FROM public.organisation_invitations WHERE organisation_id = organisation_members.organisation_id AND email = public.get_user_email() AND status = 'pending')
      OR public.can_manage_org(organisation_id)
    )
  );

-- ── Reverse Step 6: Workspace Mode ───────────────────────────────────────────
-- Note: we do NOT drop the column to avoid data loss. Users who had workspace_mode
-- set during the migration keep it. If you want to fully revert, uncomment below:
-- ALTER TABLE profiles DROP COLUMN IF EXISTS workspace_mode;

-- ── Reverse Step 5: Accept Invitation RPC ────────────────────────────────────
DROP FUNCTION IF EXISTS public.accept_invitation_rpc(text, text, text);

-- ── Reverse Step 4: Clear Profile Trigger ────────────────────────────────────
DROP TRIGGER IF EXISTS clear_profile_on_member_delete ON organisation_members;
DROP FUNCTION IF EXISTS public.clear_profile_on_member_delete();

-- ── Reverse Step 3: RLS Policies ─────────────────────────────────────────────
-- Drop all RLS policies (they'll be recreated if migration is re-run)
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Drop helper functions
DROP FUNCTION IF EXISTS public.get_user_organisation_id();
DROP FUNCTION IF EXISTS public.is_member_of_org(uuid);
DROP FUNCTION IF EXISTS public.can_manage_org(uuid);
DROP FUNCTION IF EXISTS public.is_org_owner(uuid);
DROP FUNCTION IF EXISTS public.get_user_email();

-- ── Reverse Step 2: Organisation Invitations ─────────────────────────────────
DROP TABLE IF EXISTS organisation_invitations CASCADE;

-- ── Reverse Step 1: Organisation Foundation ──────────────────────────────────
DROP TABLE IF EXISTS organisation_members CASCADE;

-- Drop columns added by migration 001 (use IF EXISTS to be safe)
ALTER TABLE organisations DROP COLUMN IF EXISTS owner_id;
ALTER TABLE organisations DROP COLUMN IF EXISTS settings;
ALTER TABLE profiles DROP COLUMN IF EXISTS organisation_id;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS organisation_id;

-- Note: organisation_id columns on entity tables (absences, staff_members, etc.)
-- existed BEFORE migration 001 — we do NOT drop them.

RAISE NOTICE 'Rollback complete.';

COMMIT;
