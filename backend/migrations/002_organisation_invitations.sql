-- ============================================================================
-- Phase 2: Organisation Invitations
-- ============================================================================
-- Adds invitation support so owners/managers can invite users to join their
-- organisation. No RLS or role restrictions yet — just the data foundation
-- and validation constraints.
--
-- Table: organisation_invitations
--   - token: unique URL-safe random string for invitation lookup
--   - email: the invited user's email address
--   - role: the role they'll have in the org (staff, manager, owner)
--   - status: pending | accepted | expired | revoked
--   - expires_at: invitations expire after 7 days by default
--   - invited_by: the profile ID of the user who created the invitation
--
-- Validation (enforced via constraints + app logic, not RLS):
--   - UNIQUE(organisation_id, email, status) WHERE status = 'pending'
--     prevents duplicate active invitations for the same email+org
--   - App checks organisation_members before inserting to prevent
--     inviting existing members
-- ============================================================================

BEGIN;

-- ── 1. Create organisation_invitations table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS organisation_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL DEFAULT 'staff',
  status          text NOT NULL DEFAULT 'pending',
  expires_at      timestamptz NOT NULL,
  invited_by      uuid NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One active (pending) invitation per email per organisation
  CONSTRAINT uq_org_email_pending UNIQUE (organisation_id, email, status)
);

COMMENT ON TABLE organisation_invitations IS 'Invitations sent to users to join an organisation.';
COMMENT ON COLUMN organisation_invitations.token IS 'Unique URL-safe token used to look up and accept the invitation.';
COMMENT ON COLUMN organisation_invitations.email IS 'Email address of the invited user.';
COMMENT ON COLUMN organisation_invitations.role IS 'Role the user will have upon accepting: owner, manager, or staff.';
COMMENT ON COLUMN organisation_invitations.status IS 'Invitation lifecycle: pending, accepted, expired, or revoked.';
COMMENT ON COLUMN organisation_invitations.expires_at IS 'UTC timestamp after which the invitation is considered expired.';
COMMENT ON COLUMN organisation_invitations.invited_by IS 'Profile ID of the user who sent the invitation.';

-- ── 2. Indexes ───────────────────────────────────────────────────────────────

-- Fast lookup by token (the primary acceptance path)
CREATE INDEX IF NOT EXISTS idx_invitations_token
  ON organisation_invitations(token);

-- Lookup by email + status for auto-accept on sign-in
CREATE INDEX IF NOT EXISTS idx_invitations_email_status
  ON organisation_invitations(email, status)
  WHERE status = 'pending';

-- Lookup pending invitations for an organisation
CREATE INDEX IF NOT EXISTS idx_invitations_org_status
  ON organisation_invitations(organisation_id, status)
  WHERE status = 'pending';

-- ── 3. Partial unique index for active invitations ───────────────────────────
-- Ensures only one pending invitation per email+org combo.
-- (The UNIQUE constraint on (organisation_id, email, status) above handles this,
-- but this partial index is an extra safeguard for the 'pending' status only.)

CREATE UNIQUE INDEX IF NOT EXISTS uq_active_invitation
  ON organisation_invitations(organisation_id, email)
  WHERE status = 'pending';

COMMIT;
