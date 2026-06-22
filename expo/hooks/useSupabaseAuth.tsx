/**
 * Supabase Auth provider and hook for email+password authentication.
 *
 * Provides:
 * - Email/password sign-up with automatic profile creation
 * - Email/password sign-in
 * - Password reset (forgot password)
 * - Sign-out
 * - Session persistence via SecureStore (survives app restart/update/reinstall)
 * - User profile (name + email) in state
 *
 * Usage:
 *   Wrap your root layout in <AuthProvider>.
 *   Use useSupabaseAuth() in any component to access auth state and methods.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { supabase, getAuthRedirectUrl } from "@/lib/supabase";
import { Session, User } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthProfile {
  id: string;
  name: string | null;
  email: string | null;
}

export interface AuthState {
  /** True while initial session is being restored from SecureStore */
  isLoading: boolean;
  /** The current Supabase session, or null if not signed in */
  session: Session | null;
  /** The current Supabase user, or null if not signed in */
  user: User | null;
  /** The user's profile (name + email) from the profiles table */
  profile: AuthProfile | null;
  /** True when an auth operation (login/register) is in progress */
  isProcessing: boolean;

  /** Sign up with email + password. Returns error message or null on success. */
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  /** Sign in with email + password. Returns error message or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  /** Send a password reset email. Returns error message or null on success. */
  forgotPassword: (email: string) => Promise<string | null>;
  /** Sign out and clear session. */
  signOut: () => Promise<void>;
  /** Refresh the profile from the database. */
  refreshProfile: () => Promise<void>;
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ── Profile helpers ──────────────────────────────────────────────────────

  const fetchProfile = useCallback(async (userId: string): Promise<AuthProfile | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, email")
      .eq("id", userId)
      .single();

    if (error || !data) {
      console.log("[auth] Profile not found for user:", userId);
      return null;
    }

    return data as AuthProfile;
  }, []);

  const ensureProfile = useCallback(
    async (userId: string, email?: string, name?: string): Promise<AuthProfile | null> => {
      // First try to fetch existing profile
      let prof = await fetchProfile(userId);
      if (prof) return prof;

      // Create a new profile
      const { data, error } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: email ?? null,
          name: name ?? null,
          access_level: "owner",
        })
        .select("id, name, email")
        .single();

      if (error) {
        console.error("[auth] Failed to create profile:", error.message);
        return null;
      }

      return data as AuthProfile;
    },
    [fetchProfile]
  );

  // ── Session listener ─────────────────────────────────────────────────────

  useEffect(() => {
    const mountTime = Date.now();
    console.log("[auth:session] AuthProvider mounted — starting getSession()...");

    // Safety timeout: if getSession() hangs (e.g. network token refresh
    // for an expired session), force isLoading to false after 8 seconds
    // so the user doesn't see a permanent white screen.
    const loadingTimeout = setTimeout(() => {
      setIsLoading((prev) => {
        if (prev) {
          const elapsed = Date.now() - mountTime;
          console.warn(`[auth:session] getSession TIMED OUT after ${elapsed}ms — forcing isLoading=false`);
          return false;
        }
        return prev;
      });
    }, 8000);

    // On mount, get the current session (restored from SecureStore)
    supabase.auth.getSession().then(({ data: { session: currentSession }, error: sessionErr }) => {
      const elapsed = Date.now() - mountTime;
      clearTimeout(loadingTimeout);

      if (sessionErr) {
        console.warn(`[auth:session] getSession returned error after ${elapsed}ms:`, sessionErr.message);
      }

      console.log(`[auth:session] getSession resolved in ${elapsed}ms — hasSession:`, !!currentSession);
      if (currentSession) {
        console.log("[auth:session] Existing session user ID:", currentSession.user.id);
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      console.log("[auth:session] Setting isLoading → false");
      setIsLoading(false);

      if (currentSession?.user) {
        fetchProfile(currentSession.user.id).then((prof) => {
          console.log("[auth:session] Profile fetched:", !!prof);
          setProfile(prof);
        });
      }
    }).catch((err) => {
      const elapsed = Date.now() - mountTime;
      console.error(`[auth:session] getSession THREW after ${elapsed}ms:`, err);
      clearTimeout(loadingTimeout);
      console.log("[auth:session] Setting isLoading → false (catch)");
      setIsLoading(false);
    });

    // Listen for auth state changes (sign in, sign out, token refresh)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        console.log("[auth:session] onAuthStateChange:", event, "hasSession:", !!newSession);
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (event === "SIGNED_IN" && newSession?.user) {
          console.log("[auth:session] SIGNED_IN — ensuring profile for user:", newSession.user.id);
          const prof = await ensureProfile(
            newSession.user.id,
            newSession.user.email,
            newSession.user.user_metadata?.name as string | undefined
          );
          console.log("[auth:session] Profile after SIGNED_IN:", !!prof);
          setProfile(prof);
        }

        if (event === "SIGNED_OUT") {
          console.log("[auth:session] SIGNED_OUT — clearing profile");
          setProfile(null);
        }

        if (event === "TOKEN_REFRESHED") {
          console.log("[auth:session] TOKEN_REFRESHED");
        }

        if (event === "USER_UPDATED") {
          console.log("[auth:session] USER_UPDATED");
        }
      }
    );

    return () => {
      console.log("[auth:session] AuthProvider unmounting — unsubscribing listener");
      authListener.subscription.unsubscribe();
    };
  }, [fetchProfile, ensureProfile]);

  // ── Auth methods ─────────────────────────────────────────────────────────

  const signUp = useCallback(
    async (email: string, password: string, name: string): Promise<string | null> => {
      setIsProcessing(true);
      try {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
          },
        });

        if (error) {
          console.error("[auth] Sign-up error:", error.message);
          return error.message;
        }

        // Profile will be created automatically by the onAuthStateChange listener
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unknown error occurred";
        console.error("[auth] Sign-up exception:", message);
        return message;
      } finally {
        setIsProcessing(false);
      }
    },

    []
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      setIsProcessing(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error("[auth] Sign-in error:", error.message);
          return error.message;
        }

        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unknown error occurred";
        console.error("[auth] Sign-in exception:", message);
        return message;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const forgotPassword = useCallback(
    async (email: string): Promise<string | null> => {
      setIsProcessing(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getAuthRedirectUrl(),
        });

        if (error) {
          console.error("[auth] Forgot password error:", error.message);
          return error.message;
        }

        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unknown error occurred";
        console.error("[auth] Forgot password exception:", message);
        return message;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const signOut = useCallback(async () => {
    setIsProcessing(true);
    try {
      await supabase.auth.signOut();
      setProfile(null);
    } catch (err) {
      console.error("[auth] Sign-out error:", err);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const prof = await fetchProfile(user.id);
    if (prof) setProfile(prof);
  }, [user, fetchProfile]);

  // ── Context value ────────────────────────────────────────────────────────

  const value = useMemo<AuthState>(
    () => ({
      isLoading,
      session,
      user,
      profile,
      isProcessing,
      signUp,
      signIn,
      forgotPassword,
      signOut,
      refreshProfile,
    }),
    [isLoading, session, user, profile, isProcessing, signUp, signIn, forgotPassword, signOut, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSupabaseAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useSupabaseAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
