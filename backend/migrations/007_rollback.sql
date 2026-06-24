-- Rollback for migration 007: restore the original org_members_insert policy

BEGIN;

DROP POLICY IF EXISTS "org_members_insert_self" ON organisation_members;
DROP POLICY IF EXISTS "org_members_insert_managed" ON organisation_members;

-- Restore the original combined policy
CREATE POLICY "org_members_insert" ON organisation_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      EXISTS (
        SELECT 1 FROM public.organisations
        WHERE id = organisation_id AND owner_id = auth.uid()
      )
      OR
      EXISTS (
        SELECT 1 FROM public.organisation_invitations
        WHERE organisation_id = organisation_members.organisation_id
          AND email = public.get_user_email()
          AND status = 'pending'
      )
      OR
      public.can_manage_org(organisation_id)
    )
  );

COMMIT;
