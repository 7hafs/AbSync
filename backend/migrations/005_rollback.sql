-- ============================================================================
-- Phase 4C Rollback: Drop the accept_invitation_rpc function
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.accept_invitation_rpc(text, uuid, text);

COMMIT;
