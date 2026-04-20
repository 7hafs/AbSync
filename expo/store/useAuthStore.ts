import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthUser, CalendarAccessLevel } from "@/types";

interface SignInInput {
  name: string;
  email: string;
  workspaceId?: string;
  accessLevel?: CalendarAccessLevel;
}

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (input: SignInInput) => void;
  signOut: () => void;
}

const defaultWorkspaceId = "personal-workspace";

const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      signIn: ({ name, email, workspaceId, accessLevel }) => {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim().toLowerCase();
        const user: AuthUser = {
          id: `${trimmedEmail}-${Date.now()}`,
          name: trimmedName,
          email: trimmedEmail,
          workspaceId: workspaceId ?? defaultWorkspaceId,
          accessLevel: accessLevel ?? "owner",
          joinedAt: new Date().toISOString(),
        };

        console.log("[useAuthStore] Signing in user", {
          email: user.email,
          workspaceId: user.workspaceId,
          accessLevel: user.accessLevel,
        });

        set({ user, isAuthenticated: true });
      },
      signOut: () => {
        console.log("[useAuthStore] Signing out current user");
        set({ user: null, isAuthenticated: false });
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useAuthStore;
