-- ============================================================================
-- Phase 7: Fix org_members_insert RLS policy
-- ============================================================================
-- The original org_members_insert policy required user_id = auth.uid() for ALL
-- paths, which made the can_manage_org() management branch unreachable.
--
-- An owner calling removeOrganisationMember() → RLS check runs with
-- auth.uid() = owner, but the row's user_id = the removed member.
-- user_id = auth.uid() → FALSE → RLS blocks the insert.
--
-- Fix: split into two policies:
--   1. org_members_insert_self   — user inserts their OWN membership
--      (bootstrap + invitation acceptance, where user_id = auth.uid())
--   2. org_members_insert_managed — owner/manager inserts a membership for
--      SOMEONE ELSE (management, where user_id may differ from auth.uid())
-- ============================================================================

BEGIN;

-- ── Drop the broken combined policy ──────────────────────────────────────────

DROP POLICY IF EXISTS "org_members_insert" ON organisation_members;

-- ── Policy 1: Self-insert (bootstrap + invitation acceptance) ────────────────
-- The inserting user is adding themselves. user_id MUST equal auth.uid().

CREATE POLICY "org_members_insert_self" ON organisation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      -- Bootstrap: user is the owner of the org (just created it)
      EXISTS (
        SELECT 1 FROM public.organisations
        WHERE id = organisation_id AND owner_id = auth.uid()
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
-- The inserting user (auth.uid()) must be an owner or manager of the org.
-- The row's user_id can be any user (not necessarily auth.uid()).
-- The row's role defaults to 'staff' if not specified (app-layer sets it).

CREATE POLICY "org_members_insert_managed" ON organisation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_org(organisation_id)
    AND user_id IS NOT NULL
  );

COMMENT ON POLICY "org_members_insert_managed" ON organisation_members IS
  'Owners and managers can add members to their organisation. The new member''s user_id does not need to match auth.uid().';

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
