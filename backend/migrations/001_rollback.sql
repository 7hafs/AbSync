-- ============================================================================
-- Phase 1 Rollback: Organisation Foundation
-- ============================================================================
-- Reverts all schema changes from 001_organisation_foundation.sql.
--
-- IMPORTANT: This drops columns that may contain data populated during the
-- forward migration. Any organisation-scoped RLS policies or app code
-- relying on these columns must be disabled before running this rollback.
--
-- Use this ONLY if the forward migration caused issues and you need to
-- revert before the next Phase 2 migration (RLS + roles) runs.
-- ============================================================================

BEGIN;

-- ── 1. Drop organisation_members table ──────────────────────────────────────

DROP TABLE IF EXISTS organisation_members;

-- ── 2. Remove organisation_id from notification_preferences ─────────────────

ALTER TABLE notification_preferences
  DROP COLUMN IF EXISTS organisation_id;

-- ── 3. Remove organisation_id from audit_logs ───────────────────────────────

ALTER TABLE audit_logs
  DROP COLUMN IF EXISTS organisation_id;

-- ── 4. Remove organisation_id from profiles ─────────────────────────────────

ALTER TABLE profiles
  DROP COLUMN IF EXISTS organisation_id;

-- ── 5. Remove owner_id and settings from organisations ──────────────────────

ALTER TABLE organisations
  DROP COLUMN IF EXISTS owner_id,
  DROP COLUMN IF EXISTS settings;

COMMIT;
