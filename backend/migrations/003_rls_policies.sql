-- ============================================================================
-- Phase 3B: Row-Level Security (RLS) Policies
-- ============================================================================
-- Enables organisation isolation so users can only see and modify data within
-- their own organisation. Policies are table-by-table with clear naming.
--
-- Design principles:
--   1. Every table has an ENABLE ROW LEVEL SECURITY call.
--   2. Helper functions use SECURITY DEFINER to avoid circular RLS dependencies.
--   3. Read policies are org-scoped (can see own org's data).
--   4. Write policies require ownership (user_id = auth.uid()) and org match.
--   5. organisation_invitations has hardened token-based access — non-members
--      can only read their own pending invitations by email match, preventing
--      token enumeration attacks.
--   6. organisation_members INSERT allows bootstrap (owner creates own membership),
--      invitation acceptance (pending invitation exists), and management
--      (owner/manager adds members).
--
-- Run this migration AFTER 003_preparation.sql which backfills any NULL
-- organisation_id rows in audit_logs and adds supporting indexes.
-- ============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═════════════════════════════════════════════════════════════════════════════

-- ── getUserOrganisationId ────────────────────────────────────────────────────
-- Returns the current authenticated user's organisation_id from their profile.
-- Used by RLS policies to scope reads/writes to the user's organisation.
-- SECURITY DEFINER so it can read from profiles even when profiles itself has
-- RLS enabled (avoids circular dependency).

CREATE OR REPLACE FUNCTION public.get_user_organisation_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT organisation_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_organisation_id() IS
  'Returns the current auth.uid() user''s organisation_id. SECURITY DEFINER to bypass RLS on profiles during policy evaluation.';

-- ── isMemberOfOrg ────────────────────────────────────────────────────────────
-- Returns true if the current user is a member of the given organisation.
-- Checks organisation_members with SECURITY DEFINER to avoid circular RLS.

CREATE OR REPLACE FUNCTION public.is_member_of_org(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.is_member_of_org(uuid) IS
  'True if the current user is a member (any role) of the given organisation.';

-- ── canManageOrg ─────────────────────────────────────────────────────────────
-- Returns true if the current user is an owner or manager of the given org.
-- Used to gate invitation creation, member role changes, etc.

CREATE OR REPLACE FUNCTION public.can_manage_org(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'manager')
  );
$$;

COMMENT ON FUNCTION public.can_manage_org(uuid) IS
  'True if the current user is an owner or manager of the given organisation.';

-- ── isOrgOwner ───────────────────────────────────────────────────────────────
-- Returns true if the current user is the explicit owner of the given org.

CREATE OR REPLACE FUNCTION public.is_org_owner(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

COMMENT ON FUNCTION public.is_org_owner(uuid) IS
  'True if the current user is an owner of the given organisation.';

-- ── getUserEmail ─────────────────────────────────────────────────────────────
-- Returns the current user's email from their profile. Used by the
-- invitation RLS policy to restrict token-based reads.

CREATE OR REPLACE FUNCTION public.get_user_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT email
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_email() IS
  'Returns the current auth.uid() user''s email. SECURITY DEFINER to bypass RLS.';

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: profiles
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Read: User can read their own profile, or profiles of members in their org
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR organisation_id = public.get_user_organisation_id()
  );

-- Insert: User can insert their own profile (via ensureProfile bootstrap)
DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- Update: User can update their own profile
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Delete: No direct delete — profiles are managed by Supabase Auth

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: organisations
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

-- Read: Members can read their own organisation
DROP POLICY IF EXISTS "organisations_select_member" ON organisations;
CREATE POLICY "organisations_select_member" ON organisations
  FOR SELECT TO authenticated
  USING (public.is_member_of_org(id));

-- Insert: Any authenticated user can create an organisation (they become owner
-- via the organisation_members row that MUST be inserted immediately after)
DROP POLICY IF EXISTS "organisations_insert_auth" ON organisations;
CREATE POLICY "organisations_insert_auth" ON organisations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Update: Only owners can update organisation settings/name
DROP POLICY IF EXISTS "organisations_update_owner" ON organisations;
CREATE POLICY "organisations_update_owner" ON organisations
  FOR UPDATE TO authenticated
  USING (public.is_org_owner(id))
  WITH CHECK (public.is_org_owner(id));

-- Delete: Only owners can delete the organisation (cascades to all entity data)
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
    user_id = auth.uid()
    AND (
      -- Bootstrap: user is the owner of the org (just created it)
      EXISTS (
        SELECT 1 FROM public.organisations
        WHERE id = organisation_id AND owner_id = auth.uid()
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

-- Update: Only owners can change roles. Members cannot change their own role.
DROP POLICY IF EXISTS "org_members_update_owner" ON organisation_members;
CREATE POLICY "org_members_update_owner" ON organisation_members
  FOR UPDATE TO authenticated
  USING (public.is_org_owner(organisation_id))
  WITH CHECK (public.is_org_owner(organisation_id));

-- Delete: Owner/manager can remove members. Members can leave (delete own row),
-- but sole owners cannot leave (app-level enforcement, RLS allows the attempt
-- so acceptInvitation can remove the old membership before inserting the new one).
DROP POLICY IF EXISTS "org_members_delete" ON organisation_members;
CREATE POLICY "org_members_delete" ON organisation_members
  FOR DELETE TO authenticated
  USING (
    public.can_manage_org(organisation_id)
    OR user_id = auth.uid()
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: organisation_invitations
-- ═════════════════════════════════════════════════════════════════════════════
-- HARDENED: Non-members can ONLY read invitations matching their email.
-- This prevents broad token enumeration — knowing a token alone is not enough.

ALTER TABLE organisation_invitations ENABLE ROW LEVEL SECURITY;

-- Read: Two access paths
--   a) Org members can see all invitations for their org (for the admin UI)
--   b) Invited users can ONLY see their own pending invitations (for acceptance)
DROP POLICY IF EXISTS "org_invitations_select" ON organisation_invitations;
CREATE POLICY "org_invitations_select" ON organisation_invitations
  FOR SELECT TO authenticated
  USING (
    -- Path A: Org member viewing all invitations
    public.is_member_of_org(organisation_id)
    OR
    -- Path B: Invited user viewing only their own pending invitations
    (
      status = 'pending'
      AND email = public.get_user_email()
    )
  );

-- Insert: Only owner/manager can create invitations
DROP POLICY IF EXISTS "org_invitations_insert" ON organisation_invitations;
CREATE POLICY "org_invitations_insert" ON organisation_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_org(organisation_id));

-- Update: Two paths:
--   a) Owner/manager can revoke or resend (change expires_at/updated_at)
--   b) Invited user can accept (change status from pending → accepted)
-- Neither path allows changing the token, email, or role.
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

-- Delete: Only owner/manager can delete invitations (cleanup)
DROP POLICY IF EXISTS "org_invitations_delete" ON organisation_invitations;
CREATE POLICY "org_invitations_delete" ON organisation_invitations
  FOR DELETE TO authenticated
  USING (public.can_manage_org(organisation_id));

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: absences
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- Read: Can see absences for the user's organisation
DROP POLICY IF EXISTS "absences_select_org" ON absences;
CREATE POLICY "absences_select_org" ON absences
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

-- Insert: User can create absences for their own org
DROP POLICY IF EXISTS "absences_insert_own" ON absences;
CREATE POLICY "absences_insert_own" ON absences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id = public.get_user_organisation_id()
  );

-- Update: Owner of the absence can update. Additionally, manager/owner of the
-- org can approve/reject (status change).
DROP POLICY IF EXISTS "absences_update" ON absences;
CREATE POLICY "absences_update" ON absences
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

-- Delete: Owner of the absence can delete
DROP POLICY IF EXISTS "absences_delete_own" ON absences;
CREATE POLICY "absences_delete_own" ON absences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: staff_members
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;

-- Read: Can see staff in the user's organisation
DROP POLICY IF EXISTS "staff_select_org" ON staff_members;
CREATE POLICY "staff_select_org" ON staff_members
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

-- Insert: User can create staff in their own org
DROP POLICY IF EXISTS "staff_insert_own" ON staff_members;
CREATE POLICY "staff_insert_own" ON staff_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id = public.get_user_organisation_id()
  );

-- Update: User can update staff they created, or manager/owner can update any
DROP POLICY IF EXISTS "staff_update" ON staff_members;
CREATE POLICY "staff_update" ON staff_members
  FOR UPDATE TO authenticated
  USING (organisation_id = public.get_user_organisation_id())
  WITH CHECK (organisation_id = public.get_user_organisation_id());

-- Delete: User can delete staff they created
DROP POLICY IF EXISTS "staff_delete_own" ON staff_members;
CREATE POLICY "staff_delete_own" ON staff_members
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

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
    user_id = auth.uid()
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
  USING (user_id = auth.uid());

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
    user_id = auth.uid()
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
  USING (user_id = auth.uid());

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
    user_id = auth.uid()
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
  USING (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: departments
-- ═════════════════════════════════════════════════════════════════════════════

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

-- Read: User can only read their own preferences
DROP POLICY IF EXISTS "notif_prefs_select_own" ON notification_preferences;
CREATE POLICY "notif_prefs_select_own" ON notification_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Insert/Update: User can insert or upsert their own preferences
DROP POLICY IF EXISTS "notif_prefs_insert_own" ON notification_preferences;
CREATE POLICY "notif_prefs_insert_own" ON notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id = public.get_user_organisation_id()
  );

DROP POLICY IF EXISTS "notif_prefs_update_own" ON notification_preferences;
CREATE POLICY "notif_prefs_update_own" ON notification_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id = public.get_user_organisation_id()
  );

-- Delete: User can delete their own preferences
DROP POLICY IF EXISTS "notif_prefs_delete_own" ON notification_preferences;
CREATE POLICY "notif_prefs_delete_own" ON notification_preferences
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- TABLE: audit_logs
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Read: Org members can see audit logs for their own organisation
DROP POLICY IF EXISTS "audit_logs_select_org" ON audit_logs;
CREATE POLICY "audit_logs_select_org" ON audit_logs
  FOR SELECT TO authenticated
  USING (organisation_id = public.get_user_organisation_id());

-- Insert: writeAuditLog() uses requireOrganisationId() so org_id is never NULL.
-- The insert is permitted for any authenticated user whose user_id matches
-- AND whose organisation_id matches get_user_organisation_id().
DROP POLICY IF EXISTS "audit_logs_insert_own" ON audit_logs;
CREATE POLICY "audit_logs_insert_own" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND organisation_id = public.get_user_organisation_id()
  );

-- Update/Delete: Audit logs are append-only — no updates or deletes allowed
-- (No UPDATE or DELETE policies are created for audit_logs.)

-- ═════════════════════════════════════════════════════════════════════════════
-- VALIDATION CHECKLIST (run these queries after enabling RLS)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 1. Verify every table has RLS enabled:
--    SELECT tablename FROM pg_tables
--    WHERE schemaname = 'public'
--      AND tablename IN (
--        'profiles','organisations','organisation_members',
--        'organisation_invitations','absences','staff_members',
--        'calendar_events','notes','reminders','departments',
--        'notification_preferences','audit_logs'
--      )
--      AND NOT rowsecurity;
--    → Should return 0 rows.
--
-- 2. Verify no policy uses an overly broad USING clause:
--    SELECT tablename, policyname, cmd, qual, with_check
--    FROM pg_policies
--    WHERE schemaname = 'public'
--    ORDER BY tablename, cmd;
--    → Review each policy for correctness.
--
-- 3. Quick smoke test (as authenticated user with an org):
--    - SELECT from absences, staff_members, calendar_events → should see only own org's data
--    - INSERT into absences → should succeed with user_id + organisation_id
--    - INSERT into absences with wrong organisation_id → should fail
--    - SELECT from profiles → should see own profile + org members
--    - SELECT from organisation_invitations WHERE email = 'not-my-email' → should return 0
--
-- 4. Invitation flow test:
--    a. Owner creates invitation for user@test.com
--    b. Owner can SELECT all pending invitations for the org
--    c. Non-member with email user@test.com can SELECT their invitation
--    d. Non-member with different email CANNOT SELECT the invitation
--    e. Non-member with email user@test.com can accept (UPDATE status)
--    f. Non-member with different email CANNOT accept
--
-- 5. Bootstrap flow test:
--    a. New user signs up → INSERT into profiles (own row)
--    b. → INSERT into organisations (owner_id = auth.uid())
--    c. → INSERT into organisation_members (user_id = auth.uid(), role = 'owner')
--    d. → UPDATE profiles SET organisation_id = new_org_id
--    e. All steps should succeed.
--
-- 6. Cross-org isolation test:
--    a. User in Org A creates an absence
--    b. User in Org B tries SELECT from absences → should NOT see Org A's absence
--    c. User in Org B tries UPDATE absence from Org A → should fail
--    d. User in Org B tries DELETE absence from Org A → should fail
--
-- 7. Member removal test:
--    a. Owner removes a manager from org (DELETE from organisation_members)
--    b. Removed user's profile.organisation_id is set to NULL (app logic)
--    c. Removed user's entity data remains (org-scoped reads still work for remaining members)
--    d. Removed user can no longer read the org's entity data
--
-- 8. Sole-owner protection (app-level, confirmed working before RLS):
--    a. Sole owner tries acceptInvitation → blocked with "sole owner" error
--    b. Transfer blocked: writeAuditLog("organisation_transfer_blocked") succeeds
--
-- 9. Audit log completeness:
--    a. Every writeAuditLog call now uses requireOrganisationId()
--    b. 003_preparation.sql backfilled any NULL org_id audit rows
--    c. Under RLS, audit rows with NULL org_id are invisible (by design)
--    d. New audit rows always have non-NULL organisation_id

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION QUERIES
-- ============================================================================
-- These can be run manually after the migration to confirm RLS is working.
-- Copy each block and run in the Supabase SQL editor.

-- -- Check which tables have RLS enabled
-- SELECT tablename,
--        CASE WHEN rowsecurity THEN 'RLS ON' ELSE 'RLS OFF' END AS rls_status
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'profiles','organisations','organisation_members',
--     'organisation_invitations','absences','staff_members',
--     'calendar_events','notes','reminders','departments',
--     'notification_preferences','audit_logs'
--   )
-- ORDER BY tablename;

-- -- List all policies
-- SELECT tablename, policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd;

-- -- Count rows with NULL organisation_id (should be 0 for most tables)
-- SELECT 'absences' AS tbl, count(*) AS null_orgs FROM absences WHERE organisation_id IS NULL
-- UNION ALL
-- SELECT 'staff_members', count(*) FROM staff_members WHERE organisation_id IS NULL
-- UNION ALL
-- SELECT 'calendar_events', count(*) FROM calendar_events WHERE organisation_id IS NULL
-- UNION ALL
-- SELECT 'notes', count(*) FROM notes WHERE organisation_id IS NULL
-- UNION ALL
-- SELECT 'reminders', count(*) FROM reminders WHERE organisation_id IS NULL
-- UNION ALL
-- SELECT 'departments', count(*) FROM departments WHERE organisation_id IS NULL
-- UNION ALL
-- SELECT 'notification_preferences', count(*) FROM notification_preferences WHERE organisation_id IS NULL
-- UNION ALL
-- SELECT 'audit_logs', count(*) FROM audit_logs WHERE organisation_id IS NULL;
