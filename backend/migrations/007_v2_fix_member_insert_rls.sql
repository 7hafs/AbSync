-- ============================================================================
-- Phase 7 (v2 — corrected for live database): Fix org_members_insert RLS policy
-- ============================================================================
-- CORRECTED: auth.uid() → user_id() everywhere.
--
-- The original combined policy required user_id = auth.uid() for ALL paths,
-- which made the can_manage_org() management branch unreachable.
--
-- Fix: split into two policies:
--   1. org_members_insert_self   — user inserts their OWN membership
--      (bootstrap + invitation acceptance, where user_id = user_id())
--   2. org_members_insert_managed — owner/manager inserts a membership for
--      SOMEONE ELSE (management, where user_id may differ from user_id())
--
-- Must run AFTER 003 (helper functions and initial policies must exist).
-- ============================================================================

BEGIN;

-- ── Drop the broken combined policy ──────────────────────────────────────────

DROP POLICY IF EXISTS "org_members_insert" ON organisation_members;

-- ── Policy 1: Self-insert (bootstrap + invitation acceptance) ────────────────

CREATE POLICY "org_members_insert_self" ON organisation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND (
      -- Bootstrap: user is the owner of the org (just created it)
      EXISTS (
        SELECT 1 FROM public.organisations
        WHERE id = organisation_id AND owner_id = user_id()
      )
      OR
      -- Invitation acceptance: a pending invitation exists for this user's email
      EXISTS (
        SELECT 1 FROM public.organisation_invitations
        WHERE organisation_id = organisation_members.organisation_id
          AND email = public.get_user_email()
          AND status = 'pending'
      )
    )
  );

COMMENT ON POLICY "org_members_insert_self" ON organisation_members IS
  'Users can insert their own membership: (a) as owner of a newly-created org, or (b) via a pending invitation.';

-- ── Policy 2: Managed insert (owner/manager adds someone else) ───────────────

CREATE POLICY "org_members_insert_managed" ON organisation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_org(organisation_id)
    AND user_id IS NOT NULL
  );

COMMENT ON POLICY "org_members_insert_managed" ON organisation_members IS
  'Owners and managers can add members to their organisation. The new member''s user_id does not need to match user_id().';

-- ── Validation ───────────────────────────────────────────────────────────────

DO $$
DECLARE
  policy_count integer;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'organisation_members'
    AND cmd = 'INSERT';

  RAISE NOTICE '━━━ INSERT POLICIES ON organisation_members ━━━';
  RAISE NOTICE 'Policy count: % (expected: 2 — self + managed)', policy_count;
END $$;

COMMIT;
