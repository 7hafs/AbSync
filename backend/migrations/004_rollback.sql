-- ============================================================================
-- Phase 4 Rollback: Remove clear_profile_on_member_delete trigger
-- ============================================================================

BEGIN;

DROP TRIGGER IF EXISTS clear_profile_on_member_delete ON organisation_members;
DROP FUNCTION IF EXISTS public.clear_profile_on_member_delete();

COMMIT;
