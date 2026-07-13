-- ============================================================================
-- Remove diagnostic / development-only RPC functions
-- ============================================================================
-- Drops debug functions that were used during development to diagnose auth
-- context and identity issues. These are not needed in production and expose
-- internal state unnecessarily.
--
-- Functions removed:
--   debug_auth_context
--   diagnose_auth_id
--   diagnose_identity_values
--   inspect_organisations_schema
-- ============================================================================

DROP FUNCTION IF EXISTS public.debug_auth_context();
DROP FUNCTION IF EXISTS public.diagnose_auth_id();
DROP FUNCTION IF EXISTS public.diagnose_identity_values();
DROP FUNCTION IF EXISTS public.inspect_organisations_schema();
