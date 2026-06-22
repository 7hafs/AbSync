-- ----------------------------------------------------------------------------
-- Rollback for 002_organisation_invitations
-- ----------------------------------------------------------------------------
-- Drops the invitations table and all associated indexes.
-- Existing organisation data is unaffected.
-- ----------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS organisation_invitations CASCADE;

COMMIT;
