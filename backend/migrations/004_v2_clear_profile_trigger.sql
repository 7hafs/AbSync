-- ============================================================================
-- Phase 4 (v2 — corrected for live database): Clear profile trigger on member deletion
-- ============================================================================
-- No auth.uid() references — pure data trigger. Works unchanged with the
-- corrected table schema (organisation_members.user_id is text, matches
-- profiles.id which is also text).
--
-- Must run AFTER 001 (organisation_members table must exist).
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
  -- remaining organisation memberships. If not, clear their profile's
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
  'AFTER DELETE trigger on organisation_members. Clears profile.organisation_id when the user has no remaining memberships.';

-- ── Attach trigger ───────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS clear_profile_on_member_delete ON organisation_members;

CREATE TRIGGER clear_profile_on_member_delete
  AFTER DELETE ON organisation_members
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_profile_on_member_delete();

COMMENT ON TRIGGER clear_profile_on_member_delete ON organisation_members IS
  'Fires after a membership row is deleted. Automatically NULLs profile.organisation_id if the user has no remaining memberships.';

COMMIT;
