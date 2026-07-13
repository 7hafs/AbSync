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
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, getAuthRedirectUrl } from "@/lib/supabase";
import { autoAcceptInvitations, acceptInvitation } from "@/lib/dataService";
import { Session, User } from "@supabase/supabase-js";

/** AsyncStorage key for persisting the user's personal organisation ID. */
const PERSONAL_ORG_ID_KEY = "personal_org_id";

/** Development-only logger — no-op in production builds. */
const devLog = __DEV__ ? console.log.bind(console) : () => {};

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
  setWorkspaceMode: (mode: 'personal' | 'organisation', orgIdOrName?: string) => Promise<void>;
  /** Switch to personal workspace — only changes the view, never deletes memberships or overwrites organisation_id. */
  switchToPersonalWorkspace: () => Promise<void>;
  /** Switch back to organisation workspace — only changes the view. Validates membership still exists. */
  switchToOrganisationWorkspace: () => Promise<void>;
  /** Permanently leave the current organisation — removes memberships and switches to personal. */
  leaveOrganisation: () => Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Convert a Supabase auth error into a user-friendly message.
 * Rate-limit / over-request errors are translated so users never see raw
 * "For security purposes, you can only request this after X seconds" text.
 */
/** Exported so other screens (e.g. Settings) can reuse the same friendly text. */
export function friendlyAuthError(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : String(err ?? "");
  const lower = raw.toLowerCase();

  // Supabase rate limits on password resets / OTP
  if (
    lower.includes("for security purposes") ||
    lower.includes("rate limit") ||
    lower.includes("too many") ||
    lower.includes("over_request_rate_limit") ||
    lower.includes("you can only request this after")
  ) {
    return "You've requested too many password reset emails in a short period. Please wait a while before trying again.";
  }
  return raw || "An unexpected error occurred. Please try again.";
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
   * Ensure a personal organisation exists for a user (one per user).
   * Creates the org + membership row if needed. Returns the org ID.
   *
   * When updateProfile is true (onboarding / repair): also sets
   * organisation_id + workspace_mode on the profile.
   *
   * When updateProfile is false (workspace switching): only ensures
   * the org exists. NEVER overwrites profile.organisation_id.
   */
  const ensurePersonalOrg = useCallback(
    async (userId: string, updateProfile: boolean): Promise<string | null> => {
      try {
        // Check if personal org already exists
        const { data: existing, error: selectErr } = await supabase
          .from("organisations")
          .select("id")
          .eq("owner_id", userId)
          .eq("name", "Personal Workspace")
          .limit(1);

        if (selectErr) {
          console.error("[auth] Failed to query personal org:", selectErr.message, selectErr.code);
        }

        if (existing && existing.length > 0) {
          const orgId = (existing[0] as { id: string }).id;

          // Ensure membership exists
          const { error: memberErr } = await supabase
            .from("organisation_members")
            .upsert({
              organisation_id: orgId,
              user_id: userId,
              role: "owner",
            }, { onConflict: "organisation_id,user_id" });
          if (memberErr) {
            console.error("[auth] Failed to upsert personal org membership:", memberErr.message, memberErr.code);
          }

          if (updateProfile) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: profileErr } = await (supabase.from("profiles") as any).update({
              organisation_id: orgId,
              workspace_mode: "personal",
            }).eq("id", userId);
            if (profileErr) {
              console.error("[auth] Failed to update profile with personal org:", profileErr.message, profileErr.code);
            }
          }

          return orgId;
        }

        // Create new personal org via SECURITY DEFINER RPC — bypasses RLS,
        // atomically creates org + membership + updates profile.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'create_organisation_for_user' as any,
          {
            p_name: 'Personal Workspace',
            p_owner_id: userId,
            p_update_profile: updateProfile,
            p_workspace_mode: 'personal',
          } as any
        );

        if (rpcError) {
          console.error("[auth] create_organisation_for_user RPC failed:", rpcError.message, rpcError.code);
          return null;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = rpcResult as any;
        if (!result || result.success !== true) {
          console.error("[auth] create_organisation_for_user returned failure:", result?.error);
          return null;
        }

        return result.org_id as string;
      } catch (err) {
        console.error("[auth] ensurePersonalOrg exception:", err);
        return null;
      }
    },
    []
  );

  /**
   * Legacy wrapper — calls ensurePersonalOrg with updateProfile=true.
   * Used by onboarding, repair paths, and setWorkspaceMode where we DO
   * want to set organisation_id on the profile.
   */
  const createPersonalOrg = useCallback(
    async (userId: string): Promise<string | null> => {
      return ensurePersonalOrg(userId, true);
    },
    [ensurePersonalOrg]
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

        const result = await acceptInvitation(token, userId, email);
        if (result.success && result.orgId) {
          return result.orgId;
        }

        console.warn("[auth] Failed to auto-accept invitation:", result.error);
        return null;
      } catch (err) {
        console.warn("[auth] Invitation auto-accept check failed:", err);
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

      // ── Atomic org creation via SECURITY DEFINER RPC ──
      // This RPC runs as the function owner (postgres), bypassing RLS.
      // It atomically: inserts the organisation, upserts the owner
      // membership, and updates the profile's organisation_id + workspace_mode.
      try {
        const rpcPayload = {
          p_name: orgName,
          p_owner_id: userId,
          p_update_profile: true,
          p_workspace_mode: 'organisation' as const,
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcResult, error: rpcError } = await supabase.rpc(
          'create_organisation_for_user' as any,
          rpcPayload as any
        );

        if (rpcError) {
          console.error("[auth] create_organisation_for_user RPC failed:",
            rpcError.message, rpcError.code, rpcError.details, rpcError.hint);
          throw new Error(`Organisation creation failed: ${rpcError.message} (code: ${rpcError.code})`);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = rpcResult as any;

        if (!result || result.success !== true) {
          const errMsg = result?.error || 'Unknown error from create_organisation_for_user RPC';
          console.error("[auth] create_organisation_for_user returned failure:", errMsg);
          throw new Error(`Organisation creation failed: ${errMsg}`);
        }

        return result.org_id as string;
      } catch (err) {
        console.error("[auth] bootstrapOrganisation exception:", err);
        throw err instanceof Error ? err : new Error('Organisation creation failed with unknown error');
      }
    },
    []
  );

  /**
   * Derive a display name from an email address (prefix before @).
   * Used as a fallback when no name is available on the profile.
   */
  const deriveNameFromEmail = useCallback((emailAddr?: string | null): string | null => {
    if (!emailAddr) return null;
    const atIndex = emailAddr.indexOf("@");
    if (atIndex <= 0) return null;
    const prefix = emailAddr.substring(0, atIndex);
    // Capitalise first letter of each dot/underscore-separated segment
    return prefix
      .split(/[._-]/)
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1).toLowerCase())
      .join(" ");
  }, []);

  /**
   * Ensure a profile row exists for the given user, handling three cases:
   *
   * A) Profile exists with workspace_mode set   → repair if needed, then return
   * B) Profile exists, workspace_mode is NULL   → backfill for legacy, or return
   *    (null mode = onboarding needed for brand-new users)
   * C) No profile exists                          → create minimal profile,
   *    return with workspaceMode=null (onboarding will handle workspace setup)
   *
   * CRITICAL: This function MUST always return a profile (never null) when the
   * user is authenticated. If profile creation fails, we synthesise a temporary
   * in-memory profile so the auth gate can correctly route the user to onboarding
   * instead of leaving them stuck on a blank screen.
   *
   * REPAIR LOGIC (Case A):
   *  - Null name: backfill from caller-provided name, then email-derived name
   *  - Null email: backfill from caller-provided email (auth metadata)
   *  - State D (workspace_mode='organisation' + organisation_id=NULL):
   *    triggered after org removal. Auto-switch to personal workspace.
   *  - State E (workspace_mode='personal' + organisation_id=NULL):
   *    create a personal org so writes don't fail with requireOrganisationId().
   */
  const ensureProfile = useCallback(
    async (userId: string, email?: string, name?: string): Promise<AuthProfile> => {
      // Step 1: Fetch existing profile
      const existingProf = await fetchProfile(userId);

      // ── Resolve the best available name & email ────────────────────────
      // Priority: 1) caller-provided (auth metadata)  2) DB-stored  3) email-derived fallback
      const resolvedEmail = email ?? existingProf?.email ?? null;
      const resolvedName = name ?? existingProf?.name ?? deriveNameFromEmail(resolvedEmail);

      // Case A: Profile exists with workspace mode set
      if (existingProf && existingProf.workspaceMode !== null) {
        // Repair A1: backfill null name from resolved name
        if (!existingProf.name && resolvedName) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateErr } = await (supabase.from("profiles") as any)
            .update({ name: resolvedName })
            .eq("id", userId);
          if (updateErr) {
            console.warn("[auth] Failed to backfill profile name:", updateErr.message);
          }
          existingProf.name = resolvedName;
        }

        // Repair A1b: backfill null email from auth metadata
        if (!existingProf.email && email) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateErr } = await (supabase.from("profiles") as any)
            .update({ email })
            .eq("id", userId);
          if (updateErr) {
            console.warn("[auth] Failed to backfill profile email:", updateErr.message);
          }
          existingProf.email = email;
        }

        // Repair A2: org mode with no org_id — auto-switch to personal
        if (existingProf.workspaceMode === 'organisation' && !existingProf.organisationId) {
          const personalOrgId = await createPersonalOrg(userId);
          if (personalOrgId) {
            const updatedProf = await fetchProfile(userId);
            if (updatedProf) {
              if (!updatedProf.name && resolvedName) updatedProf.name = resolvedName;
              if (!updatedProf.email && resolvedEmail) updatedProf.email = resolvedEmail;
              return updatedProf;
            }
          }
          console.warn("[auth] Repair: failed to create personal org for state D — returning patched profile");
          return existingProf;
        }

        // Repair A3: personal mode with no org_id — create personal org
        if (existingProf.workspaceMode === 'personal' && !existingProf.organisationId) {
          const personalOrgId = await createPersonalOrg(userId);
          if (personalOrgId) {
            const updatedProf = await fetchProfile(userId);
            if (updatedProf) {
              if (!updatedProf.name && resolvedName) updatedProf.name = resolvedName;
              if (!updatedProf.email && resolvedEmail) updatedProf.email = resolvedEmail;
              return updatedProf;
            }
          }
          console.warn("[auth] Repair: failed to create personal org for state E — returning patched profile");
          return existingProf;
        }

        return existingProf;
      }

      // Case B: Profile exists but workspace_mode is NULL
      if (existingProf && existingProf.workspaceMode === null) {
        // Repair null name/email
        if ((!existingProf.name && resolvedName) || (!existingProf.email && email)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updatePayload: Record<string, string> = {};
          if (!existingProf.name && resolvedName) updatePayload.name = resolvedName;
          if (!existingProf.email && email) updatePayload.email = email;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("profiles") as any).update(updatePayload).eq("id", userId).catch((e: Error) =>
            console.warn("[auth] Failed to repair profile name/email:", e.message)
          );
          if (!existingProf.name && resolvedName) existingProf.name = resolvedName;
          if (!existingProf.email && email) existingProf.email = email;
        }

        // Legacy user — backfill workspace_mode to 'organisation'
        if (existingProf.organisationId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("profiles") as any).update({ workspace_mode: "organisation" }).eq("id", userId).catch((e: Error) =>
            console.warn("[auth] Failed to backfill workspace_mode:", e.message)
          );
          return { ...existingProf, workspaceMode: "organisation" as const };
        }

        // Brand-new user — onboarding will handle workspace setup
        return existingProf;
      }

      // Case C: No profile exists — create minimal profile
      const dbName = resolvedName;
      const dbEmail = resolvedEmail;

      const { data: newProfile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          email: dbEmail,
          name: dbName,
          access_level: "owner",
        })
        .select("id, name, email, organisation_id, workspace_mode")
        .single();

      if (profileError) {
        console.error("[auth] Failed to create profile:", profileError.message, profileError.code);
        // Fallback: synthesise an in-memory profile so the auth gate can route
        // the user to onboarding instead of leaving them on a blank screen.
        return {
          id: userId,
          name: dbName,
          email: dbEmail,
          organisationId: null,
          workspaceMode: null,
        };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = newProfile as any as { id: string; name: string | null; email: string | null; organisation_id: string | null; workspace_mode: string | null };

      return {
        id: row.id,
        name: row.name ?? dbName,
        email: row.email ?? dbEmail,
        organisationId: null,
        workspaceMode: null,
      };
    },
    [fetchProfile, bootstrapOrganisation, acceptPendingInvitation, createPersonalOrg, deriveNameFromEmail]
  );

  // ── Session listener ─────────────────────────────────────────────────────

  useEffect(() => {
    const mountTime = Date.now();

    const loadingTimeout = setTimeout(() => {
      setIsLoading((prev) => {
        if (prev) {
          console.warn("[auth] Session restore timed out — forcing app to load");
          return false;
        }
        return prev;
      });
    }, 8000);

    supabase.auth.getSession().then(({ data: { session: currentSession }, error: sessionErr }) => {
      clearTimeout(loadingTimeout);

      if (sessionErr) {
        console.warn("[auth] getSession error:", sessionErr.message);
      }

      setSession(currentSession);
      setUser(currentSession?.user ?? null);
      setIsLoading(false);

      if (currentSession?.user) {
        ensureProfile(
          currentSession.user.id,
          currentSession.user.email,
          currentSession.user.user_metadata?.name as string | undefined
        ).then(async (prof) => {
          setProfile(prof);

          // Auto-accept any pending invitations for users with an organisation
          if (prof && prof.organisationId) {
            const email = prof.email ?? currentSession.user.email;
            if (email) {
              try {
                const result = await autoAcceptInvitations(prof.id, email);
                if (result.accepted) {
                  const updatedProf = await fetchProfile(prof.id);
                  if (updatedProf) setProfile(updatedProf);
                }
              } catch (err) {
                console.warn("[auth] Auto-accept invitation error:", err);
              }
            }
          }
        });
      }
    }).catch((err) => {
      clearTimeout(loadingTimeout);
      console.error("[auth] getSession exception:", err);
      setIsLoading(false);
    });

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        devLog("[auth] onAuthStateChange", {
          event,
          hasSession: !!newSession,
          userId: newSession?.user?.id ?? null,
        });
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (event === "SIGNED_IN" && newSession?.user) {
          const prof = await ensureProfile(
            newSession.user.id,
            newSession.user.email,
            newSession.user.user_metadata?.name as string | undefined
          );
          setProfile(prof);

          if (prof && prof.organisationId) {
            const email = prof.email ?? newSession.user.email;
            if (email) {
              try {
                const result = await autoAcceptInvitations(prof.id, email);
                if (result.accepted) {
                  const updatedProf = await fetchProfile(prof.id);
                  if (updatedProf) setProfile(updatedProf);
                }
              } catch (err) {
                console.warn("[auth] Auto-accept invitation error:", err);
              }
            }
          }
        }

        if (event === "SIGNED_OUT") {
          setProfile(null);
        }
      }
    );

    return () => {
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
            emailRedirectTo: getAuthRedirectUrl(),
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
        const redirectTo = getAuthRedirectUrl();
        if (__DEV__) {
          const maskedEmail = email.length > 2
            ? `${email[0]}***${email.substring(email.indexOf("@"))}`
            : "***";
          devLog("[auth] resetPasswordForEmail START", {
            email: maskedEmail,
            redirectTo,
            platform: Platform.OS,
          });
        }

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo,
        });

        if (error) {
          if (__DEV__) {
            console.error("[auth] resetPasswordForEmail FAILED", {
              message: error.message,
              status: error.status,
            });
          }
          return friendlyAuthError(error);
        }

        devLog("[auth] resetPasswordForEmail SUCCESS — email sent");
        return null;
      } catch (err) {
        const message = err instanceof Error ? err.message : "An unknown error occurred";
        if (__DEV__) {
          console.error("[auth] resetPasswordForEmail EXCEPTION:", message);
        }
        return friendlyAuthError(err);
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

  /** Set the workspace mode and optionally link to an org or provide a name for org creation. */
  const setWorkspaceModeFn = useCallback(
    async (mode: 'personal' | 'organisation', orgIdOrName?: string) => {
      if (!user) return;

      if (mode === 'personal') {
        const personalOrgId = await createPersonalOrg(user.id);
        if (personalOrgId) {
          const prof = await fetchProfile(user.id);
          if (prof) setProfile(prof);
        } else {
          throw new Error("Personal workspace setup failed — could not create or find personal organisation. Try signing out and back in.");
        }
      } else {
        // Organisation mode — orgIdOrName may be a UUID (joining existing org)
        // or a display name (creating a new org)
        let finalOrgId: string | null = null;
        const isUuid = orgIdOrName && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdOrName);

        if (orgIdOrName && isUuid) {
          finalOrgId = orgIdOrName;
        } else {
          const orgDisplayName = orgIdOrName || profile?.name || profile?.email || "My Organisation";
          finalOrgId = await bootstrapOrganisation(user.id, orgDisplayName, profile?.email ?? undefined);
        }

        if (finalOrgId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: profileUpdateErr } = await (supabase.from("profiles") as any).update({
            organisation_id: finalOrgId,
            workspace_mode: "organisation",
          }).eq("id", user.id).select("id, organisation_id, workspace_mode");
          if (profileUpdateErr) {
            throw new Error(`Profile update failed: ${profileUpdateErr.message} (code: ${profileUpdateErr.code})`);
          }

          const prof = await fetchProfile(user.id);
          if (prof) {
            setProfile(prof);
          } else {
            throw new Error("Profile fetch returned null after workspace mode change — database may be out of sync");
          }
        } else {
          throw new Error("Organisation creation failed — no organisation ID returned. Check RLS policies and database connectivity.");
        }
      }
    },
    [user, profile, createPersonalOrg, bootstrapOrganisation, fetchProfile]
  );

  /**
   * Switch to personal workspace — ONLY changes workspace_mode to 'personal'.
   *
   * This is a VIEW-ONLY switch. It:
   *   - Ensures a personal org exists (creates one if needed)
   *   - Stores the personal org ID in AsyncStorage so dataService can resolve it
   *   - Updates workspace_mode to 'personal' on the profile
   *
   * It NEVER:
   *   - Deletes organisation_members rows
   *   - Overwrites profile.organisation_id
   *   - Revokes access to any organisation
   */
  const switchToPersonalWorkspace = useCallback(async () => {
    if (!user) return;

    // Ensure a personal org exists — pass updateProfile=false so we never
    // overwrite organisation_id. This is the scaffolding org for personal writes.
    const personalOrgId = await ensurePersonalOrg(user.id, false);
    if (!personalOrgId) {
      console.error("[auth] Failed to ensure personal org for workspace switch");
      return;
    }

    await AsyncStorage.setItem(PERSONAL_ORG_ID_KEY, personalOrgId);

    // Update ONLY workspace_mode — never touch organisation_id or memberships
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ workspace_mode: "personal" } as any)
      .eq("id", user.id)
      .select("id, organisation_id, workspace_mode");

    if (updateErr) {
      console.error("[auth] Failed to switch to personal workspace:", updateErr.message, updateErr.code);
      return;
    }

    const prof = await fetchProfile(user.id);
    if (prof) {
      setProfile(prof);
    } else {
      console.error("[auth] Profile not found after switching to personal");
    }
  }, [user, ensurePersonalOrg, fetchProfile]);

  /**
   * Switch to organisation workspace — ONLY changes workspace_mode to 'organisation'.
   *
   * Validates that the user still has a valid membership before switching.
   * NEVER creates organisations, never deletes memberships.
   */
  const switchToOrganisationWorkspace = useCallback(async () => {
    if (!user) return;

    if (!profile?.organisationId) {
      throw new Error("Cannot switch to Organisation Workspace — you are not linked to any organisation. Create or join one first.");
    }

    // Verify membership still exists for this org
    const { data: membership, error: memberErr } = await supabase
      .from("organisation_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organisation_id", profile.organisationId)
      .limit(1);

    if (memberErr) {
      throw new Error(`Membership verification failed: ${memberErr.message} (code: ${memberErr.code})`);
    }

    if (!membership || membership.length === 0) {
      throw new Error(`You are no longer a member of this organisation. Your membership may have been revoked, or the data is out of sync. Try refreshing.`);
    }

    // Update ONLY workspace_mode
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ workspace_mode: "organisation" } as any)
      .eq("id", user.id)
      .select("id, organisation_id, workspace_mode");

    if (updateErr) {
      throw new Error(`Workspace switch failed: ${updateErr.message} (code: ${updateErr.code})`);
    }

    const prof = await fetchProfile(user.id);
    if (prof) {
      setProfile(prof);
    } else {
      console.error("[auth] Profile not found after switching to organisation");
    }
  }, [user, profile, fetchProfile]);

  /**
   * Permanently leave the current organisation — removes all memberships
   * and switches to personal workspace. This IS a destructive action; use
   * switchToPersonalWorkspace() for non-destructive view switching.
   */
  const leaveOrganisation = useCallback(async () => {
    if (!user) return;

    // Delete all organisation memberships for this user
    const { data: memberships, error: fetchErr } = await supabase
      .from("organisation_members")
      .select("id")
      .eq("user_id", user.id);

    if (fetchErr) {
      console.error("[auth] Failed to fetch memberships for leave:", fetchErr.message);
      return;
    }

    if (memberships && memberships.length > 0) {
      for (const m of memberships as { id: string }[]) {
        const { error: delErr } = await supabase
          .from("organisation_members")
          .delete()
          .eq("id", m.id);
        if (delErr) {
          console.error("[auth] Failed to delete membership:", delErr.message);
        }
      }
    }

    // Now switch to personal workspace
    await switchToPersonalWorkspace();
  }, [user, switchToPersonalWorkspace]);

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
      switchToOrganisationWorkspace,
      leaveOrganisation,
    }),
    [isLoading, session, user, profile, isProcessing, signUp, signIn, forgotPassword, signOut, refreshProfile, setWorkspaceModeFn, switchToPersonalWorkspace, switchToOrganisationWorkspace, leaveOrganisation]
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
