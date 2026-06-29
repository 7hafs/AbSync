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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, getAuthRedirectUrl } from "@/lib/supabase";
import { autoAcceptInvitations, acceptInvitation } from "@/lib/dataService";
import { Session, User } from "@supabase/supabase-js";

/** AsyncStorage key for persisting the user's personal organisation ID. */
const PERSONAL_ORG_ID_KEY = "personal_org_id";

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
        console.log("[auth:diag:personal] Checking for existing personal org for user:", userId, "updateProfile:", updateProfile);
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

          if (updateProfile) {
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

        if (updateProfile) {
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
        }

        return orgId;
      } catch (err) {
        console.error("[auth:diag:personal] ensurePersonalOrg THREW:", err);
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
  const dumpDbState = useCallback(
    async (userId: string, label: string) => {
      try {
        const { data: prof } = await supabase.from("profiles").select("id, organisation_id, workspace_mode").eq("id", userId).single();
        const { data: orgs } = await supabase.from("organisations").select("id, name, owner_id").eq("owner_id", userId);
        const { data: memberships } = await supabase.from("organisation_members").select("id, organisation_id, user_id, role").eq("user_id", userId);
        console.log("[auth:diag:db]", label, "— PROFILE:", prof ? `orgId=${prof.organisation_id ?? 'NULL'} wsMode=${prof.workspace_mode ?? 'NULL'}` : "NOT FOUND");
        console.log("[auth:diag:db]", label, "— ORGS owned by user:", orgs?.length ?? 0, JSON.stringify(orgs?.map((o: any) => ({id: o.id, name: o.name}))));
        console.log("[auth:diag:db]", label, "— MEMBERSHIPS:", memberships?.length ?? 0, JSON.stringify(memberships?.map((m: any) => ({id: m.id, org_id: m.organisation_id, role: m.role}))));
      } catch (err) {
        console.error("[auth:diag:db] FAILED to dump state:", err);
      }
    },
    []
  );

  const bootstrapOrganisation = useCallback(
    async (userId: string, name?: string, email?: string): Promise<string | null> => {
      const orgName = name ?? email ?? "My Organisation";

      console.log("[auth:diag:org] ===== bootstrapOrganisation START =====");
      console.log("[auth:diag:org] user:", userId, "name:", orgName);

      // Diagnostic: compare app user.id with auth.jwt()->>'sub' from the DB
      try {
        const { data: jwtCheck, error: jwtError } = await supabase.rpc("diagnose_auth_id" as any);
        console.log("[auth:diag:org] JWT DIAGNOSTIC:", JSON.stringify({
          appUserId: userId,
          appUserIdType: typeof userId,
          appUserIdLength: userId.length,
          rpcResult: jwtCheck,
          rpcError: jwtError?.message ?? null,
        }));
      } catch (jwtDiagErr) {
        console.error("[auth:diag:org] JWT DIAGNOSTIC THREW:", jwtDiagErr);
      }

      await dumpDbState(userId, "BEFORE org create");

      // Step A: Create the organisation
      let organisationId: string | null = null;
      try {
        console.log("[org:create]", {
          userId: userId,
          ownerIdBeingSent: userId,
        });
        const { data: org, error: orgError } = await supabase
          .from("organisations")
          .insert({ name: orgName, owner_id: userId })
          .select("id")
          .single();

        if (orgError) {
          console.error("[auth:diag:org] Step A — INSERT organisations FAILED:", orgError.message, orgError.code, orgError.details, orgError.hint);
          await dumpDbState(userId, "AFTER org create FAILED");
          throw new Error(`Organisation creation failed: ${orgError.message} (code: ${orgError.code})`);
        }
        organisationId = org.id;
        console.log("[auth:diag:org] Step A — Organisation created SUCCESS:", organisationId, "name:", orgName);
        await dumpDbState(userId, "AFTER org create");
      } catch (err) {
        console.error("[auth:diag:org] Step A — INSERT organisations THREW:", err);
        throw err instanceof Error ? err : new Error("Organisation creation failed with unknown error");
      }

      // Step B: Create membership row
      try {
        const { data: insertedMember, error: memberError } = await supabase
          .from("organisation_members")
          .insert({
            organisation_id: organisationId,
            user_id: userId,
            role: "owner",
          })
          .select("id, organisation_id, user_id, role");
        if (memberError) {
          console.error("[auth:diag:org] Step B — INSERT organisation_members FAILED:", memberError.message, memberError.code, memberError.details, memberError.hint);
          // Non-fatal — membership can be repaired later
        } else {
          console.log("[auth:diag:org] Step B — Membership created SUCCESS:", JSON.stringify(insertedMember));
        }
        await dumpDbState(userId, "AFTER membership insert");
      } catch (err) {
        console.error("[auth:diag:org] Step B — INSERT organisation_members THREW:", err);
      }

      // Step C: Update profile.organisation_id and workspace_mode (with retry)
      let profileUpdated = false;
      for (let attempt = 0; attempt < 3 && !profileUpdated; attempt++) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: updateResult, error: updateError } = await (supabase
            .from("profiles") as any)
            .update({ organisation_id: organisationId, workspace_mode: "organisation" })
            .eq("id", userId)
            .select("id, organisation_id, workspace_mode");
          if (updateError) {
            console.error("[auth:diag:org] Step C attempt", attempt + 1, "— UPDATE profiles FAILED:", updateError.message, updateError.code, updateError.details, updateError.hint);
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
            }
          } else {
            console.log("[auth:diag:org] Step C — Profile updated SUCCESS — result:", JSON.stringify(updateResult), "expected org_id:", organisationId);
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
        const errMsg = `Profile update FAILED after 3 attempts. Organisation ${organisationId} was created but profile may not be updated.`;
        console.error("[auth:diag:org] Step C — " + errMsg);
        throw new Error(errMsg);
      }
      await dumpDbState(userId, "FINAL after bootstrapOrganisation");
      console.log("[auth:diag:org] ===== bootstrapOrganisation END — returning orgId:", organisationId, "=====");

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
      console.log("[auth:diag:setWM] ===== setWorkspaceMode START — mode:", mode, "orgIdOrName:", orgIdOrName ?? "none", "=====");
      await dumpDbState(user.id, "BEFORE setWorkspaceMode");

      if (mode === 'personal') {
        console.log("[auth:diag:setWM] → Switching to PERSONAL workspace");
        console.log("[auth:diag:setWM] createPersonalOrg START for user:", user.id);
        const personalOrgId = await createPersonalOrg(user.id);
        if (personalOrgId) {
          console.log("[auth:diag:setWM] createPersonalOrg SUCCESS — orgId:", personalOrgId);
          const prof = await fetchProfile(user.id);
          if (prof) {
            console.log("[auth:diag:setWM] Profile after personal switch — orgId:", prof.organisationId, "wsMode:", prof.workspaceMode);
            setProfile(prof);
          }
        } else {
          console.error("[auth:diag:setWM] createPersonalOrg FAILED — returned null");
          throw new Error("Personal workspace setup failed — could not create or find personal organisation. Try signing out and back in.");
        }
      } else {
        // Organisation mode — orgIdOrName may be a UUID (joining existing org)
        // or a display name (creating a new org)
        console.log("[auth:diag:setWM] → Setting ORGANISATION workspace");
        let finalOrgId: string | null = null;

        // Check if orgIdOrName looks like a UUID (joining flow)
        const isUuid = orgIdOrName && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgIdOrName);
        console.log("[auth:diag:setWM] isUuid check:", isUuid, "orgIdOrName:", orgIdOrName);

        if (orgIdOrName && isUuid) {
          // Joining an existing org — use the UUID directly
          finalOrgId = orgIdOrName;
          console.log("[auth:diag:setWM] Joining existing org:", finalOrgId);
        } else {
          // Creating a new org — use orgIdOrName as the org name, fall back to profile/email
          const orgDisplayName = orgIdOrName || profile?.name || profile?.email || "My Organisation";
          console.log("[auth:diag:setWM] Creating NEW org with name:", orgDisplayName);
          console.log("[auth:diag:setWM] bootstrapOrganisation START for user:", user.id);
          finalOrgId = await bootstrapOrganisation(user.id, orgDisplayName, profile?.email ?? undefined);
          if (finalOrgId) {
            console.log("[auth:diag:setWM] bootstrapOrganisation SUCCESS — orgId:", finalOrgId);
          } else {
            console.error("[auth:diag:setWM] bootstrapOrganisation FAILED — returned null");
          }
        }

        if (finalOrgId) {
          console.log("[auth:diag:setWM] Updating profile with organisation_id:", finalOrgId);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: updateResult, error: profileUpdateErr } = await (supabase.from("profiles") as any).update({
            organisation_id: finalOrgId,
            workspace_mode: "organisation",
          }).eq("id", user.id).select("id, organisation_id, workspace_mode");
          if (profileUpdateErr) {
            console.error("[auth:diag:setWM] Profile update FAILED:", profileUpdateErr.message, profileUpdateErr.code, profileUpdateErr.details, profileUpdateErr.hint);
            throw new Error(`Profile update failed: ${profileUpdateErr.message} (code: ${profileUpdateErr.code})`);
          } else {
            console.log("[auth:diag:setWM] Profile update SUCCESS — result:", JSON.stringify(updateResult), "expected orgId:", finalOrgId);
          }

          const prof = await fetchProfile(user.id);
          if (prof) {
            console.log("[auth:diag:setWM] Profile fetched after setWorkspaceMode — orgId:", prof.organisationId, "wsMode:", prof.workspaceMode);
            setProfile(prof);
          } else {
            console.error("[auth:diag:setWM] fetchProfile returned NULL after setWorkspaceMode");
            throw new Error("Profile fetch returned null after workspace mode change — database may be out of sync");
          }
        } else {
          console.error("[auth:diag:setWM] No finalOrgId — organisation creation returned null");
          throw new Error("Organisation creation failed — no organisation ID returned. Check RLS policies and database connectivity.");
        }
      }
      await dumpDbState(user.id, "AFTER setWorkspaceMode (" + mode + ")");
      console.log("[auth:diag:setWM] ===== setWorkspaceMode END =====");
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
    console.log("[auth:diag:swPersonal] ===== switchToPersonalWorkspace START =====");
    await dumpDbState(user.id, "BEFORE switch to personal");

    // Step 1: Ensure a personal org exists (create if needed)
    // This is the data-scaffolding org for personal-mode writes.
    // IMPORTANT: pass updateProfile=false so we NEVER overwrite organisation_id.
    const personalOrgId = await ensurePersonalOrg(user.id, false);
    if (!personalOrgId) {
      console.error("[auth:diag:swPersonal] failed to ensure personal org");
      return;
    }
    console.log("[auth:diag:swPersonal] Personal org ensured:", personalOrgId);

    // Step 2: Persist the personal org ID so dataService can resolve it
    await AsyncStorage.setItem(PERSONAL_ORG_ID_KEY, personalOrgId);
    console.log("[auth:diag:swPersonal] Personal org ID cached in AsyncStorage:", personalOrgId);

    // Step 3: Update ONLY workspace_mode — never touch organisation_id or memberships
    const { data: updateResult, error: updateErr } = await supabase
      .from("profiles")
      .update({ workspace_mode: "personal" } as any)
      .eq("id", user.id)
      .select("id, organisation_id, workspace_mode");

    if (updateErr) {
      console.error("[auth:diag:swPersonal] profile update FAILED:", updateErr.message, updateErr.code, updateErr.details, updateErr.hint);
      await dumpDbState(user.id, "AFTER switch to personal FAILED");
      return;
    }

    console.log("[auth:diag:swPersonal] profile update result:", JSON.stringify(updateResult));

    // Step 4: Refresh the in-memory profile
    const prof = await fetchProfile(user.id);
    if (prof) {
      console.log("[auth:diag:swPersonal] profile refreshed — orgId:", prof.organisationId, "wsMode:", prof.workspaceMode);
      setProfile(prof);
    } else {
      console.error("[auth:diag:swPersonal] fetchProfile returned NULL");
    }
    await dumpDbState(user.id, "AFTER switch to personal");
    console.log("[auth:diag:swPersonal] ===== switchToPersonalWorkspace END =====");
  }, [user, ensurePersonalOrg, fetchProfile, dumpDbState]);

  /**
   * Switch to organisation workspace — ONLY changes workspace_mode to 'organisation'.
   *
   * Validates that the user still has a valid membership before switching.
   * NEVER creates organisations, never deletes memberships.
   */
  const switchToOrganisationWorkspace = useCallback(async () => {
    if (!user) {
      console.error("[auth:diag:swOrg] ===== switchToOrganisationWorkspace FAILED: no user =====");
      return;
    }
    console.log("[auth:diag:swOrg] ===== switchToOrganisationWorkspace START =====");
    console.log("[auth:diag:swOrg] In-memory profile — orgId:", profile?.organisationId ?? "NULL", "wsMode:", profile?.workspaceMode ?? "NULL");
    await dumpDbState(user.id, "BEFORE switch to org");

    if (!profile?.organisationId) {
      console.error("[auth:diag:swOrg] FAILED: profile.organisationId is NULL — cannot switch to org workspace");
      console.error("[auth:diag:swOrg] This means the profile has no organisation_id set in the DB or the React state is stale");
      await dumpDbState(user.id, "AFTER switch to org FAILED (null organisationId)");
      throw new Error("Cannot switch to Organisation Workspace — you are not linked to any organisation. Create or join one first.");
    }

    console.log("[auth:diag:swOrg] profile.organisationId:", profile.organisationId);

    // Verify membership still exists for this org
    const { data: membership, error: memberErr } = await supabase
      .from("organisation_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organisation_id", profile.organisationId)
      .limit(1);

    if (memberErr) {
      console.error("[auth:diag:swOrg] Membership lookup FAILED:", memberErr.message, memberErr.code, memberErr.details, memberErr.hint);
      await dumpDbState(user.id, "AFTER switch to org FAILED (membership lookup error)");
      throw new Error(`Membership verification failed: ${memberErr.message} (code: ${memberErr.code})`);
    }

    if (!membership || membership.length === 0) {
      console.error(
        "[auth:diag:swOrg] FAILED: no membership found for org",
        profile.organisationId,
        "user:", user.id,
        "— cannot switch"
      );
      await dumpDbState(user.id, "AFTER switch to org FAILED (no membership)");
      throw new Error(`You are no longer a member of this organisation. Your membership may have been revoked, or the data is out of sync. Try refreshing.`);
    }

    console.log("[auth:diag:swOrg] Membership verified:", JSON.stringify(membership));

    // Update ONLY workspace_mode
    const { data: updateResult, error: updateErr } = await supabase
      .from("profiles")
      .update({ workspace_mode: "organisation" } as any)
      .eq("id", user.id)
      .select("id, organisation_id, workspace_mode");

    if (updateErr) {
      console.error("[auth:diag:swOrg] profile update FAILED:", updateErr.message, updateErr.code, updateErr.details, updateErr.hint);
      await dumpDbState(user.id, "AFTER switch to org FAILED (profile update error)");
      throw new Error(`Workspace switch failed: ${updateErr.message} (code: ${updateErr.code})`);
    }

    console.log("[auth:diag:swOrg] profile update result:", JSON.stringify(updateResult));

    const prof = await fetchProfile(user.id);
    if (prof) {
      console.log("[auth:diag:swOrg] profile refreshed — orgId:", prof.organisationId, "wsMode:", prof.workspaceMode);
      setProfile(prof);
    } else {
      console.error("[auth:diag:swOrg] fetchProfile returned NULL");
    }
    await dumpDbState(user.id, "AFTER switch to org");
    console.log("[auth:diag:swOrg] ===== switchToOrganisationWorkspace END =====");
  }, [user, profile, fetchProfile, dumpDbState]);

  /**
   * Permanently leave the current organisation — removes all memberships
   * and switches to personal workspace. This IS a destructive action; use
   * switchToPersonalWorkspace() for non-destructive view switching.
   */
  const leaveOrganisation = useCallback(async () => {
    if (!user) return;
    console.log("[auth:workspace] leaveOrganisation — permanently leaving org");

    // Delete all organisation memberships for this user
    const { data: memberships, error: fetchErr } = await supabase
      .from("organisation_members")
      .select("id")
      .eq("user_id", user.id);

    if (fetchErr) {
      console.error("[auth:workspace] leaveOrganisation: fetch memberships FAILED:", fetchErr.message);
      return;
    }

    if (memberships && memberships.length > 0) {
      for (const m of memberships as { id: string }[]) {
        const { error: delErr } = await supabase
          .from("organisation_members")
          .delete()
          .eq("id", m.id);
        if (delErr) {
          console.error("[auth:workspace] leaveOrganisation: delete membership FAILED:", delErr.message);
        }
      }
      console.log("[auth:workspace] leaveOrganisation: removed", memberships.length, "memberships");
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
