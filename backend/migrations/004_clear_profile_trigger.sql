-- ============================================================================
-- Phase 4: Clear profile trigger on member deletion
-- ============================================================================
-- Creates a database trigger that automatically clears profile.organisation_id
-- when a user's last membership row in organisation_members is deleted.
-- This removes the need for app-layer logic to handle this, ensuring atomicity
-- and preventing the app from ever leaving a stale organisation_id on a profile
-- when the user is no longer a member of any organisation.
--
-- Trigger semantics:
--   AFTER DELETE on organisation_members: if the deleted user has zero
--   remaining memberships, set their profile.organisation_id = NULL.
--
-- Benefits:
--   1. Atomic — no race between app-layer delete and profile update.
--   2. Consistent — works for all deletion paths (manual removal, invitation
--      transfer, self-leave).
--   3. App-layer simplified — removeOrganisationMember() no longer needs to
--      explicitly NULL the profile column.
-- ============================================================================

BEGIN;

-- ── Trigger function ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.clear_profile_on_member_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- After a membership row is deleted, check if the user still has any
  -- remaining organisation memberships.  If not, clear their profile's
  -- organisation_id so the repair path can create or assign a new org
  -- on next sign-in.
  IF NOT EXISTS (
    SELECT 1
    FROM public.organisation_members
    WHERE user_id = OLD.user_id
  ) THEN
    UPDATE public.profiles
    SET organisation_id = NULL
    WHERE id = OLD.user_id
      AND organisation_id IS NOT NULL;

    RAISE NOTICE '[trigger:clear_profile] User % has no more memberships — cleared profile.organisation_id.', OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.clear_profile_on_member_delete() IS
  'AFTER DELETE trigger on organisation_members.  Clears profile.organisation_id when the user has no remaining memberships.';

-- ── Attach trigger ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS clear_profile_on_member_delete ON organisation_members;

CREATE TRIGGER clear_profile_on_member_delete
  AFTER DELETE ON organisation_members
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_profile_on_member_delete();

COMMENT ON TRIGGER clear_profile_on_member_delete ON organisation_members IS
  'Fires after a membership row is deleted.  Automatically NULLs profile.organisation_id if the user has no remaining memberships.';

COMMIT;
