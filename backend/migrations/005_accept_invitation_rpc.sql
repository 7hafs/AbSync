-- ============================================================================
-- Phase 4C: Transactional Invitation Acceptance RPC
-- ============================================================================
-- Replaces the multi-step acceptInvitation() app-layer flow with a single
-- database function that runs atomically. All steps succeed or all roll back.
--
-- The function:
--   1. Validates the invitation (pending, not expired, email match)
--   2. Checks the user is not already a member of the target org
--   3. If leaving an old org, checks sole-owner protection
--   4. Deletes old membership (clear_profile_on_member_delete trigger handles
--      clearing profile.organisation_id when no memberships remain)
--   5. Inserts new membership with the invited role
--   6. Updates profile.organisation_id to the target org
--   7. Marks the invitation as accepted
--   8. Writes audit log entries
--
-- Returns a JSON object: { success: boolean, org_id: text, error: text }
--
-- SECURITY DEFINER is required so the function can:
--   - Write to organisation_members (the user may not yet be a member)
--   - Update profiles (after clearing old membership, the user has no org)
--   - Write to audit_logs (requires organisation_id scoping)
--   - Cross-reference organisations, members, and invitations tables
-- ============================================================================

BEGIN;

-- ── Helper: get the user's email from their profile ──────────────────────────
-- This is already defined in 003_rls_policies.sql but we include it here
-- with IF NOT EXISTS for idempotency.

CREATE OR REPLACE FUNCTION public.accept_invitation_rpc(
  p_token      text,
  p_user_id    uuid,
  p_user_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invitation    record;
  v_old_member    record;
  v_target_org_id uuid;
  v_is_sole_owner boolean;
  v_owner_count   integer;
  v_now           timestamptz := now();
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 1: Look up and validate the invitation
  -- ═══════════════════════════════════════════════════════════════════════════

  SELECT id, organisation_id, email, role, status, expires_at
  INTO v_invitation
  FROM public.organisation_invitations
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invitation not found. It may have been revoked.'
    );
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This invitation is ' || v_invitation.status || '.'
    );
  END IF;

  IF v_invitation.expires_at < v_now THEN
    -- Mark as expired atomically
    UPDATE public.organisation_invitations
    SET status = 'expired', updated_at = v_now
    WHERE id = v_invitation.id;

    RETURN jsonb_build_object(
      'success', false,
      'error', 'This invitation has expired.'
    );
  END IF;

  IF lower(v_invitation.email) <> lower(p_user_email) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'This invitation is for ' || v_invitation.email ||
               '. Your account email is ' || p_user_email || '.'
    );
  END IF;

  v_target_org_id := v_invitation.organisation_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 2: Check user is not already a member of the target org
  -- ═══════════════════════════════════════════════════════════════════════════

  IF EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = v_target_org_id
      AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'You are already a member of this organisation.'
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 3: Check current membership (if any) and sole-owner protection
  -- ═══════════════════════════════════════════════════════════════════════════

  SELECT id, organisation_id, role
  INTO v_old_member
  FROM public.organisation_members
  WHERE user_id = p_user_id
  LIMIT 1;

  IF FOUND THEN
    IF v_old_member.role = 'owner' THEN
      -- Count other owners in the old org
      SELECT count(*) INTO v_owner_count
      FROM public.organisation_members
      WHERE organisation_id = v_old_member.organisation_id
        AND role = 'owner'
        AND user_id <> p_user_id;

      v_is_sole_owner := (v_owner_count = 0);

      IF v_is_sole_owner THEN
        -- Write transfer-blocked audit log before returning
        INSERT INTO public.audit_logs (
          user_id, organisation_id, action, entity_type, entity_id,
          old_values, new_values
        ) VALUES (
          p_user_id,
          v_old_member.organisation_id,
          'organisation_transfer_blocked',
          'organisation',
          v_old_member.organisation_id,
          jsonb_build_object('reason', 'sole_owner_transfer'),
          jsonb_build_object(
            'user_id', p_user_id,
            'target_organisation', v_target_org_id
          )
        );

        RETURN jsonb_build_object(
          'success', false,
          'error', 'You are the only owner of your current organisation. ' ||
                   'Please assign another owner or archive the organisation before joining a new one.'
        );
      END IF;
    END IF;

    -- ═════════════════════════════════════════════════════════════════════════
    -- STEP 4: Remove from old organisation
    -- The clear_profile_on_member_delete trigger fires AFTER this DELETE
    -- and clears profile.organisation_id if no memberships remain.
    -- ═════════════════════════════════════════════════════════════════════════

    DELETE FROM public.organisation_members
    WHERE id = v_old_member.id;

    -- Write audit: left old org
    INSERT INTO public.audit_logs (
      user_id, organisation_id, action, entity_type, entity_id,
      old_values, new_values
    ) VALUES (
      p_user_id,
      v_old_member.organisation_id,
      'organisation_left',
      'organisation',
      v_old_member.organisation_id,
      jsonb_build_object(
        'user_id', p_user_id,
        'previous_role', v_old_member.role
      ),
      jsonb_build_object(
        'new_organisation', v_target_org_id
      )
    );
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 5: Insert new membership
  -- ═══════════════════════════════════════════════════════════════════════════

  INSERT INTO public.organisation_members (
    organisation_id, user_id, role, created_at
  ) VALUES (
    v_target_org_id, p_user_id, v_invitation.role, v_now
  );

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 6: Update profile.organisation_id
  -- (The trigger may have cleared it; we always set it to the target org)
  -- ═══════════════════════════════════════════════════════════════════════════

  UPDATE public.profiles
  SET organisation_id = v_target_org_id
  WHERE id = p_user_id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 7: Mark invitation as accepted
  -- ═══════════════════════════════════════════════════════════════════════════

  UPDATE public.organisation_invitations
  SET status = 'accepted', updated_at = v_now
  WHERE id = v_invitation.id;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STEP 8: Write audit logs
  -- ═══════════════════════════════════════════════════════════════════════════

  INSERT INTO public.audit_logs (
    user_id, organisation_id, action, entity_type, entity_id,
    old_values, new_values
  ) VALUES (
    p_user_id,
    v_target_org_id,
    'invitation_accepted',
    'organisation_invitations',
    v_invitation.id,
    null,
    jsonb_build_object(
      'user_id', p_user_id,
      'organisation_id', v_target_org_id,
      'role', v_invitation.role
    )
  );

  INSERT INTO public.audit_logs (
    user_id, organisation_id, action, entity_type, entity_id,
    old_values, new_values
  ) VALUES (
    p_user_id,
    v_target_org_id,
    'organisation_joined',
    'organisation',
    v_target_org_id,
    null,
    jsonb_build_object(
      'user_id', p_user_id,
      'role', v_invitation.role,
      'via', 'invitation',
      'invitation_id', v_invitation.id
    )
  );

  -- ═══════════════════════════════════════════════════════════════════════════
  -- SUCCESS
  -- ═══════════════════════════════════════════════════════════════════════════

  RETURN jsonb_build_object(
    'success', true,
    'org_id', v_target_org_id
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Any error rolls back the entire transaction automatically.
    -- Return the error so the client can surface it.
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An unexpected error occurred. Please try again. ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.accept_invitation_rpc(text, uuid, text) IS
  'Atomically accepts an invitation: validates, transfers membership (with sole-owner protection), updates profile, marks invitation accepted, and writes audit logs. All steps succeed or all roll back. SECURITY DEFINER to bypass RLS during the cross-table operation.';

-- ── Validation queries (run after migration) ─────────────────────────────────
--
-- 1. Verify the function exists:
--    SELECT proname, prosecdef FROM pg_proc
--    WHERE proname = 'accept_invitation_rpc';
--    → Should return 1 row with prosecdef = true.
--
-- 2. Test successful transfer (requires real data — run manually):
--    SELECT accept_invitation_rpc('<valid_token>', '<user_uuid>', '<user_email>');
--    → Should return {"success": true, "org_id": "<target_org_uuid>"}
--
-- 3. Test expired invitation:
--    SELECT accept_invitation_rpc('<expired_token>', '<user_uuid>', '<user_email>');
--    → Should return {"success": false, "error": "This invitation has expired."}
--
-- 4. Test sole-owner block:
--    SELECT accept_invitation_rpc('<token>', '<sole_owner_uuid>', '<email>');
--    → Should return {"success": false, "error": "You are the only owner..."}
--
-- 5. Test network interruption simulation:
--    The function is a single PL/pgSQL call — if the connection drops mid-flight,
--    PostgreSQL automatically rolls back any uncommitted work. There is no
--    partial-commit window.

COMMIT;
