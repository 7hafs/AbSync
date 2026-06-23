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
import { autoAcceptInvitations, acceptInvitation } from "@/lib/dataService";
import { Session, User } from "@supabase/supabase-js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AuthProfile {
  id: string;
  name: string | null;
  email: string | null;
  organisationId: string | null;
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
      .select("id, name, email, organisation_id")
      .eq("id", userId)
      .single();

    if (error || !data) {
      console.log("[auth] Profile not found for user:", userId);
      return null;
    }

    const row = data as { id: string; name: string | null; email: string | null; organisation_id: string | null };
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      organisationId: row.organisation_id,
    };
  }, []);

  /**
   * Check for any pending invitation matching this user's email.
   * If found, accept it and return the organisation ID.
   * Returns null if no valid invitation exists.
   */
  const acceptPendingInvitation = useCallback(
    async (userId: string, email: string): Promise<string | null> => {
      try {
        const { data, error } = await supabase
          .from("organisation_invitations")
          .select("token")
          .eq("email", email.toLowerCase().trim())
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1);

        if (error || !data || data.length === 0) {
          return null;
        }

        const token = (data[0] as { token: string }).token;
        console.log("[auth:invite] Found pending invitation for", email, "- accepting");

        const result = await acceptInvitation(token, userId, email);
        if (result.success && result.orgId) {
          console.log("[auth:invite] Accepted invitation - joined org:", result.orgId);
          return result.orgId;
        }

        console.warn("[auth:invite] Failed to accept invitation:", result.error);
        return null;
      } catch (err) {
        console.warn("[auth:invite] Invitation check failed:", err);
        return null;
      }
    },
    []
  );

  /**
   * Create an organisation + membership for a user, then update their
   * profile.organisation_id. Used by both the new-user path and the
   * repair path (when a profile exists but has no organisation).
   *
   * IMPORTANT: Callers MUST check for pending invitations BEFORE
   * calling this to avoid creating orphan organisations.
   *
   * Returns the new organisation ID, or null on failure.
   */
  const bootstrapOrganisation = useCallback(
    async (userId: string, name?: string, email?: string): Promise<string | null> => {
      const orgName = name ?? email ?? "My Organisation";

      // Step A: Create the organisation (profile already exists at this point)
      let organisationId: string | null = null;
      try {
        const { data: org, error: orgError } = await supabase
          .from("organisations")
          .insert({ name: orgName, owner_id: userId })
          .select("id")
          .single();

        if (orgError) {
          console.error("[auth:org] Organisation creation FAILED:", orgError.message, orgError.code);
          return null;
        }
        organisationId = org.id;
        console.log("[auth:org] Organisation created:", organisationId, "name:", orgName);
      } catch (err) {
        console.error("[auth:org] Organisation creation THREW:", err);
        return null;
      }

      // Step B: Create membership row
      try {
        const { error: memberError } = await supabase
          .from("organisation_members")
          .insert({
            organisation_id: organisationId,
            user_id: userId,
            role: "owner",
          });
        if (memberError) {
          console.warn("[auth:membership] Membership creation FAILED:", memberError.message, memberError.code);
          // Non-fatal — membership can be repaired later
        } else {
          console.log("[auth:membership] Membership created: user=", userId, "org=", organisationId, "role=owner");
        }
      } catch (err) {
        console.warn("[auth:membership] Membership creation THREW:", err);
      }

      // Step C: Update profile.organisation_id
      try {
        const { error: updateError } = await supabase
          .from("profiles")
          .update({ organisation_id: organisationId })
          .eq("id", userId);
        if (updateError) {
          console.error("[auth:profile] Update organisation_id FAILED:", updateError.message, updateError.code);
        } else {
          console.log("[auth:profile] Updated organisation_id to:", organisationId);
        }
      } catch (err) {
        console.error("[auth:profile] Update organisation_id THREW:", err);
      }

      return organisationId;
    },
    []
  );

  const ensureProfile = useCallback(
    async (userId: string, email?: string, name?: string): Promise<AuthProfile | null> => {
      const userEmail = email ?? "";

      // Step 1: Fetch existing profile
      const existingProf = await fetchProfile(userId);

      // Case A: Profile exists with valid organisation - done
      if (existingProf?.organisationId) {
        console.log("[auth:ensure] Profile exists with organisation:", existingProf.organisationId);
        return existingProf;
      }

      // Case B: Profile exists but organisation_id is NULL - repair
      if (existingProf && !existingProf.organisationId) {
        console.log("[auth:ensure] REPAIR PATH: profile exists but organisation_id is NULL");

        // BEFORE bootstrapping, check for pending invitations
        if (userEmail) {
          console.log("[auth:ensure] REPAIR: checking pending invitations for", userEmail);
          const invitedOrgId = await acceptPendingInvitation(userId, userEmail);
          if (invitedOrgId) {
            console.log("[auth:ensure] REPAIR: joined via invitation - orgId =", invitedOrgId);
            return { ...existingProf, organisationId: invitedOrgId };
          }
        }

        console.log("[auth:ensure] REPAIR: no pending invitation - bootstrapping organisation");
        const orgId = await bootstrapOrganisation(userId, existingProf.name ?? name, existingProf.email ?? email);
        if (orgId) {
          console.log("[auth:ensure] REPAIR COMPLETE: organisation_id =", orgId);
          return { ...existingProf, organisationId: orgId };
        }
        console.error("[auth:ensure] REPAIR FAILED: could not create organisation for existing profile");
        return existingProf;
      }

      // Case C: No profile exists - full creation path
      console.log("[auth:ensure] NEW USER: no profile found - creating profile");

      // Step C1: Create profile FIRST (without organisation_id)
      const { data: newProfile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: email ?? null,
          name: name ?? null,
          access_level: "owner",
        })
        .select("id, name, email, organisation_id")
        .single();

      if (profileError) {
        console.error("[auth:ensure] Profile creation FAILED:", profileError.message, profileError.code);
        return null;
      }

      const row = newProfile as { id: string; name: string | null; email: string | null; organisation_id: string | null };
      console.log("[auth:ensure] Profile created:", row.id);

      // Step C2: BEFORE bootstrapping, check for pending invitations
      // This prevents creating an orphan organisation that gets immediately abandoned
      let orgId: string | null = null;
      if (userEmail) {
        console.log("[auth:ensure] NEW USER: checking pending invitations for", userEmail);
        orgId = await acceptPendingInvitation(userId, userEmail);
        if (orgId) {
          console.log("[auth:ensure] NEW USER: joined via invitation - orgId =", orgId, "(no org created)");
        }
      }

      // Step C3: Only bootstrap a NEW organisation if no invitation was accepted
      if (!orgId) {
        console.log("[auth:ensure] NEW USER: no pending invitation - bootstrapping new organisation");
        orgId = await bootstrapOrganisation(userId, name, email);
        if (!orgId) {
          console.error("[auth:ensure] Organisation bootstrap FAILED after profile creation - user may need repair on next login");
        } else {
          console.log("[auth:ensure] NEW USER COMPLETE: profile + organisation + membership all created");
        }
      }

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        organisationId: orgId,
      };
    },
    [fetchProfile, bootstrapOrganisation, acceptPendingInvitation]
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
        // Use ensureProfile (not fetchProfile) so the repair path runs
        // for legacy/partially-created users on app restart
        ensureProfile(currentSession.user.id).then(async (prof) => {
          console.log("[auth:session] Profile after ensure:", !!prof, "orgId:", prof?.organisationId ?? "null");
          setProfile(prof);

          // Auto-accept any pending invitations for EXISTING users who
          // already have an organisation (new-user invitations are handled
          // inside ensureProfile to prevent orphan organisations)
          if (prof && prof.organisationId) {
            const email = prof.email ?? currentSession.user.email;
            if (email) {
              try {
                const result = await autoAcceptInvitations(prof.id, email);
                if (result.accepted) {
                  console.log("[auth:session] Auto-accepted invitation for org:", result.orgId);
                  // Refresh profile to get the updated organisation_id
                  const updatedProf = await fetchProfile(prof.id);
                  if (updatedProf) setProfile(updatedProf);
                }
              } catch (err) {
                console.warn("[auth:session] autoAcceptInvitations error:", err);
              }
            }
          }
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

          // Auto-accept any pending invitations for EXISTING users who
          // already have an organisation (new-user invitations are handled
          // inside ensureProfile to prevent orphan organisations)
          if (prof && prof.organisationId) {
            const email = prof.email ?? newSession.user.email;
            if (email) {
              try {
                const result = await autoAcceptInvitations(prof.id, email);
                if (result.accepted) {
                  console.log("[auth:session] SIGNED_IN auto-accepted invitation for org:", result.orgId);
                  // Refresh profile to get the updated organisation_id
                  const updatedProf = await fetchProfile(prof.id);
                  if (updatedProf) setProfile(updatedProf);
                }
              } catch (err) {
                console.warn("[auth:session] autoAcceptInvitations error:", err);
              }
            }
          }
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
