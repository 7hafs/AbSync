import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { supabase, syncProfile } from "@/lib/supabase";
import useAuthStore from "@/store/useAuthStore";
import type { Session, User, AuthError } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  isSigningIn: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  clearError: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toAuthUser(supabaseUser: User): AuthUser {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? "",
    name: supabaseUser.user_metadata?.name ?? supabaseUser.email ?? undefined,
  };
}

function friendlyAuthMessage(error: AuthError): string {
  switch (error.message) {
    case "Invalid login credentials":
      return "Incorrect email or password. Please try again.";
    case "User already registered":
      return "An account with this email already exists.";
    case "Email not confirmed":
      return "Please check your email and confirm your address before signing in.";
    case "Password should be at least 6 characters":
      return "Password must be at least 6 characters.";
    default:
      if (error.message.includes("rate limit")) {
        return "Too many attempts. Please wait a moment and try again.";
      }
      return error.message;
  }
}

// ── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authStore = useAuthStore();

  function clearError() {
    setError(null);
  }

  // On mount, check for existing Supabase session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      if (existingSession?.user) {
        const authUser = toAuthUser(existingSession.user);
        setUser(authUser);
        setSession(existingSession);
      }
      setIsLoading(false);
    });

    // Listen for auth state changes (sign in, sign out, token refresh)
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        if (newSession?.user) {
          const authUser = toAuthUser(newSession.user);
          setUser(authUser);
          setSession(newSession);
        } else {
          setUser(null);
          setSession(null);
        }
        setIsLoading(false);
      }
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Sync Supabase auth user with local auth store for the rest of the app
  useEffect(() => {
    if (user && !authStore.isAuthenticated) {
      authStore.signIn({
        id: user.id,
        name: user.name,
        email: user.email,
      });

      // Sync profile row in Supabase
      syncProfile({
        id: user.id,
        email: user.email,
        name: user.name,
      });
    }

    if (!user && authStore.isAuthenticated) {
      authStore.signOut();
    }
  }, [user]);

  async function signIn(email: string, password: string): Promise<void> {
    setIsSigningIn(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        setError(friendlyAuthMessage(signInError));
      }
      // onAuthStateChange will handle setting user state
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function signUp(
    name: string,
    email: string,
    password: string
  ): Promise<void> {
    setIsSigningIn(true);
    setError(null);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { name: name.trim() },
        },
      });

      if (signUpError) {
        setError(friendlyAuthMessage(signUpError));
      }
      // onAuthStateChange will handle setting user state
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function signOut(): Promise<void> {
    setError(null);
    try {
      await supabase.auth.signOut();
      authStore.signOut();
      setUser(null);
      setSession(null);
    } catch (err) {
      console.error("[useSupabaseAuth] Sign out error:", err);
    }
  }

  async function resetPassword(email: string): Promise<void> {
    setError(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        {
          redirectTo: "absflow://reset-password",
        }
      );

      if (resetError) {
        setError(friendlyAuthMessage(resetError));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Password reset request failed"
      );
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        isSigningIn,
        error,
        signIn,
        signUp,
        signOut,
        resetPassword,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error(
      "useSupabaseAuth must be used within SupabaseAuthProvider"
    );
  }
  return context;
}
