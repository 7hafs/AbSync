-- ============================================================================
-- Phase 4D (v2 — corrected for live database): Workspace Mode
-- ============================================================================
-- Adds workspace_mode to profiles so users can choose between Personal and
-- Organisation workspaces.
--
-- Must run AFTER 001 (organisation_id column must exist on profiles for backfill).
-- ============================================================================

BEGIN;

-- ── 1. Add workspace_mode column ────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS workspace_mode text;

COMMENT ON COLUMN profiles.workspace_mode IS
  'Workspace mode: ''personal'' (single-user) or ''organisation'' (multi-user with roles/invitations). NULL means not yet chosen (onboarding required).';

-- ── 2. Backfill existing users ──────────────────────────────────────────────
-- Users who already have an organisation_id get workspace_mode = 'organisation'.
-- Users without one remain NULL (will be sent to onboarding).

UPDATE profiles
SET workspace_mode = 'organisation'
WHERE workspace_mode IS NULL
  AND organisation_id IS NOT NULL;

-- ── 3. Validation ───────────────────────────────────────────────────────────

DO $$
DECLARE
  null_mode_count integer;
  personal_count  integer;
  org_count       integer;
BEGIN
  SELECT COUNT(*) INTO null_mode_count FROM profiles WHERE workspace_mode IS NULL;
  SELECT COUNT(*) INTO personal_count  FROM profiles WHERE workspace_mode = 'personal';
  SELECT COUNT(*) INTO org_count       FROM profiles WHERE workspace_mode = 'organisation';

  RAISE NOTICE '━━━ WORKSPACE MODE MIGRATION ━━━';
  RAISE NOTICE 'NULL (onboarding needed): %', null_mode_count;
  RAISE NOTICE 'Personal workspace:        %', personal_count;
  RAISE NOTICE 'Organisation workspace:    %', org_count;
  RAISE NOTICE 'Total profiles:            %', null_mode_count + personal_count + org_count;
END $$;

COMMIT;
