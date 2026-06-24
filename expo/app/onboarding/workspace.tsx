import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import {
  User,
  Building2,
  Users,
  ArrowRight,
  ArrowLeft,
  Check,
  Mail,
  Shield,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { acceptInvitation, getInvitationByToken } from "@/lib/dataService";

export default function WorkspaceOnboardingScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { profile, setWorkspaceMode, refreshProfile } = useSupabaseAuth();

  const [step, setStep] = useState<"choose" | "create-org" | "join-org" | "joining">("choose");
  const [orgName, setOrgName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<{
    orgName?: string;
    email?: string;
    role?: string;
  } | null>(null);

  // ── Choose Personal Workspace ──────────────────────────────────────────

  const handleChoosePersonal = useCallback(async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await setWorkspaceMode("personal");
      await refreshProfile();
      router.replace("/" as never);
    } catch (err) {
      setError("Failed to set up your personal workspace. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [setWorkspaceMode, refreshProfile, router]);

  // ── Create Organisation ────────────────────────────────────────────────

  const handleCreateOrganisation = useCallback(async () => {
    if (!orgName.trim()) {
      setError("Please enter an organisation name.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      console.log("[onboarding:diag] Creating organisation with name:", orgName.trim());
      await setWorkspaceMode("organisation", orgName.trim());
      await refreshProfile();
      console.log("[onboarding:diag] Organisation creation complete — navigating to dashboard");
      router.replace("/" as never);
    } catch (err) {
      console.error("[onboarding:diag] Organisation creation FAILED:", err);
      setError("Failed to create your organisation. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [orgName, setWorkspaceMode, refreshProfile, router]);

  // ── Preview invitation token ───────────────────────────────────────────

  const handlePreviewToken = useCallback(async () => {
    if (!inviteToken.trim()) {
      setError("Please enter an invitation token.");
      return;
    }
    setError(null);
    setInvitePreview(null);

    try {
      const invitation = await getInvitationByToken(inviteToken.trim());
      if (!invitation) {
        setError("Invitation not found. Check your token and try again.");
        return;
      }
      if (invitation.status !== "pending") {
        setError(`This invitation is ${invitation.status}. It may have expired or been revoked.`);
        return;
      }
      setInvitePreview({
        email: invitation.email,
        role: invitation.role,
      });
    } catch (err) {
      console.error("[onboarding:diag] getInvitationByToken FAILED:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to look up invitation: ${message}`);
    }
  }, [inviteToken]);

  // ── Join Organisation ──────────────────────────────────────────────────

  const handleJoinOrganisation = useCallback(async () => {
    if (!inviteToken.trim()) {
      setError("Please enter an invitation token.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      if (!profile?.email) {
        setError("Your account has no email. Please contact support.");
        setIsProcessing(false);
        return;
      }
      const result = await acceptInvitation(
        inviteToken.trim(),
        profile.id,
        profile.email
      );
      if (!result.success) {
        console.error("[onboarding:diag] acceptInvitation FAILED:", result.error);
        setError(result.error ?? "Failed to join organisation.");
        setIsProcessing(false);
        return;
      }
      console.log("[onboarding:diag] acceptInvitation SUCCESS — orgId:", result.orgId);
      // Update profile with the new org (pass orgId as UUID for joining flow)
      await setWorkspaceMode("organisation", result.orgId);
      await refreshProfile();
      router.replace("/" as never);
    } catch (err) {
      setError("Failed to join organisation. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [inviteToken, profile, setWorkspaceMode, refreshProfile, router]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (isProcessing) {
    return (
      <ThemedView style={styles.container} useGradient>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText variant="secondary" style={styles.loadingText}>
            {step === "joining" ? "Joining organisation..." : "Setting up your workspace..."}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container} useGradient>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step: Choose ───────────────────────────────────────────────── */}
        {step === "choose" && (
          <>
            <View style={styles.header}>
              <ThemedText size="xlarge" weight="bold" style={styles.title}>
                Welcome to AbSync
              </ThemedText>
              <ThemedText variant="secondary" style={styles.subtitle}>
                How would you like to get started?
              </ThemedText>
            </View>

            {/* Personal Workspace Card */}
            <TouchableOpacity
              style={[
                styles.optionCard,
                { backgroundColor: colors.card, borderColor: "rgba(15, 118, 110, 0.2)" },
              ]}
              onPress={handleChoosePersonal}
              activeOpacity={0.7}
            >
              <View style={[styles.optionIcon, { backgroundColor: "rgba(15, 118, 110, 0.1)" }]}>
                <User size={32} color={colors.primary} />
              </View>
              <View style={styles.optionContent}>
                <ThemedText weight="bold" style={styles.optionTitle}>
                  Personal Workspace
                </ThemedText>
                <ThemedText variant="secondary" style={styles.optionDesc}>
                  Track your own absences, manage staff, and use the calendar
                  independently. No teams or approvals needed.
                </ThemedText>
                <View style={styles.featureList}>
                  <FeatureItem icon={Check} color="#22C55E" text="Your data, your control" />
                  <FeatureItem icon={Check} color="#22C55E" text="No invitations or approvals" />
                  <FeatureItem icon={Check} color="#22C55E" text="All features unlocked" />
                </View>
              </View>
              <ArrowRight size={24} color={colors.primary} />
            </TouchableOpacity>

            {/* Organisation Workspace Card */}
            <TouchableOpacity
              style={[
                styles.optionCard,
                { backgroundColor: colors.card, borderColor: "rgba(99, 102, 241, 0.2)" },
              ]}
              onPress={() => setStep("create-org")}
              activeOpacity={0.7}
            >
              <View style={[styles.optionIcon, { backgroundColor: "rgba(99, 102, 241, 0.1)" }]}>
                <Building2 size={32} color="#6366F1" />
              </View>
              <View style={styles.optionContent}>
                <ThemedText weight="bold" style={[styles.optionTitle, { color: "#6366F1" }]}>
                  Organisation Workspace
                </ThemedText>
                <ThemedText variant="secondary" style={styles.optionDesc}>
                  Share a calendar with your team. Manage absences, approvals,
                  roles, and invitations across your organisation.
                </ThemedText>
                <View style={styles.featureList}>
                  <FeatureItem icon={Users} color="#6366F1" text="Shared calendar & staff" />
                  <FeatureItem icon={Shield} color="#6366F1" text="Roles & permissions" />
                  <FeatureItem icon={Mail} color="#6366F1" text="Invite team members" />
                </View>
              </View>
              <ArrowRight size={24} color="#6366F1" />
            </TouchableOpacity>

            <ThemedText variant="secondary" size="small" style={styles.footerNote}>
              You can switch between modes at any time from Settings.
            </ThemedText>
          </>
        )}

        {/* ── Step: Create Organisation ─────────────────────────────────── */}
        {step === "create-org" && (
          <>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { setStep("choose"); setError(null); }}
            >
              <ArrowLeft size={20} color={colors.text} />
              <ThemedText>Back</ThemedText>
            </TouchableOpacity>

            <View style={styles.header}>
              <ThemedText size="xlarge" weight="bold" style={styles.title}>
                Create Organisation
              </ThemedText>
              <ThemedText variant="secondary" style={styles.subtitle}>
                Set up your team workspace
              </ThemedText>
            </View>

            <View
              style={[
                styles.formCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ThemedText weight="semibold" style={styles.label}>
                Organisation Name
              </ThemedText>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                  },
                ]}
                value={orgName}
                onChangeText={(t) => { setOrgName(t); setError(null); }}
                placeholder="e.g. Acme Corp"
                placeholderTextColor={colors.secondaryText}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreateOrganisation}
              />

              {error && (
                <ThemedText size="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              )}

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: "#6366F1" }]}
                  onPress={handleCreateOrganisation}
                >
                  <Building2 size={20} color="white" />
                  <ThemedText style={styles.primaryButtonText} weight="bold">
                    Create Organisation
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                  onPress={() => setStep("join-org")}
                >
                  <ThemedText variant="secondary" weight="semibold">
                    Join an existing organisation instead
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        {/* ── Step: Join Organisation ────────────────────────────────────── */}
        {(step === "join-org" || step === "joining") && (
          <>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { setStep("create-org"); setError(null); setInvitePreview(null); }}
            >
              <ArrowLeft size={20} color={colors.text} />
              <ThemedText>Back</ThemedText>
            </TouchableOpacity>

            <View style={styles.header}>
              <ThemedText size="xlarge" weight="bold" style={styles.title}>
                Join Organisation
              </ThemedText>
              <ThemedText variant="secondary" style={styles.subtitle}>
                Enter the invitation token shared by your team admin
              </ThemedText>
            </View>

            <View
              style={[
                styles.formCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <ThemedText weight="semibold" style={styles.label}>
                Invitation Token
              </ThemedText>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceVariant,
                    borderColor: invitePreview ? "#22C55E" : colors.border,
                  },
                ]}
                value={inviteToken}
                onChangeText={(t) => { setInviteToken(t); setError(null); setInvitePreview(null); }}
                placeholder="Paste your invitation token"
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />

              {invitePreview && (
                <View style={styles.previewCard}>
                  <Shield size={16} color="#6366F1" />
                  <ThemedText weight="semibold" style={{ color: "#6366F1" }}>
                    {invitePreview.role
                      ? `You'll join as ${invitePreview.role}`
                      : "Valid invitation"}
                  </ThemedText>
                </View>
              )}

              {error && (
                <ThemedText size="small" style={styles.errorText}>
                  {error}
                </ThemedText>
              )}

              <View style={styles.formActions}>
                {!invitePreview ? (
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: "#6366F1" }]}
                    onPress={handlePreviewToken}
                  >
                    <Mail size={20} color="white" />
                    <ThemedText style={styles.primaryButtonText} weight="bold">
                      Look Up Token
                    </ThemedText>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: "#22C55E" }]}
                    onPress={() => { setStep("joining"); handleJoinOrganisation(); }}
                  >
                    <Users size={20} color="white" />
                    <ThemedText style={styles.primaryButtonText} weight="bold">
                      Join Organisation
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

// ── Feature item helper ─────────────────────────────────────────────────────

function FeatureItem({
  icon: Icon,
  color,
  text,
}: {
  icon: typeof Check;
  color: string;
  text: string;
}) {
  return (
    <View style={styles.featureItem}>
      <Icon size={14} color={color} />
      <ThemedText variant="secondary" size="small">
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: { marginTop: 8 },

  // Header
  header: { marginBottom: 32, gap: 8 },
  title: { letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22 },

  // Option cards
  optionCard: {
    flexDirection: "row",
    borderWidth: 2,
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    gap: 16,
    alignItems: "flex-start",
  },
  optionIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionTitle: { fontSize: 18, marginBottom: 4 },
  optionDesc: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  featureList: { gap: 6 },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  // Back button
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },

  // Form
  formCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  label: { fontSize: 13, marginBottom: -8 },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  previewCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
  },
  errorText: { color: "#EF4444", fontSize: 13 },
  formActions: { gap: 12 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },

  // Footer
  footerNote: {
    textAlign: "center",
    marginTop: 16,
    lineHeight: 20,
  },
});
