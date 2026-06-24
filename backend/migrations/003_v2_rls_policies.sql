-- ============================================================================
-- Phase 3B (v2 — corrected for live database): Row-Level Security (RLS) Policies
-- ============================================================================
-- CORRECTED for Rork Auth: ALL auth.uid() references replaced with user_id().
-- The live database already uses user_id() in existing policies.
--
-- This migration:
--   1. Replaces existing per-user RLS policies with org-scoped versions
--   2. Enables RLS on any table not already protected
--   3. Creates helper functions using user_id() for org-siloed access
--   4. Adds policies for the new organisation_members / organisation_invitations tables
--
-- Must run AFTER 001 (tables exist) and 002 (invitations table exists).
-- ============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS (all use user_id() — Rork Auth)
-- ═════════════════════════════════════════════════════════════════════════════

-- ── getUserOrganisationId ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_organisation_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organisation_id
  FROM public.profiles
  WHERE id = user_id()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_organisation_id() IS
  'Returns the current user''s organisation_id. SECURITY DEFINER to bypass RLS.';

-- ── isMemberOfOrg ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_member_of_org(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = org_id
      AND user_id = user_id()
  );
$$;

COMMENT ON FUNCTION public.is_member_of_org(uuid) IS
  'True if the current user is a member (any role) of the given organisation.';

-- ── canManageOrg ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_manage_org(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = org_id
      AND user_id = user_id()
      AND role IN ('owner', 'manager')
  );
$$;

COMMENT ON FUNCTION public.can_manage_org(uuid) IS
  'True if the current user is an owner or manager of the given organisation.';

-- ── isOrgOwner ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_org_owner(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = org_id
      AND user_id = user_id()
      AND role = 'owner'
  );
$$;

COMMENT ON FUNCTION public.is_org_owner(uuid) IS
  'True if the current user is an owner of the given organisation.';

-- ── getUserEmail ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT email
  FROM public.profiles
  WHERE id = user_id()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_email() IS
  'Returns the current user''s email. SECURITY DEFINER to bypass RLS.';

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: profiles
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Read: User can read their own profile, or profiles of members in their org
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = user_id()
    OR organisation_id = public.get_user_organisation_id()
  );

-- Insert: User can insert their own profile
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = user_id());

-- Update: User can update their own profile
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = user_id())
  WITH CHECK (id = user_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: organisations
-- ═════════════════════════════════════════════════════════════════════════════

-- ⚠️  Drop pre-existing weak policies that allow reading/creating ALL organisations
DROP POLICY IF EXISTS "Authenticated users can read organisations" ON organisations;
DROP POLICY IF EXISTS "Users can create organisations" ON organisations;

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

-- Read: Members can read their own organisation
DROP POLICY IF EXISTS "organisations_select_member" ON organisations;
CREATE POLICY "organisations_select_member" ON organisations
  FOR SELECT TO authenticated
  USING (public.is_member_of_org(id));

-- Insert: Any authenticated user can create an organisation (they become owner
-- via the organisation_members row inserted immediately after)
DROP POLICY IF EXISTS "organisations_insert_auth" ON organisations;
CREATE POLICY "organisations_insert_auth" ON organisations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = user_id());

-- Update: Only owners can update organisation settings/name
DROP POLICY IF EXISTS "organisations_update_owner" ON organisations;
CREATE POLICY "organisations_update_owner" ON organisations
  FOR UPDATE TO authenticated
  USING (public.is_org_owner(id))
  WITH CHECK (public.is_org_owner(id));

-- Delete: Only owners can delete the organisation
DROP POLICY IF EXISTS "organisations_delete_owner" ON organisations;
CREATE POLICY "organisations_delete_owner" ON organisations
  FOR DELETE TO authenticated
  USING (public.is_org_owner(id));

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: organisation_members
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY;

-- Read: Members can see all members of their own org(s)
DROP POLICY IF EXISTS "org_members_select_own_org" ON organisation_members;
CREATE POLICY "org_members_select_own_org" ON organisation_members
  FOR SELECT TO authenticated
  USING (public.is_member_of_org(organisation_id));

-- Insert: Allowed in three scenarios:
--   1. Bootstrap: user creates their own membership as owner of a new org
--   2. Invitation: a pending invitation exists for the user's email in this org
--   3. Management: an existing owner/manager adds a new member
DROP POLICY IF EXISTS "org_members_insert" ON organisation_members;
CREATE POLICY "org_members_insert" ON organisation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND (
      -- Bootstrap: user is the owner of the org (just created it)
      EXISTS (
        SELECT 1 FROM public.organisations
        WHERE id = organisation_id AND owner_id = user_id()
      )
      OR
      -- Invitation acceptance: there's a pending invitation for this user's email
      EXISTS (
        SELECT 1 FROM public.organisation_invitations
        WHERE organisation_id = organisation_members.organisation_id
          AND email = public.get_user_email()
          AND status = 'pending'
      )
      OR
      -- Management: an existing owner/manager is adding this member
      public.can_manage_org(organisation_id)
    )
  );

-- Update: Only owners can change roles
DROP POLICY IF EXISTS "org_members_update_owner" ON organisation_members;
CREATE POLICY "org_members_update_owner" ON organisation_members
  FOR UPDATE TO authenticated
  USING (public.is_org_owner(organisation_id))
  WITH CHECK (public.is_org_owner(organisation_id));

-- Delete: Owner/manager can remove members. Members can leave (delete own row).
DROP POLICY IF EXISTS "org_members_delete" ON organisation_members;
CREATE POLICY "org_members_delete" ON organisation_members
  FOR DELETE TO authenticated
  USING (
    public.can_manage_org(organisation_id)
    OR user_id = user_id()
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: organisation_invitations
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE organisation_invitations ENABLE ROW LEVEL SECURITY;

-- Read: Two access paths
--   a) Org members can see all invitations for their org
--   b) Invited users can ONLY see their own pending invitations
DROP POLICY IF EXISTS "org_invitations_select" ON organisation_invitations;
CREATE POLICY "org_invitations_select" ON organisation_invitations
  FOR SELECT TO authenticated
  USING (
    public.is_member_of_org(organisation_id)
    OR (
      status = 'pending'
      AND email = public.get_user_email()
    )
  );

-- Insert: Only owner/manager can create invitations
DROP POLICY IF EXISTS "org_invitations_insert" ON organisation_invitations;
CREATE POLICY "org_invitations_insert" ON organisation_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_org(organisation_id));

-- Update: Owner/manager can revoke or resend; invited user can accept
DROP POLICY IF EXISTS "org_invitations_update" ON organisation_invitations;
CREATE POLICY "org_invitations_update" ON organisation_invitations
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_org(organisation_id)
    OR (
      status = 'pending'
      AND email = public.get_user_email()
    )
  )
  WITH CHECK (
    public.can_manage_org(organisation_id)
    OR (
      status = 'pending'
      AND email = public.get_user_email()
    )
  );

-- Delete: Only owner/manager can delete invitations
DROP POLICY IF EXISTS "org_invitations_delete" ON organisation_invitations;
CREATE POLICY "org_invitations_delete" ON organisation_invitations
  FOR DELETE TO authenticated
  USING (public.can_manage_org(organisation_id));

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: absences
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "absences_select_org" ON absences;
CREATE POLICY "absences_select_org" ON absences
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "absences_insert_own" ON absences;
CREATE POLICY "absences_insert_own" ON absences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND organisation_id = public.get_user_organisation_id()
  );

DROP POLICY IF EXISTS "absences_update" ON absences;
CREATE POLICY "absences_update" ON absences
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "absences_delete_own" ON absences;
CREATE POLICY "absences_delete_own" ON absences
  FOR DELETE TO authenticated
  USING (user_id = user_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: staff_members
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_org" ON staff_members;
CREATE POLICY "staff_select_org" ON staff_members
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "staff_insert_own" ON staff_members;
CREATE POLICY "staff_insert_own" ON staff_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND organisation_id = public.get_user_organisation_id()
  );

DROP POLICY IF EXISTS "staff_update" ON staff_members;
CREATE POLICY "staff_update" ON staff_members
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "staff_delete_own" ON staff_members;
CREATE POLICY "staff_delete_own" ON staff_members
  FOR DELETE TO authenticated
  USING (user_id = user_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: calendar_events
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_select_org" ON calendar_events;
CREATE POLICY "calendar_select_org" ON calendar_events
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "calendar_insert_own" ON calendar_events;
CREATE POLICY "calendar_insert_own" ON calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND organisation_id = public.get_user_organisation_id()
  );

DROP POLICY IF EXISTS "calendar_update" ON calendar_events;
CREATE POLICY "calendar_update" ON calendar_events
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "calendar_delete_own" ON calendar_events;
CREATE POLICY "calendar_delete_own" ON calendar_events
  FOR DELETE TO authenticated
  USING (user_id = user_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: notes
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notes_select_org" ON notes;
CREATE POLICY "notes_select_org" ON notes
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "notes_insert_own" ON notes;
CREATE POLICY "notes_insert_own" ON notes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND organisation_id = public.get_user_organisation_id()
  );

DROP POLICY IF EXISTS "notes_update" ON notes;
CREATE POLICY "notes_update" ON notes
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "notes_delete_own" ON notes;
CREATE POLICY "notes_delete_own" ON notes
  FOR DELETE TO authenticated
  USING (user_id = user_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: reminders
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders_select_org" ON reminders;
CREATE POLICY "reminders_select_org" ON reminders
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "reminders_insert_own" ON reminders;
CREATE POLICY "reminders_insert_own" ON reminders
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND organisation_id = public.get_user_organisation_id()
  );

DROP POLICY IF EXISTS "reminders_update" ON reminders;
CREATE POLICY "reminders_update" ON reminders
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "reminders_delete_own" ON reminders;
CREATE POLICY "reminders_delete_own" ON reminders
  FOR DELETE TO authenticated
  USING (user_id = user_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: departments
-- ═════════════════════════════════════════════════════════════════════════════

-- ⚠️  Drop pre-existing weak policies that allow reading/creating ALL departments
DROP POLICY IF EXISTS "Authenticated users can read departments" ON departments;
DROP POLICY IF EXISTS "Users can create departments" ON departments;

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "departments_select_org" ON departments;
CREATE POLICY "departments_select_org" ON departments
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "departments_insert_org" ON departments;
CREATE POLICY "departments_insert_org" ON departments
  FOR INSERT TO authenticated
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "departments_update" ON departments;
CREATE POLICY "departments_update" ON departments
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "departments_delete" ON departments;
CREATE POLICY "departments_delete" ON departments
  FOR DELETE TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: notification_preferences
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_select_own" ON notification_preferences;
CREATE POLICY "notif_prefs_select_own" ON notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = user_id());

DROP POLICY IF EXISTS "notif_prefs_insert_own" ON notification_preferences;
CREATE POLICY "notif_prefs_insert_own" ON notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND organisation_id = public.get_user_organisation_id()
  );

DROP POLICY IF EXISTS "notif_prefs_update_own" ON notification_preferences;
CREATE POLICY "notif_prefs_update_own" ON notification_preferences
  FOR UPDATE TO authenticated
  USING (user_id = user_id())
  WITH CHECK (
    user_id = user_id()
    AND organisation_id = public.get_user_organisation_id()
  );

DROP POLICY IF EXISTS "notif_prefs_delete_own" ON notification_preferences;
CREATE POLICY "notif_prefs_delete_own" ON notification_preferences
  FOR DELETE TO authenticated
  USING (user_id = user_id());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: audit_logs
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_org" ON audit_logs;
CREATE POLICY "audit_logs_select_org" ON audit_logs
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

DROP POLICY IF EXISTS "audit_logs_insert_own" ON audit_logs;
CREATE POLICY "audit_logs_insert_own" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = user_id()
    AND organisation_id = public.get_user_organisation_id()
  );

COMMIT;
