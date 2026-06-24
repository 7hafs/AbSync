-- ============================================================================
-- Phase 4C (v2 — corrected for live database): Transactional Invitation Acceptance RPC
-- ============================================================================
-- CORRECTED:
--   1. p_user_id changed from uuid to text (profiles.id is text)
--   2. organisation_members.user_id is now text (from 001_v2)
--   3. organisation_invitations.invited_by is now text (from 002_v2)
--   4. All comparisons use text types consistently
--
-- Must run AFTER 001, 002, and 004 (tables and trigger must exist).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.accept_invitation_rpc(
  p_token      text,
  p_user_id    text,
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
      SELECT count(*) INTO v_owner_count
      FROM public.organisation_members
      WHERE organisation_id = v_old_member.organisation_id
        AND role = 'owner'
        AND user_id <> p_user_id;

      v_is_sole_owner := (v_owner_count = 0);

      IF v_is_sole_owner THEN
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
    -- =====================================================================

    DELETE FROM public.organisation_members
    WHERE id = v_old_member.id;

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
    RETURN jsonb_build_object(
      'success', false,
      'error', 'An unexpected error occurred. Please try again. ' || SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION public.accept_invitation_rpc(text, text, text) IS
  'Atomically accepts an invitation. p_user_id is text (profiles.id type). SECURITY DEFINER to bypass RLS during the cross-table operation.';

COMMIT;
