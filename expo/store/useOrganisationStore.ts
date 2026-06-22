/**
 * Organisation store — holds the current user's organisation details
 * and member list for the Organisation Management UI.
 *
 * This store is NOT cached to AsyncStorage; it fetches fresh from
 * Supabase on every load so the owner always sees the latest state.
 */
import { create } from "zustand";
import {
  fetchOrganisation,
  fetchOrganisationMembers,
  updateOrganisationName,
  OrganisationRow,
  OrganisationMemberRow,
} from "@/lib/dataService";

export type MemberInfo = OrganisationMemberRow;

export interface OrganisationState {
  /** The organisation record from the organisations table. */
  organisation: OrganisationRow | null;
  /** All members of this organisation (includes profile name/email). */
  members: MemberInfo[];
  /** True while the initial fetch is in progress. */
  isLoading: boolean;
  /** Non-null when a fetch or update error occurs. */
  error: string | null;
  /** True while a name update is in progress. */
  isSaving: boolean;

  /** Fetch organisation + members for the given org ID. */
  loadOrganisation: (orgId: string) => Promise<void>;
  /** Update the organisation name locally and on the server. */
  updateName: (orgId: string, name: string) => Promise<boolean>;
  /** Reset the store (e.g. on sign-out). */
  reset: () => void;
}

export const useOrganisationStore = create<OrganisationState>((set, get) => ({
  organisation: null,
  members: [],
  isLoading: false,
  error: null,
  isSaving: false,

  loadOrganisation: async (orgId: string) => {
    set({ isLoading: true, error: null });
    try {
      const [org, members] = await Promise.all([
        fetchOrganisation(orgId),
        fetchOrganisationMembers(orgId),
      ]);

      if (!org) {
        set({
          isLoading: false,
          error: "Organisation not found. It may have been deleted.",
          organisation: null,
          members: [],
        });
        return;
      }

      set({
        organisation: org,
        members,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load organisation";
      console.error("[useOrganisationStore] loadOrganisation error:", message);
      set({
        isLoading: false,
        error: message,
      });
    }
  },

  updateName: async (orgId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;
    if (trimmed === get().organisation?.name) return true;

    set({ isSaving: true });
    try {
      const ok = await updateOrganisationName(orgId, trimmed);
      if (ok) {
        set((state) => ({
          isSaving: false,
          organisation: state.organisation
            ? { ...state.organisation, name: trimmed }
            : null,
        }));
      } else {
        set({ isSaving: false, error: "Failed to save name. Please try again." });
      }
      return ok;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update name";
      console.error("[useOrganisationStore] updateName error:", message);
      set({ isSaving: false, error: message });
      return false;
    }
  },

  reset: () => {
    set({
      organisation: null,
      members: [],
      isLoading: false,
      error: null,
      isSaving: false,
    });
  },
}));
