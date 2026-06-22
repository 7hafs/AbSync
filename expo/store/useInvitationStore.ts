/**
 * Invitation store — manages organisation invitations for the admin UI.
 *
 * Responsibilities:
 * - Fetch pending invitations for the current organisation
 * - Create new invitations (email + role)
 * - Revoke and resend invitations
 *
 * This store is NOT persisted to AsyncStorage — it fetches fresh from
 * Supabase on every load.
 */
import { create } from "zustand";
import {
  fetchPendingInvitations,
  createInvitation,
  revokeInvitation,
  resendInvitation,
  InvitationRow,
} from "@/lib/dataService";

export type Invitation = InvitationRow;

export interface InvitationState {
  /** All pending invitations for the current organisation. */
  invitations: Invitation[];
  /** True while the initial fetch is in progress. */
  isLoading: boolean;
  /** Non-null when a fetch error occurs. */
  error: string | null;
  /** True while a create/revoke/resend operation is in progress. */
  isProcessing: boolean;
  /** The last operation's result message (success or error). */
  lastMessage: string | null;

  /** Fetch all pending invitations for an organisation. */
  loadInvitations: (orgId: string) => Promise<void>;
  /** Create a new invitation. Returns success message or throws. */
  inviteMember: (
    orgId: string,
    email: string,
    role: string,
    invitedByUserId: string
  ) => Promise<string | null>;
  /** Revoke a pending invitation. */
  revoke: (invitationId: string) => Promise<boolean>;
  /** Resend an invitation (extend expiry). */
  resend: (invitationId: string) => Promise<boolean>;
  /** Reset the store (e.g. on sign-out). */
  reset: () => void;
  /** Clear the last message. */
  clearMessage: () => void;
}

export const useInvitationStore = create<InvitationState>((set, get) => ({
  invitations: [],
  isLoading: false,
  error: null,
  isProcessing: false,
  lastMessage: null,

  loadInvitations: async (orgId: string) => {
    set({ isLoading: true, error: null });
    try {
      const invitations = await fetchPendingInvitations(orgId);
      set({ invitations, isLoading: false, error: null });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load invitations";
      console.error("[useInvitationStore] loadInvitations error:", message);
      set({ isLoading: false, error: message });
    }
  },

  inviteMember: async (orgId, email, role, invitedByUserId) => {
    set({ isProcessing: true, lastMessage: null });
    try {
      const { invitation, error } = await createInvitation(
        orgId,
        email,
        role,
        invitedByUserId
      );

      if (error) {
        set({ isProcessing: false, lastMessage: error });
        return error;
      }

      if (invitation) {
        // Prepend to the list
        set((state) => ({
          invitations: [invitation, ...state.invitations],
          isProcessing: false,
          lastMessage: `Invitation sent to ${email}.`,
        }));
        return null;
      }

      set({
        isProcessing: false,
        lastMessage: "Failed to create invitation.",
      });
      return "Failed to create invitation.";
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      console.error("[useInvitationStore] inviteMember error:", message);
      set({ isProcessing: false, lastMessage: message });
      return message;
    }
  },

  revoke: async (invitationId: string) => {
    set({ isProcessing: true, lastMessage: null });
    try {
      const ok = await revokeInvitation(invitationId);
      if (ok) {
        set((state) => ({
          invitations: state.invitations.filter((i) => i.id !== invitationId),
          isProcessing: false,
          lastMessage: "Invitation revoked.",
        }));
      } else {
        set({
          isProcessing: false,
          lastMessage: "Failed to revoke invitation.",
        });
      }
      return ok;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to revoke invitation";
      console.error("[useInvitationStore] revoke error:", message);
      set({ isProcessing: false, lastMessage: message });
      return false;
    }
  },

  resend: async (invitationId: string) => {
    set({ isProcessing: true, lastMessage: null });
    try {
      const ok = await resendInvitation(invitationId);
      if (ok) {
        // Update the expiry date locally
        const newExpiry = new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();
        set((state) => ({
          invitations: state.invitations.map((i) =>
            i.id === invitationId ? { ...i, expires_at: newExpiry } : i
          ),
          isProcessing: false,
          lastMessage: "Invitation expiry extended by 7 days.",
        }));
      } else {
        set({
          isProcessing: false,
          lastMessage: "Failed to resend invitation.",
        });
      }
      return ok;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resend invitation";
      console.error("[useInvitationStore] resend error:", message);
      set({ isProcessing: false, lastMessage: message });
      return false;
    }
  },

  reset: () => {
    set({
      invitations: [],
      isLoading: false,
      error: null,
      isProcessing: false,
      lastMessage: null,
    });
  },

  clearMessage: () => {
    set({ lastMessage: null });
  },
}));
