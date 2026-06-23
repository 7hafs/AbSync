-- ============================================================================
-- Phase 3B: RLS Policies — Rollback
-- ============================================================================
-- Disables RLS on all tables and drops all policies + helper functions.
-- This returns the database to the pre-RLS state (data is unaffected).
-- ============================================================================

BEGIN;

-- ── Drop all policies ────────────────────────────────────────────────────────

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ── Disable RLS on all tables ────────────────────────────────────────────────

ALTER TABLE profiles                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE organisations              DISABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_members       DISABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_invitations   DISABLE ROW LEVEL SECURITY;
ALTER TABLE absences                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members              DISABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events            DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes                      DISABLE ROW LEVEL SECURITY;
ALTER TABLE reminders                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE departments                DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences   DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs                 DISABLE ROW LEVEL SECURITY;

-- ── Drop helper functions ────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_user_organisation_id();
DROP FUNCTION IF EXISTS public.is_member_of_org(uuid);
DROP FUNCTION IF EXISTS public.can_manage_org(uuid);
DROP FUNCTION IF EXISTS public.is_org_owner(uuid);
DROP FUNCTION IF EXISTS public.get_user_email();

COMMIT;
