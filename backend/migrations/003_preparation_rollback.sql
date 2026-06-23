-- ============================================================================
-- Phase 3B: Pre-RLS Preparation — Rollback
-- ============================================================================
-- Drops the index added by 003_preparation.
-- Does NOT revert the audit_logs backfill (data backfills are irreversible).
-- ============================================================================

BEGIN;

DROP INDEX IF EXISTS idx_invitations_token_email;

COMMIT;
