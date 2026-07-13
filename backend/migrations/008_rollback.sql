-- Rollback: re-creates the debug functions (for development only).
-- Not needed in production — only run if debugging auth context issues.

-- These are intentionally empty stubs; the original implementations were
-- diagnostic helpers that queried auth.jwt() and pg_catalog views.
-- If needed for debugging, restore from git history.

-- NOTE: These functions are NOT re-created here because they were
-- development-only diagnostic tools. If you need them, check the git
-- history for the original SQL definitions.
