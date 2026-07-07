-- ============================================================================
-- PRODUCTION MIGRATION BUNDLE (v2 — corrected for live database)
-- ============================================================================
-- Single script combining all 7 corrected migrations in the correct dependency
-- order. Run this entire script in the Supabase SQL Editor.
--
-- Supabase project: mvtxgvxfpepbdxoxcoaw
-- Auth model:        Rork Auth (user_id(), NOT auth.uid())
-- profiles.id type:  text (NOT uuid)
--
-- Execution plan:
--   Step 1 — Organisation Foundation (adds columns, creates organisation_members)
--   Step 2 — Organisation Invitations (creates organisation_invitations)
--   Step 3 — RLS Policies (enables RLS, helpers, all table policies)
--   Step 4 — Clear Profile Trigger (trigger on member deletion)
--   Step 5 — Accept Invitation RPC (atomic invitation acceptance)
--   Step 6 — Workspace Mode (workspace_mode column + backfill)
--   Step 7 — Fix Member Insert RLS (split insert policy)
--
-- Estimated runtime: < 5 seconds on an empty/small database.
-- All steps run in a single transaction — any failure rolls back everything.
--
-- Step 8 — Create Organisation RPC (SECURITY DEFINER, bypasses RLS)
-- ============================================================================

BEGIN;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 1: ORGANISATION FOUNDATION                                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

RAISE NOTICE 'Step 1/8: Organisation Foundation';

-- 1a. Add owner_id and settings to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS owner_id text REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS settings  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 1b. Add organisation_id to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- 1c. Add organisation_id to notification_preferences
-- (audit_logs.organisation_id already exists in live DB)
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- 1d. Create organisation_members junction table (user_id is text!)
CREATE TABLE IF NOT EXISTS organisation_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'staff',
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, user_id)
);

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1e. Backfill: create one org per user who doesn't have one yet
WITH new_orgs AS (
  INSERT INTO organisations (id, name, slug, owner_id)
  SELECT
    gen_random_uuid(),
    COALESCE(p.name, p.email, 'My Organisation'),
    NULL,
    p.id
  FROM profiles p
  WHERE p.organisation_id IS NULL
  RETURNING id, owner_id
)
UPDATE profiles p
SET organisation_id = no.id
FROM new_orgs no
WHERE p.id = no.owner_id
  AND p.organisation_id IS NULL;

-- 1f. Create owner membership rows
INSERT INTO organisation_members (organisation_id, user_id, role)
SELECT p.organisation_id, p.id, 'owner'
FROM profiles p
WHERE p.organisation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM organisation_members om
    WHERE om.organisation_id = p.organisation_id
      AND om.user_id = p.id
  );

-- 1g. Link entity data to user organisations
UPDATE absences a       SET organisation_id = p.organisation_id FROM profiles p WHERE a.user_id = p.id AND a.organisation_id IS NULL AND p.organisation_id IS NOT NULL;
UPDATE staff_members s  SET organisation_id = p.organisation_id FROM profiles p WHERE s.user_id = p.id AND s.organisation_id IS NULL AND p.organisation_id IS NOT NULL;
UPDATE calendar_events ce SET organisation_id = p.organisation_id FROM profiles p WHERE ce.user_id = p.id AND ce.organisation_id IS NULL AND p.organisation_id IS NOT NULL;
UPDATE notes n          SET organisation_id = p.organisation_id FROM profiles p WHERE n.user_id = p.id AND n.organisation_id IS NULL AND p.organisation_id IS NOT NULL;
UPDATE reminders r      SET organisation_id = p.organisation_id FROM profiles p WHERE r.user_id = p.id AND r.organisation_id IS NULL AND p.organisation_id IS NOT NULL;

-- 1h. Department backfill (deterministic ownership resolution)
WITH dept_org_stats AS (
  SELECT d.id AS dept_id, d.name AS dept_name, p.organisation_id,
         COUNT(*) AS staff_count, MIN(sm.created_at) AS earliest_staff_created
  FROM departments d
  JOIN staff_members sm ON sm.department_id = d.id
  JOIN profiles      p  ON p.id = sm.user_id
  WHERE d.organisation_id IS NULL AND p.organisation_id IS NOT NULL
  GROUP BY d.id, d.name, p.organisation_id
),
dept_winner AS (
  SELECT DISTINCT ON (dept_id) dept_id, dept_name, organisation_id AS winner_org_id,
         SUM(staff_count) OVER (PARTITION BY dept_id) AS total_staff,
         COUNT(*) OVER (PARTITION BY dept_id) AS distinct_orgs
  FROM dept_org_stats
  ORDER BY dept_id, staff_count DESC, earliest_staff_created ASC
)
UPDATE departments d
SET organisation_id = dc.winner_org_id
FROM dept_winner dc
WHERE d.id = dc.dept_id AND d.organisation_id IS NULL;

-- 1i. Audit logs and notification preferences backfill
UPDATE audit_logs al              SET organisation_id = p.organisation_id FROM profiles p WHERE al.user_id = p.id AND al.organisation_id IS NULL AND p.organisation_id IS NOT NULL;
UPDATE notification_preferences np SET organisation_id = p.organisation_id FROM profiles p WHERE np.user_id = p.id AND np.organisation_id IS NULL AND p.organisation_id IS NOT NULL;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 2: ORGANISATION INVITATIONS                                         ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

RAISE NOTICE 'Step 2/8: Organisation Invitations';

CREATE TABLE IF NOT EXISTS organisation_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email           text NOT NULL,
  role            text NOT NULL DEFAULT 'staff',
  status          text NOT NULL DEFAULT 'pending',
  expires_at      timestamptz NOT NULL,
  invited_by      text NOT NULL REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_org_email_pending UNIQUE (organisation_id, email, status)
);

CREATE INDEX IF NOT EXISTS idx_invitations_token        ON organisation_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email_status  ON organisation_invitations(email, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_invitations_org_status    ON organisation_invitations(organisation_id, status) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_invitation   ON organisation_invitations(organisation_id, email) WHERE status = 'pending';

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 3: RLS POLICIES                                                     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

RAISE NOTICE 'Step 3/8: RLS Policies';

-- 3a. Helper functions (use auth.jwt() ->> 'sub' — Rork Auth)
-- NOTE: user_id() is NOT accessible inside SECURITY DEFINER functions with
-- search_path = ''. We use current_setting('request.jwt.claims') instead,
-- which is the underlying mechanism user_id() relies on.

CREATE OR REPLACE FUNCTION public.get_user_organisation_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT organisation_id FROM public.profiles WHERE id = (auth.jwt() ->> 'sub') LIMIT 1; $$;

CREATE OR REPLACE FUNCTION public.is_member_of_org(org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.organisation_members WHERE organisation_id = org_id AND user_id = (auth.jwt() ->> 'sub')); $$;

CREATE OR REPLACE FUNCTION public.can_manage_org(org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.organisation_members WHERE organisation_id = org_id AND user_id = (auth.jwt() ->> 'sub') AND role IN ('owner', 'manager')); $$;

CREATE OR REPLACE FUNCTION public.is_org_owner(org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (SELECT 1 FROM public.organisation_members WHERE organisation_id = org_id AND user_id = (auth.jwt() ->> 'sub') AND role = 'owner'); $$;

CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT email FROM public.profiles WHERE id = (auth.jwt() ->> 'sub') LIMIT 1; $$;

-- 3b. profiles RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT TO authenticated
  USING (id = user_id() OR organisation_id = public.get_user_organisation_id());
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated
  WITH CHECK (id = user_id());
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (id = user_id()) WITH CHECK (id = user_id());

-- 3c. organisations RLS
-- ⚠️  First, drop any pre-existing weak policies that allow reading ALL organisations
DROP POLICY IF EXISTS "Authenticated users can read organisations" ON organisations;
DROP POLICY IF EXISTS "Users can create organisations" ON organisations;

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organisations_select_member" ON organisations;
CREATE POLICY "organisations_select_member" ON organisations FOR SELECT TO authenticated
  USING (public.is_member_of_org(id));
DROP POLICY IF EXISTS "organisations_insert_auth" ON organisations;
-- NOTE: user_id() is the canonical Rork Auth function (proven to work).
-- Do NOT use current_setting('request.jwt.claims') — it returns NULL in this setup.
CREATE POLICY "organisations_insert_auth" ON organisations FOR INSERT TO authenticated
  WITH CHECK (owner_id = user_id());
DROP POLICY IF EXISTS "organisations_update_owner" ON organisations;
CREATE POLICY "organisations_update_owner" ON organisations FOR UPDATE TO authenticated
  USING (public.is_org_owner(id)) WITH CHECK (public.is_org_owner(id));
DROP POLICY IF EXISTS "organisations_delete_owner" ON organisations;
CREATE POLICY "organisations_delete_owner" ON organisations FOR DELETE TO authenticated
  USING (public.is_org_owner(id));

-- 3d. organisation_members RLS
ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_members_select_own_org" ON organisation_members;
CREATE POLICY "org_members_select_own_org" ON organisation_members FOR SELECT TO authenticated
  USING (public.is_member_of_org(organisation_id));
DROP POLICY IF EXISTS "org_members_insert" ON organisation_members;
CREATE POLICY "org_members_insert" ON organisation_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND (
      EXISTS (SELECT 1 FROM public.organisations WHERE id = organisation_id AND owner_id = user_id())
      OR EXISTS (SELECT 1 FROM public.organisation_invitations WHERE organisation_id = organisation_members.organisation_id AND email = public.get_user_email() AND status = 'pending')
      OR public.can_manage_org(organisation_id)
    )
  );
DROP POLICY IF EXISTS "org_members_update_owner" ON organisation_members;
CREATE POLICY "org_members_update_owner" ON organisation_members FOR UPDATE TO authenticated
  USING (public.is_org_owner(organisation_id)) WITH CHECK (public.is_org_owner(organisation_id));
DROP POLICY IF EXISTS "org_members_delete" ON organisation_members;
CREATE POLICY "org_members_delete" ON organisation_members FOR DELETE TO authenticated
  USING (public.can_manage_org(organisation_id) OR user_id = user_id());

-- 3e. organisation_invitations RLS
ALTER TABLE organisation_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_invitations_select" ON organisation_invitations;
CREATE POLICY "org_invitations_select" ON organisation_invitations FOR SELECT TO authenticated
  USING (public.is_member_of_org(organisation_id) OR (status = 'pending' AND email = public.get_user_email()));
DROP POLICY IF EXISTS "org_invitations_insert" ON organisation_invitations;
CREATE POLICY "org_invitations_insert" ON organisation_invitations FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_org(organisation_id));
DROP POLICY IF EXISTS "org_invitations_update" ON organisation_invitations;
CREATE POLICY "org_invitations_update" ON organisation_invitations FOR UPDATE TO authenticated
  USING (public.can_manage_org(organisation_id) OR (status = 'pending' AND email = public.get_user_email()))
  WITH CHECK (public.can_manage_org(organisation_id) OR (status = 'pending' AND email = public.get_user_email()));
DROP POLICY IF EXISTS "org_invitations_delete" ON organisation_invitations;
CREATE POLICY "org_invitations_delete" ON organisation_invitations FOR DELETE TO authenticated
  USING (public.can_manage_org(organisation_id));

-- 3f. Entity table RLS (absences, staff_members, calendar_events, notes, reminders, departments, notification_preferences, audit_logs)
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['absences','staff_members','calendar_events','notes','reminders','audit_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_org" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_select_org" ON %I FOR SELECT TO authenticated USING (organisation_id = public.get_user_organisation_id())', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert_own" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_insert_own" ON %I FOR INSERT TO authenticated WITH CHECK (user_id = user_id() AND organisation_id = public.get_user_organisation_id())', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated USING (organisation_id = public.get_user_organisation_id()) WITH CHECK (organisation_id = public.get_user_organisation_id())', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete_own" ON %I', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_delete_own" ON %I FOR DELETE TO authenticated USING (user_id = user_id())', tbl, tbl);
  END LOOP;
END $$;

-- notification_preferences uses user_id not user_id + organisation_id for read
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_prefs_select_own" ON notification_preferences;
CREATE POLICY "notif_prefs_select_own" ON notification_preferences FOR SELECT TO authenticated USING (user_id = user_id());
DROP POLICY IF EXISTS "notif_prefs_insert_own" ON notification_preferences;
CREATE POLICY "notif_prefs_insert_own" ON notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = user_id() AND organisation_id = public.get_user_organisation_id());
DROP POLICY IF EXISTS "notif_prefs_update_own" ON notification_preferences;
CREATE POLICY "notif_prefs_update_own" ON notification_preferences FOR UPDATE TO authenticated
  USING (user_id = user_id()) WITH CHECK (user_id = user_id() AND organisation_id = public.get_user_organisation_id());
DROP POLICY IF EXISTS "notif_prefs_delete_own" ON notification_preferences;
CREATE POLICY "notif_prefs_delete_own" ON notification_preferences FOR DELETE TO authenticated USING (user_id = user_id());

-- 3g. departments RLS (no user_id column — policies are org-scoped, not per-user)
-- ⚠️  First, drop pre-existing weak policies that allow reading ALL departments
DROP POLICY IF EXISTS "Authenticated users can read departments" ON departments;
DROP POLICY IF EXISTS "Users can create departments" ON departments;

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments_select_org" ON departments;
CREATE POLICY "departments_select_org" ON departments FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "departments_insert_org" ON departments;
CREATE POLICY "departments_insert_org" ON departments FOR INSERT TO authenticated
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "departments_update_org" ON departments;
CREATE POLICY "departments_update_org" ON departments FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "departments_delete_org" ON departments;
CREATE POLICY "departments_delete_org" ON departments FOR DELETE TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 4: CLEAR PROFILE TRIGGER                                            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

RAISE NOTICE 'Step 4/8: Clear Profile Trigger';

CREATE OR REPLACE FUNCTION public.clear_profile_on_member_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organisation_members WHERE user_id = OLD.user_id) THEN
    UPDATE public.profiles SET organisation_id = NULL WHERE id = OLD.user_id AND organisation_id IS NOT NULL;
    RAISE NOTICE '[trigger:clear_profile] User % has no more memberships — cleared profile.organisation_id.', OLD.user_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS clear_profile_on_member_delete ON organisation_members;
CREATE TRIGGER clear_profile_on_member_delete
  AFTER DELETE ON organisation_members FOR EACH ROW
  EXECUTE FUNCTION public.clear_profile_on_member_delete();

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 5: ACCEPT INVITATION RPC                                            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

RAISE NOTICE 'Step 5/8: Accept Invitation RPC';

CREATE OR REPLACE FUNCTION public.accept_invitation_rpc(
  p_token text, p_user_id text, p_user_email text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_invitation    record;
  v_old_member    record;
  v_target_org_id uuid;
  v_is_sole_owner boolean;
  v_owner_count   integer;
  v_now           timestamptz := now();
BEGIN
  SELECT id, organisation_id, email, role, status, expires_at
  INTO v_invitation FROM public.organisation_invitations WHERE token = p_token LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found. It may have been revoked.');
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invitation is ' || v_invitation.status || '.');
  END IF;

  IF v_invitation.expires_at < v_now THEN
    UPDATE public.organisation_invitations SET status = 'expired', updated_at = v_now WHERE id = v_invitation.id;
    RETURN jsonb_build_object('success', false, 'error', 'This invitation has expired.');
  END IF;

  IF lower(v_invitation.email) <> lower(p_user_email) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'This invitation is for ' || v_invitation.email || '. Your account email is ' || p_user_email || '.');
  END IF;

  v_target_org_id := v_invitation.organisation_id;

  IF EXISTS (SELECT 1 FROM public.organisation_members WHERE organisation_id = v_target_org_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are already a member of this organisation.');
  END IF;

  SELECT id, organisation_id, role INTO v_old_member
  FROM public.organisation_members WHERE user_id = p_user_id LIMIT 1;

  IF FOUND THEN
    IF v_old_member.role = 'owner' THEN
      SELECT count(*) INTO v_owner_count FROM public.organisation_members
      WHERE organisation_id = v_old_member.organisation_id AND role = 'owner' AND user_id <> p_user_id;
      v_is_sole_owner := (v_owner_count = 0);
      IF v_is_sole_owner THEN
        INSERT INTO public.audit_logs (user_id, organisation_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (p_user_id, v_old_member.organisation_id, 'organisation_transfer_blocked', 'organisation', v_old_member.organisation_id,
                jsonb_build_object('reason', 'sole_owner_transfer'),
                jsonb_build_object('user_id', p_user_id, 'target_organisation', v_target_org_id));
        RETURN jsonb_build_object('success', false, 'error',
          'You are the only owner of your current organisation. Please assign another owner or archive the organisation before joining a new one.');
      END IF;
    END IF;

    DELETE FROM public.organisation_members WHERE id = v_old_member.id;

    INSERT INTO public.audit_logs (user_id, organisation_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (p_user_id, v_old_member.organisation_id, 'organisation_left', 'organisation', v_old_member.organisation_id,
            jsonb_build_object('user_id', p_user_id, 'previous_role', v_old_member.role),
            jsonb_build_object('new_organisation', v_target_org_id));
  END IF;

  INSERT INTO public.organisation_members (organisation_id, user_id, role, created_at)
  VALUES (v_target_org_id, p_user_id, v_invitation.role, v_now);

  UPDATE public.profiles SET organisation_id = v_target_org_id WHERE id = p_user_id;

  UPDATE public.organisation_invitations SET status = 'accepted', updated_at = v_now WHERE id = v_invitation.id;

  INSERT INTO public.audit_logs (user_id, organisation_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (p_user_id, v_target_org_id, 'invitation_accepted', 'organisation_invitations', v_invitation.id, null,
          jsonb_build_object('user_id', p_user_id, 'organisation_id', v_target_org_id, 'role', v_invitation.role));

  INSERT INTO public.audit_logs (user_id, organisation_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (p_user_id, v_target_org_id, 'organisation_joined', 'organisation', v_target_org_id, null,
          jsonb_build_object('user_id', p_user_id, 'role', v_invitation.role, 'via', 'invitation', 'invitation_id', v_invitation.id));

  RETURN jsonb_build_object('success', true, 'org_id', v_target_org_id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'An unexpected error occurred. Please try again. ' || SQLERRM);
END;
$$;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 6: WORKSPACE MODE                                                   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

RAISE NOTICE 'Step 6/8: Workspace Mode';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS workspace_mode text;

COMMENT ON COLUMN profiles.workspace_mode IS
  'Workspace mode: ''personal'' (single-user) or ''organisation'' (multi-user). NULL means not yet chosen.';

UPDATE profiles SET workspace_mode = 'organisation'
WHERE workspace_mode IS NULL AND organisation_id IS NOT NULL;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 7: FIX MEMBER INSERT RLS                                            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

RAISE NOTICE 'Step 7/8: Fix Member Insert RLS';

-- Drop the combined policy (may not exist if 003 just created it, but safe to drop)
DROP POLICY IF EXISTS "org_members_insert" ON organisation_members;

-- Self-insert policy (bootstrap + invitation acceptance)
DROP POLICY IF EXISTS "org_members_insert_self" ON organisation_members;
CREATE POLICY "org_members_insert_self" ON organisation_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND (
      EXISTS (SELECT 1 FROM public.organisations WHERE id = organisation_id AND owner_id = user_id())
      OR EXISTS (SELECT 1 FROM public.organisation_invitations WHERE organisation_id = organisation_members.organisation_id AND email = public.get_user_email() AND status = 'pending')
    )
  );

-- Managed insert policy (owner/manager adds someone else)
DROP POLICY IF EXISTS "org_members_insert_managed" ON organisation_members;
CREATE POLICY "org_members_insert_managed" ON organisation_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_org(organisation_id) AND user_id IS NOT NULL);

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ STEP 8: CREATE ORGANISATION RPC                                            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

RAISE NOTICE 'Step 8/8: Create Organisation RPC';

-- SECURITY DEFINER function that atomically creates an organisation +
-- owner membership + updates profile. Bypasses RLS entirely (runs as
-- postgres function owner). Same pattern as accept_invitation_rpc.
-- The app calls this via supabase.rpc('create_organisation_for_user', ...).
-- Used by bootstrapOrganisation (org workspace) and ensurePersonalOrg (personal).
-- Grants: EXECUTE only to authenticated (NOT PUBLIC).

CREATE OR REPLACE FUNCTION public.create_organisation_for_user(
  p_name text,
  p_owner_id text,
  p_update_profile boolean DEFAULT true,
  p_workspace_mode text DEFAULT 'organisation'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_existing_org_id uuid;
  v_auth_user_id text;
  v_jwt_sub text;
  v_action text;
BEGIN
  -- Capture auth context for diagnostics
  BEGIN
    v_auth_user_id := user_id();
  EXCEPTION WHEN OTHERS THEN
    v_auth_user_id := NULL;
  END;
  BEGIN
    v_jwt_sub := auth.jwt() ->> 'sub';
  EXCEPTION WHEN OTHERS THEN
    v_jwt_sub := NULL;
  END;

  -- Check if an org with this name + owner already exists (reuse for idempotency)
  SELECT id INTO v_existing_org_id
  FROM public.organisations
  WHERE owner_id = p_owner_id AND name = p_name
  LIMIT 1;

  IF v_existing_org_id IS NOT NULL THEN
    v_org_id := v_existing_org_id;
    v_action := 'reused';
  ELSE
    -- Insert new organisation
    INSERT INTO public.organisations (name, owner_id)
    VALUES (p_name, p_owner_id)
    RETURNING id INTO v_org_id;
    v_action := 'created';
  END IF;

  -- Insert or update owner membership (upsert)
  INSERT INTO public.organisation_members (organisation_id, user_id, role)
  VALUES (v_org_id, p_owner_id, 'owner')
  ON CONFLICT (organisation_id, user_id)
  DO UPDATE SET role = 'owner';

  -- Update profile if requested
  IF p_update_profile THEN
    UPDATE public.profiles
    SET organisation_id = v_org_id,
        workspace_mode = p_workspace_mode
    WHERE id = p_owner_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'org_id', v_org_id,
    'action', v_action,
    'diagnostics', jsonb_build_object(
      'auth_user_id', v_auth_user_id,
      'jwt_sub', v_jwt_sub,
      'owner_id_param', p_owner_id
    )
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'diagnostics', jsonb_build_object(
      'auth_user_id', v_auth_user_id,
      'jwt_sub', v_jwt_sub,
      'owner_id_param', p_owner_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_organisation_for_user(text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organisation_for_user(text, text, boolean, text) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- DONE
-- ═════════════════════════════════════════════════════════════════════════════

RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
RAISE NOTICE 'All 8 steps completed successfully.';
RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================================
-- Run these individually after the migration to confirm everything is in place:
--
-- -- Check RLS status on all tables:
-- SELECT tablename, CASE WHEN rowsecurity THEN 'ON' ELSE 'OFF' END FROM pg_tables
-- WHERE schemaname = 'public' AND tablename IN (
--   'profiles','organisations','organisation_members','organisation_invitations',
--   'absences','staff_members','calendar_events','notes','reminders','departments',
--   'notification_preferences','audit_logs'
-- ) ORDER BY tablename;
--
-- -- Check helper functions exist:
-- SELECT proname FROM pg_proc WHERE proname IN (
--   'get_user_organisation_id','is_member_of_org','can_manage_org','is_org_owner',
--   'get_user_email','accept_invitation_rpc','clear_profile_on_member_delete'
-- );
--
-- -- Check profiles have workspace_mode and organisation_id:
-- SELECT id, email, name, workspace_mode, organisation_id FROM profiles;
--
-- -- Count rows with NULL organisation_id (should approach 0):
-- SELECT 'absences' AS tbl, count(*) FROM absences WHERE organisation_id IS NULL
-- UNION ALL SELECT 'staff_members', count(*) FROM staff_members WHERE organisation_id IS NULL
-- UNION ALL SELECT 'calendar_events', count(*) FROM calendar_events WHERE organisation_id IS NULL
-- UNION ALL SELECT 'notes', count(*) FROM notes WHERE organisation_id IS NULL
-- UNION ALL SELECT 'reminders', count(*) FROM reminders WHERE organisation_id IS NULL;
