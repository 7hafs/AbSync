-- Rollback 006_workspace_mode
BEGIN;

ALTER TABLE profiles DROP COLUMN IF EXISTS workspace_mode;

COMMIT;
