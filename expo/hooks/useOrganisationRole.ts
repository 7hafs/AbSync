/**
 * Hook that derives the current user's role in their organisation
 * from the members list in useOrganisationStore.
 *
 * Usage:
 *   const { role, isOwner, canInvite, canApproveAbsences } = useOrganisationRole();
 *
 *   if (!canInvite) return null; // hide invite button
 *
 * The role is `null` while the members list is still loading.
 */
import { useMemo } from "react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useOrganisationStore } from "@/store/useOrganisationStore";
import {
  OrganisationRole,
  isValidRole,
  isOwner as checkIsOwner,
  isManager as checkIsManager,
  isStaff as checkIsStaff,
  canInvite as checkCanInvite,
  canApproveAbsences as checkCanApproveAbsences,
  canManageMembers as checkCanManageMembers,
  canEditOrganisation as checkCanEditOrganisation,
  canViewOrganisation as checkCanViewOrganisation,
  canManageStaff as checkCanManageStaff,
  canCreateAbsences as checkCanCreateAbsences,
} from "@/lib/roles";

export interface OrganisationRoleInfo {
  /** The current user's role in the organisation, or null if still loading / no org. */
  role: OrganisationRole | null;
  /** True while the members list is loading. */
  isLoading: boolean;

  // ── Role queries ─────────────────────────────────────────────────────────
  isOwner: boolean;
  isManager: boolean;
  isStaff: boolean;

  // ── Permission queries ───────────────────────────────────────────────────
  canInvite: boolean;
  canApproveAbsences: boolean;
  canManageMembers: boolean;
  canEditOrganisation: boolean;
  canViewOrganisation: boolean;
  canManageStaff: boolean;
  canCreateAbsences: boolean;
}

/**
 * Derive the current user's organisation role from the members list.
 * Returns `null` role while loading, and all permission checks default
 * to `false` until the role is known.
 */
export function useOrganisationRole(): OrganisationRoleInfo {
  const { profile } = useSupabaseAuth();
  const { members, isLoading } = useOrganisationStore();

  const role: OrganisationRole | null = useMemo(() => {
    if (!profile?.id || members.length === 0) return null;
    const membership = members.find((m) => m.user_id === profile.id);
    if (!membership) return null;
    return isValidRole(membership.role) ? membership.role : null;
  }, [profile?.id, members]);

  return useMemo(
    () => ({
      role,
      isLoading: isLoading || (!role && members.length === 0 && isLoading),

      isOwner: checkIsOwner(role),
      isManager: checkIsManager(role),
      isStaff: checkIsStaff(role),

      canInvite: checkCanInvite(role),
      canApproveAbsences: checkCanApproveAbsences(role),
      canManageMembers: checkCanManageMembers(role),
      canEditOrganisation: checkCanEditOrganisation(role),
      canViewOrganisation: checkCanViewOrganisation(role),
      canManageStaff: checkCanManageStaff(role),
      canCreateAbsences: checkCanCreateAbsences(role),
    }),
    [role, isLoading, members.length]
  );
}
