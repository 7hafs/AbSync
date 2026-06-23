/**
 * Role-based permission helpers for Organisation Management.
 *
 * All functions are pure — they take a role string and return a boolean.
 * Use the `useOrganisationRole` hook to get the current user's role,
 * then call these helpers to gate UI elements and actions.
 */

/** Valid roles in the organisation system. */
export type OrganisationRole = "owner" | "manager" | "staff";

/** Map role string to a display label. */
export const ROLE_LABEL: Record<OrganisationRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

/** Map role string to a display colour (hex). */
export const ROLE_COLOR: Record<OrganisationRole, string> = {
  owner: "#0F766E",
  manager: "#6366F1",
  staff: "#64748B",
};

/**
 * Returns true if the given role string represents a valid organisation role.
 * Useful for type-narrowing unknown strings from the database.
 */
export function isValidRole(role: string | null | undefined): role is OrganisationRole {
  return role === "owner" || role === "manager" || role === "staff";
}

// ── Role checks ────────────────────────────────────────────────────────────

/** The user is the organisation owner. */
export function isOwner(role: string | null | undefined): boolean {
  return role === "owner";
}

/** The user is a manager (or owner — owner inherits manager perms). */
export function isManager(role: string | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/** The user is a staff member with no management privileges. */
export function isStaff(role: string | null | undefined): boolean {
  return role === "staff";
}

// ── Permission checks ──────────────────────────────────────────────────────

/** User can invite new members to the organisation. */
export function canInvite(role: string | null | undefined): boolean {
  return isManager(role);
}

/** User can approve or reject absence requests. */
export function canApproveAbsences(role: string | null | undefined): boolean {
  return isManager(role);
}

/** User can manage members (promote, demote, remove). */
export function canManageMembers(role: string | null | undefined): boolean {
  return isOwner(role);
}

/** User can edit organisation settings (name, etc.). */
export function canEditOrganisation(role: string | null | undefined): boolean {
  return isOwner(role);
}

/** User can view organisation settings (all roles can view). */
export function canViewOrganisation(role: string | null | undefined): boolean {
  return role != null;
}

/** User can manage staff records (add, edit, archive). */
export function canManageStaff(role: string | null | undefined): boolean {
  return isManager(role);
}

/** User can create absence requests (all members can). */
export function canCreateAbsences(_role: string | null | undefined): boolean {
  return true;
}
