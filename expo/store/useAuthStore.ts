import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthUser as AppUser } from "@/types";

/**
 * Local auth state store.
 *
 * This store is the bridge between Supabase Auth (hooks/useSupabaseAuth.tsx)
 * and the rest of the app. The Supabase-backed data layer uses
 * the Supabase Auth user ID for RLS-scoped queries.
 *
 * The email field acts as the unique human-readable account identifier.
 * The id field is the stable Supabase Auth user UUID.
 *
 * Sign out only clears the session — never deletes data from Supabase.
 */

interface SignInInput {
  id: string;
  name?: string;
  email: string;
}

interface AuthState {
  user: AppUser | null;
  isAuthenticated: boolean;
  signIn: (input: SignInInput) => void;
  signOut: () => void;
  updateUser: (user: AppUser) => void;
}

const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      signIn: ({ id, name, email }) => {
        const user: AppUser = {
          id,
          name: name ?? email,
          email: email.toLowerCase().trim(),
          workspaceId: "personal-workspace",
          accessLevel: "owner",
          joinedAt: new Date().toISOString(),
        };

        console.log("[useAuthStore] User signed in", {
          id: user.id,
          email: user.email,
        });

        set({ user, isAuthenticated: true });
      },
      signOut: () => {
        console.log("[useAuthStore] Signing out — data preserved in Supabase");
        set({ user: null, isAuthenticated: false });
      },
      updateUser: (user) => {
        set({ user, isAuthenticated: true });
      },
    }),
    {
      name: "auth-storage-v2",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist the user identity, not full auth state
      partialize: (state) => ({
        user: state.user
          ? {
              id: state.user.id,
              name: state.user.name,
              email: state.user.email,
              workspaceId: state.user.workspaceId,
              accessLevel: state.user.accessLevel,
              joinedAt: state.user.joinedAt,
            }
          : null,
      }),
    }
  )
);

export default useAuthStore;
