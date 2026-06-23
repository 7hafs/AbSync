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
 * - Workspace mode: personal vs organisation
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
  /** Workspace mode: 'personal' or 'organisation'. null = onboarding needed. */
  workspaceMode: 'personal' | 'organisation' | null;
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
  /** Set the workspace mode (and create personal org if switching to personal). */
  setWorkspaceMode: (mode: 'personal' | 'organisation', orgId?: string) => Promise<void>;
  /** Switch to personal workspace (leave current org if in one). */
  switchToPersonalWorkspace: () => Promise<void>;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase
      .from("profiles")
      .select("id, name, email, organisation_id, workspace_mode") as any)
      .eq("id", userId)
      .single();

    if (error || !data) {
      console.log("[auth] Profile not found for user:", userId);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any as { id: string; name: string | null; email: string | null; organisation_id: string | null; workspace_mode: string | null };
    const wm = row.workspace_mode;
    const validMode = (wm === 'personal' || wm === 'organisation') ? (wm as 'personal' | 'organisation') : null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      organisationId: row.organisation_id,
      workspaceMode: validMode,
    };
  }, []);

  /**
   * Create a hidden personal organisation for a user (one per user).
   * This is NOT a real shared organisation — it exists purely so that
   * requireOrganisationId() and RLS work identically for personal users.
   * Returns the synthetic organisation_id, or null on failure.
   */
  const createPersonalOrg = useCallback(
    async (userId: string): Promise<string | null> => {
      try {
        // Check if personal org already exists
        const { data: existing } = await supabase
          .from("organisations")
          .select("id")
          .eq("owner_id", userId)
          .eq("name", "Personal Workspace")
          .limit(1);

        if (existing && existing.length > 0) {
          const orgId = (existing[0] as { id: string }).id;
          console.log("[auth:personal] Reusing existing personal org:", orgId);

          // Ensure membership exists
          const { error: memberErr } = await supabase
            .from("organisation_members")
            .upsert({
              organisation_id: orgId,
              user_id: userId,
              role: "owner",
            }, { onConflict: "organisation_id,user_id" });
          if (memberErr) {
            console.warn("[auth:personal] Membership upsert failed:", memberErr.message);
          }

          // Update profile
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("profiles") as any).update({
            organisation_id: orgId,
            workspace_mode: "personal",
          }).eq("id", userId);

          return orgId;
        }

        // Create new personal org
        const { data: org, error: orgError } = await supabase
          .from("organisations")
          .insert({
            name: "Personal Workspace",
            owner_id: userId,
          })
          .select("id")
          .single();

        if (orgError) {
          console.error("[auth:personal] Failed to create personal org:", orgError.message);
          return null;
        }

        const orgId = org.id;
        console.log("[auth:personal] Created personal org:", orgId);

        // Create membership
        await supabase.from("organisation_members").insert({
          organisation_id: orgId,
          user_id: userId,
          role: "owner",
        });

        // Update profile
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("profiles") as any).update({
          organisation_id: orgId,
          workspace_mode: "personal",
        }).eq("id", userId);

        return orgId;
      } catch (err) {
        console.error("[auth:personal] createPersonalOrg threw:", err);
        return null;
      }
    },
    []
  );

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
   * profile.organisation_id. Used by the org workspace setup and the
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

      // Step A: Create the organisation
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

      // Step C: Update profile.organisation_id and workspace_mode
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: updateError } = await (supabase
          .from("profiles") as any)
          .update({ organisation_id: organisationId, workspace_mode: "organisation" })
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

  /**
   * Ensure a profile row exists for the given user, handling three cases:
   *
   * A) Profile exists with workspace_mode set   → return it (done)
   * B) Profile exists, workspace_mode is NULL   → backfill for legacy, or return
   *    (null mode = onboarding needed for brand-new users)
   * C) No profile exists                          → create minimal profile,
   *    return with workspaceMode=null (onboarding will handle workspace setup)
   *
   * IMPORTANT: This function does NOT auto-create organisations any more.
   * Workspace setup happens via the onboarding screen which calls
   * setWorkspaceMode() or switchToPersonalWorkspace().
   */
  const ensureProfile = useCallback(
    async (userId: string, email?: string, name?: string): Promise<AuthProfile | null> => {
      const userEmail = email ?? "";

      // Step 1: Fetch existing profile
      const existingProf = await fetchProfile(userId);

      // Case A: Profile exists with workspace mode set — done
      if (existingProf && existingProf.workspaceMode !== null) {
        console.log("[auth:ensure] Profile exists with workspace_mode:", existingProf.workspaceMode, "orgId:", existingProf.organisationId);

        // If org mode but no org_id, try to repair by checking invitations
        if (existingProf.workspaceMode === 'organisation' && !existingProf.organisationId && userEmail) {
          const invitedOrgId = await acceptPendingInvitation(userId, userEmail);
          if (invitedOrgId) {
            console.log("[auth:ensure] REPAIR: joined via invitation — orgId =", invitedOrgId);
            return { ...existingProf, organisationId: invitedOrgId };
          }
          // No invitation found, bootstrap org
          const orgId = await bootstrapOrganisation(userId, existingProf.name ?? name, existingProf.email ?? email);
          if (orgId) {
            return { ...existingProf, organisationId: orgId };
          }
        }

        return existingProf;
      }

      // Case B: Profile exists but workspace_mode is NULL
      if (existingProf && existingProf.workspaceMode === null) {
        console.log("[auth:ensure] Profile exists but workspace_mode is NULL");

        // If profile has an organisation_id, this is a legacy user — backfill mode
        if (existingProf.organisationId) {
          console.log("[auth:ensure] Legacy user — backfilling workspace_mode to 'organisation'");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("profiles") as any).update({ workspace_mode: "organisation" }).eq("id", userId);
          return { ...existingProf, workspaceMode: "organisation" as const };
        }

        // No organisation_id and no workspace_mode — brand-new user who hasn't
        // gone through onboarding yet. Return with workspaceMode=null so the
        // onboarding screen can display.
        console.log("[auth:ensure] Brand-new user — workspace_mode=null (onboarding needed)");
        return existingProf;
      }

      // Case C: No profile exists — create minimal profile without bootstrapping
      console.log("[auth:ensure] NEW USER: no profile found — creating minimal profile");

      const { data: newProfile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: email ?? null,
          name: name ?? null,
          access_level: "owner",
        })
        .select("id, name, email, organisation_id, workspace_mode")
        .single();

      if (profileError) {
        console.error("[auth:ensure] Profile creation FAILED:", profileError.message, profileError.code);
        return null;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = newProfile as any as { id: string; name: string | null; email: string | null; organisation_id: string | null; workspace_mode: string | null };
      console.log("[auth:ensure] Minimal profile created:", row.id, "— workspace_mode=null (onboarding needed)");

      return {
        id: row.id,
        name: row.name,
        email: row.email,
        organisationId: null,
        workspaceMode: null,
      };
    },
    [fetchProfile, bootstrapOrganisation, acceptPendingInvitation]
  );

  // ── Session listener ─────────────────────────────────────────────────────

  useEffect(() => {
    const mountTime = Date.now();
    console.log("[auth:session] AuthProvider mounted — starting getSession()...");

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
        ensureProfile(currentSession.user.id).then(async (prof) => {
          console.log("[auth:session] Profile after ensure:", !!prof, "mode:", prof?.workspaceMode ?? "null", "orgId:", prof?.organisationId ?? "null");
          setProfile(prof);

          // Auto-accept any pending invitations for users with an organisation
          if (prof && prof.organisationId) {
            const email = prof.email ?? currentSession.user.email;
            if (email) {
              try {
                const result = await autoAcceptInvitations(prof.id, email);
                if (result.accepted) {
                  console.log("[auth:session] Auto-accepted invitation for org:", result.orgId);
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

    // Listen for auth state changes
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
          console.log("[auth:session] Profile after SIGNED_IN:", !!prof, "mode:", prof?.workspaceMode ?? "null");
          setProfile(prof);

          if (prof && prof.organisationId) {
            const email = prof.email ?? newSession.user.email;
            if (email) {
              try {
                const result = await autoAcceptInvitations(prof.id, email);
                if (result.accepted) {
                  console.log("[auth:session] SIGNED_IN auto-accepted invitation for org:", result.orgId);
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

  /** Set the workspace mode and optionally link to an org. */
  const setWorkspaceModeFn = useCallback(
    async (mode: 'personal' | 'organisation', orgId?: string) => {
      if (!user) return;
      console.log("[auth] setWorkspaceMode:", mode, "orgId:", orgId ?? "none");

      if (mode === 'personal') {
        const personalOrgId = await createPersonalOrg(user.id);
        if (personalOrgId) {
          const prof = await fetchProfile(user.id);
          if (prof) setProfile(prof);
        }
      } else {
        // Organisation mode — org may be provided (joining) or needs creation
        let finalOrgId = orgId ?? null;

        if (!finalOrgId) {
          // Create a new organisation
          finalOrgId = await bootstrapOrganisation(user.id, profile?.name ?? undefined, profile?.email ?? undefined);
        }

        if (finalOrgId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("profiles") as any).update({
            organisation_id: finalOrgId,
            workspace_mode: "organisation",
          }).eq("id", user.id);

          const prof = await fetchProfile(user.id);
          if (prof) setProfile(prof);
        }
      }
    },
    [user, profile, createPersonalOrg, bootstrapOrganisation, fetchProfile]
  );

  /** Switch to personal workspace (leave current org if in one). */
  const switchToPersonalWorkspace = useCallback(async () => {
    if (!user) return;
    console.log("[auth] switchToPersonalWorkspace");

    // If currently in an org, leave all memberships
    if (profile?.organisationId) {
      try {
        const { data: memberships } = await supabase
          .from("organisation_members")
          .select("id")
          .eq("user_id", user.id);

        if (memberships) {
          for (const m of memberships as { id: string }[]) {
            await supabase.from("organisation_members").delete().eq("id", m.id);
          }
        }
      } catch (err) {
        console.warn("[auth] Failed to clear memberships:", err);
      }
    }

    // Now switch to personal workspace (this creates personal org + sets mode)
    await setWorkspaceModeFn('personal');
  }, [user, profile, setWorkspaceModeFn]);

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
      setWorkspaceMode: setWorkspaceModeFn,
      switchToPersonalWorkspace,
    }),
    [isLoading, session, user, profile, isProcessing, signUp, signIn, forgotPassword, signOut, refreshProfile, setWorkspaceModeFn, switchToPersonalWorkspace]
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
