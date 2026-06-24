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
  setWorkspaceMode: (mode: 'personal' | 'organisation', orgIdOrName?: string) => Promise<void>;
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
        console.log("[auth:diag:personal] Checking for existing personal org for user:", userId);
        // Check if personal org already exists
        const { data: existing, error: selectErr } = await supabase
          .from("organisations")
          .select("id")
          .eq("owner_id", userId)
          .eq("name", "Personal Workspace")
          .limit(1);

        if (selectErr) {
          console.error("[auth:diag:personal] SELECT existing org FAILED:", selectErr.message, selectErr.code);
        }

        if (existing && existing.length > 0) {
          const orgId = (existing[0] as { id: string }).id;
          console.log("[auth:diag:personal] Reusing existing personal org:", orgId);

          // Ensure membership exists
          const { error: memberErr } = await supabase
            .from("organisation_members")
            .upsert({
              organisation_id: orgId,
              user_id: userId,
              role: "owner",
            }, { onConflict: "organisation_id,user_id" });
          if (memberErr) {
            console.error("[auth:diag:personal] Membership upsert FAILED:", memberErr.message, memberErr.code);
          } else {
            console.log("[auth:diag:personal] Membership upsert SUCCESS");
          }

          // Update profile
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: profileErr } = await (supabase.from("profiles") as any).update({
            organisation_id: orgId,
            workspace_mode: "personal",
          }).eq("id", userId);
          if (profileErr) {
            console.error("[auth:diag:personal] Profile update FAILED:", profileErr.message, profileErr.code);
          } else {
            console.log("[auth:diag:personal] Profile update SUCCESS — orgId:", orgId);
          }

          return orgId;
        }

        console.log("[auth:diag:personal] No existing personal org — creating new one");
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
          console.error("[auth:diag:personal] INSERT organisation FAILED:", orgError.message, orgError.code);
          return null;
        }

        const orgId = org.id;
        console.log("[auth:diag:personal] Organisation created:", orgId);

        // Create membership
        const { error: memberErr } = await supabase.from("organisation_members").insert({
          organisation_id: orgId,
          user_id: userId,
          role: "owner",
        });
        if (memberErr) {
          console.error("[auth:diag:personal] Membership INSERT FAILED:", memberErr.message, memberErr.code);
        } else {
          console.log("[auth:diag:personal] Membership INSERT SUCCESS");
        }

        // Update profile
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: profileErr } = await (supabase.from("profiles") as any).update({
          organisation_id: orgId,
          workspace_mode: "personal",
        }).eq("id", userId);
        if (profileErr) {
          console.error("[auth:diag:personal] Profile update FAILED:", profileErr.message, profileErr.code);
        } else {
          console.log("[auth:diag:personal] Profile update SUCCESS");
        }

        return orgId;
      } catch (err) {
        console.error("[auth:diag:personal] createPersonalOrg THREW:", err);
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

      console.log("[auth:diag:org] bootstrapOrganisation START — user:", userId, "name:", orgName);

      // Step A: Create the organisation
      let organisationId: string | null = null;
      try {
        const { data: org, error: orgError } = await supabase
          .from("organisations")
          .insert({ name: orgName, owner_id: userId })
          .select("id")
          .single();

        if (orgError) {
          console.error("[auth:diag:org] Step A — INSERT organisations FAILED:", orgError.message, orgError.code, orgError.details);
          return null;
        }
        organisationId = org.id;
        console.log("[auth:diag:org] Step A — Organisation created:", organisationId, "name:", orgName);
      } catch (err) {
        console.error("[auth:diag:org] Step A — INSERT organisations THREW:", err);
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
          console.error("[auth:diag:org] Step B — INSERT organisation_members FAILED:", memberError.message, memberError.code, memberError.details);
          // Non-fatal — membership can be repaired later
        } else {
          console.log("[auth:diag:org] Step B — Membership created: user=", userId, "org=", organisationId, "role=owner");
        }
      } catch (err) {
        console.error("[auth:diag:org] Step B — INSERT organisation_members THREW:", err);
      }

      // Step C: Update profile.organisation_id and workspace_mode (with retry)
      let profileUpdated = false;
      for (let attempt = 0; attempt < 3 && !profileUpdated; attempt++) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateError } = await (supabase
            .from("profiles") as any)
            .update({ organisation_id: organisationId, workspace_mode: "organisation" })
            .eq("id", userId);
          if (updateError) {
            console.error("[auth:diag:org] Step C attempt", attempt + 1, "— UPDATE profiles FAILED:", updateError.message, updateError.code);
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }
          } else {
            console.log("[auth:diag:org] Step C — Profile updated — organisation_id:", organisationId);
            profileUpdated = true;
          }
        } catch (err) {
          console.error("[auth:diag:org] Step C attempt", attempt + 1, "— UPDATE profiles THREW:", err);
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
          }
        }
      }
      if (!profileUpdated) {
        console.error("[auth:diag:org] Step C — Profile update FAILED after 3 attempts. Organisation", organisationId, "was created but profile may not be updated.");
      }

      return organisationId;
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
        console.log("[auth:ensure] Case A — workspace_mode:", existingProf.workspaceMode, "orgId:", existingProf.organisationId ?? "null", "name:", existingProf.name ?? "null");

        let needsDbUpdate = false;

        // ── Repair A1: null name — backfill from resolved name ─
        if (!existingProf.name && resolvedName) {
          console.log("[auth:ensure] REPAIR A1: name was null — backfilling to:", resolvedName);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateErr } = await (supabase.from("profiles") as any)
            .update({ name: resolvedName })
            .eq("id", userId);
          if (updateErr) {
            console.warn("[auth:ensure] REPAIR A1: DB update FAILED:", updateErr.message, "— patching in-memory only");
          } else {
            console.log("[auth:ensure] REPAIR A1: DB name updated successfully");
          }
          existingProf.name = resolvedName;
          needsDbUpdate = true;
        }

        // ── Repair A1b: null email — backfill from auth metadata ─
        if (!existingProf.email && email) {
          console.log("[auth:ensure] REPAIR A1b: email was null — backfilling");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: updateErr } = await (supabase.from("profiles") as any)
            .update({ email })
            .eq("id", userId);
          if (updateErr) {
            console.warn("[auth:ensure] REPAIR A1b: DB email update FAILED:", updateErr.message);
          }
          existingProf.email = email;
          needsDbUpdate = true;
        }

        // ── Repair A2: State D — org mode with no org_id ─
        if (existingProf.workspaceMode === 'organisation' && !existingProf.organisationId) {
          console.log("[auth:ensure] REPAIR A2: INVALID STATE D (org mode + null org_id) → switching to personal");
          const personalOrgId = await createPersonalOrg(userId);
          if (personalOrgId) {
            const updatedProf = await fetchProfile(userId);
            if (updatedProf) {
              // Ensure name/email are patched on the updated profile too
              if (!updatedProf.name && resolvedName) updatedProf.name = resolvedName;
              if (!updatedProf.email && resolvedEmail) updatedProf.email = resolvedEmail;
              console.log("[auth:ensure] REPAIR A2: switched to personal — orgId:", personalOrgId);
              return updatedProf;
            }
          }
          console.warn("[auth:ensure] REPAIR A2: createPersonalOrg FAILED — returning existing with name patched");
          return existingProf;
        }

        // ── Repair A3: State E — personal mode with no org_id ─
        if (existingProf.workspaceMode === 'personal' && !existingProf.organisationId) {
          console.log("[auth:ensure] REPAIR A3: INVALID STATE E (personal mode + null org_id) → creating personal org");
          const personalOrgId = await createPersonalOrg(userId);
          if (personalOrgId) {
            const updatedProf = await fetchProfile(userId);
            if (updatedProf) {
              if (!updatedProf.name && resolvedName) updatedProf.name = resolvedName;
              if (!updatedProf.email && resolvedEmail) updatedProf.email = resolvedEmail;
              console.log("[auth:ensure] REPAIR A3: personal org created — orgId:", personalOrgId);
              return updatedProf;
            }
          }
          console.warn("[auth:ensure] REPAIR A3: createPersonalOrg FAILED — returning existing with name patched");
          return existingProf;
        }

        return existingProf;
      }

      // Case B: Profile exists but workspace_mode is NULL
      if (existingProf && existingProf.workspaceMode === null) {
        console.log("[auth:ensure] Case B — profile exists but workspace_mode is NULL");

        // Repair null name/email
        if ((!existingProf.name && resolvedName) || (!existingProf.email && email)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const updatePayload: Record<string, string> = {};
          if (!existingProf.name && resolvedName) updatePayload.name = resolvedName;
          if (!existingProf.email && email) updatePayload.email = email;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("profiles") as any).update(updatePayload).eq("id", userId).catch((e: Error) =>
            console.warn("[auth:ensure] Case B: name/email repair FAILED:", e.message)
          );
          if (!existingProf.name && resolvedName) existingProf.name = resolvedName;
          if (!existingProf.email && email) existingProf.email = email;
        }

        // If profile has an organisation_id, this is a legacy user — backfill mode
        if (existingProf.organisationId) {
          console.log("[auth:ensure] Case B: legacy user — backfilling workspace_mode to 'organisation'");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from("profiles") as any).update({ workspace_mode: "organisation" }).eq("id", userId).catch((e: Error) =>
            console.warn("[auth:ensure] Case B legacy backfill FAILED:", e.message)
          );
          return { ...existingProf, workspaceMode: "organisation" as const };
        }

        // No organisation_id and no workspace_mode — brand-new user who hasn't
        // gone through onboarding yet. Return with workspaceMode=null so the
        // onboarding screen can display.
        console.log("[auth:ensure] Case B: brand-new user — workspace_mode=null (onboarding needed)");
        return existingProf;
      }

      // Case C: No profile exists — create minimal profile
      console.log("[auth:ensure] Case C: NEW USER — no profile found, creating minimal profile");

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
        console.error("[auth:ensure] Case C: Profile creation FAILED:", profileError.message, profileError.code);
        // ── FALLBACK: synthesise an in-memory profile so auth gate can route ─
        // The profile will be repaired when the write succeeds on a later attempt.
        console.log("[auth:ensure] Case C: Synthesising in-memory fallback profile");
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
      console.log("[auth:ensure] Case C: Minimal profile created — id:", row.id, "name:", row.name ?? "null", "ws_mode=null");

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
        ensureProfile(
          currentSession.user.id,
          currentSession.user.email,
          currentSession.user.user_metadata?.name as string | undefined
        ).then(async (prof) => {
          console.log("[auth:session] Profile after ensure:", !!prof, "mode:", prof?.workspaceMode ?? "null", "orgId:", prof?.organisationId ?? "null", "name:", prof?.name ?? "null");
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

  /** Set the workspace mode and optionally link to an org or provide a name for org creation. */
  const setWorkspaceModeFn = useCallback(
    async (mode: 'personal' | 'organisation', orgIdOrName?: string) => {
      if (!user) return;
      console.log("[auth] setWorkspaceMode:", mode, "orgIdOrName:", orgIdOrName ?? "none");

      if (mode === 'personal') {
        console.log("[auth:diag] createPersonalOrg START for user:", user.id);
        const personalOrgId = await createPersonalOrg(user.id);
        if (personalOrgId) {
          console.log("[auth:diag] createPersonalOrg SUCCESS — orgId:", personalOrgId);
          const prof = await fetchProfile(user.id);
          if (prof) setProfile(prof);
        } else {
          console.error("[auth:diag] createPersonalOrg FAILED — returned null");
        }
      } else {
        // Organisation mode — orgIdOrName may be a UUID (joining existing org)
        // or a display name (creating a new org)
        let finalOrgId: string | null = null;

        // Check if orgIdOrName looks like a UUID (joining flow)
        const isUuid = orgIdOrName && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdOrName);

        if (orgIdOrName && isUuid) {
          // Joining an existing org — use the UUID directly
          finalOrgId = orgIdOrName;
          console.log("[auth:diag] Joining existing org:", finalOrgId);
        } else {
          // Creating a new org — use orgIdOrName as the org name, fall back to profile/email
          const orgDisplayName = orgIdOrName || profile?.name || profile?.email || "My Organisation";
          console.log("[auth:diag] bootstrapOrganisation START for user:", user.id, "name:", orgDisplayName);
          finalOrgId = await bootstrapOrganisation(user.id, orgDisplayName, profile?.email ?? undefined);
          if (finalOrgId) {
            console.log("[auth:diag] bootstrapOrganisation SUCCESS — orgId:", finalOrgId);
          } else {
            console.error("[auth:diag] bootstrapOrganisation FAILED — returned null");
          }
        }

        if (finalOrgId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: profileUpdateErr } = await (supabase.from("profiles") as any).update({
            organisation_id: finalOrgId,
            workspace_mode: "organisation",
          }).eq("id", user.id);
          if (profileUpdateErr) {
            console.error("[auth:diag] Profile update FAILED:", profileUpdateErr.message, profileUpdateErr.code);
          } else {
            console.log("[auth:diag] Profile update SUCCESS — orgId:", finalOrgId);
          }

          const prof = await fetchProfile(user.id);
          if (prof) {
            console.log("[auth:diag] Profile fetched after setWorkspaceMode — workspace_mode:", prof.workspaceMode, "orgId:", prof.organisationId);
            setProfile(prof);
          }
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
