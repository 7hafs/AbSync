import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import {
  Building2,
  Users,
  Mail,
  Shield,
  ArrowRight,
  Check,
  X,
  ArrowLeft,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import {
  getInvitationByToken,
  acceptInvitation,
  InvitationRow,
} from "@/lib/dataService";

export default function JoinOrganisationScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { profile, setWorkspaceMode, refreshProfile } = useSupabaseAuth();

  const [token, setToken] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<InvitationRow | null>(null);

  // ── Look up token ─────────────────────────────────────────────────────

  const handleLookup = useCallback(async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError("Please enter an invitation token.");
      return;
    }
    setIsLookingUp(true);
    setError(null);
    setInvitePreview(null);
    try {
      const invitation = await getInvitationByToken(trimmed);
      if (!invitation) {
        setError("Invitation not found. Check your token and try again.");
        return;
      }
      if (invitation.status === "expired") {
        setError("This invitation has expired. Ask your admin to send a new one.");
        return;
      }
      if (invitation.status === "revoked") {
        setError("This invitation has been revoked.");
        return;
      }
      if (invitation.status === "accepted") {
        setError("This invitation has already been accepted.");
        return;
      }
      if (invitation.status !== "pending") {
        setError(`This invitation is ${invitation.status}.`);
        return;
      }
      setInvitePreview(invitation);
    } catch (err) {
      setError("Failed to look up invitation. Please try again.");
    } finally {
      setIsLookingUp(false);
    }
  }, [token]);

  // ── Join organisation ─────────────────────────────────────────────────

  const handleJoin = useCallback(async () => {
    if (!invitePreview) return;
    if (!profile?.email) {
      setError("Your account has no email address. Please contact support.");
      return;
    }
    setIsJoining(true);
    setError(null);
    try {
      const result = await acceptInvitation(
        invitePreview.token,
        profile.id,
        profile.email
      );
      if (!result.success) {
        setError(result.error ?? "Failed to join organisation.");
        return;
      }
      // Update workspace mode to organisation with the new org ID
      if (result.orgId) {
        await setWorkspaceMode("organisation", result.orgId);
      }
      await refreshProfile();
      Alert.alert(
        "Welcome!",
        "You've joined the organisation. You are now in Organisation Workspace.",
        [{ text: "OK", onPress: () => router.replace("/settings/workspace" as never) }]
      );
    } catch (err) {
      setError("Failed to join organisation. Please try again.");
    } finally {
      setIsJoining(false);
    }
  }, [invitePreview, profile, setWorkspaceMode, refreshProfile, router]);

  // ── Reset ─────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setToken("");
    setInvitePreview(null);
    setError(null);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
    return labels[role] ?? role;
  };

  const roleColor = (role: string) => {
    const map: Record<string, string> = { owner: "#F59E0B", manager: "#6366F1", staff: "#22C55E" };
    return map[role] ?? colors.secondaryText;
  };

  return (
    <ThemedView style={styles.container} useGradient>
      <Stack.Screen options={{ title: "Join Organisation" }} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color={colors.text} />
          <ThemedText>Back</ThemedText>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: "rgba(99, 102, 241, 0.1)" }]}>
            <Mail size={28} color="#6366F1" />
          </View>
          <ThemedText size="xlarge" weight="bold" style={styles.title}>
            Join Organisation
          </ThemedText>
          <ThemedText variant="secondary" style={styles.subtitle}>
            Enter the invitation token shared by your team admin to join their organisation.
          </ThemedText>
        </View>

        {/* Form */}
        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.card, borderColor: invitePreview ? "#22C55E" : colors.border },
          ]}
        >
          {!invitePreview ? (
            /* Token input phase */
            <>
              <ThemedText weight="semibold" style={styles.label}>
                Invitation Token
              </ThemedText>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    color: colors.text,
                    backgroundColor: colors.surfaceVariant,
                    borderColor: error ? "#EF4444" : colors.border,
                  },
                ]}
                value={token}
                onChangeText={(t) => { setToken(t); setError(null); }}
                placeholder="Paste your invitation token here"
                placeholderTextColor={colors.secondaryText}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={handleLookup}
              />

              {error && (
                <View style={styles.errorBanner}>
                  <X size={14} color="#EF4444" />
                  <ThemedText size="small" style={{ color: "#EF4444", flex: 1 }}>
                    {error}
                  </ThemedText>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: "#6366F1", opacity: isLookingUp ? 0.7 : 1 },
                ]}
                onPress={handleLookup}
                disabled={isLookingUp || !token.trim()}
                activeOpacity={0.7}
              >
                {isLookingUp ? (
                  <>
                    <ActivityIndicator size="small" color="white" />
                    <ThemedText style={styles.primaryButtonText} weight="bold">
                      Looking up...
                    </ThemedText>
                  </>
                ) : (
                  <>
                    <Mail size={20} color="white" />
                    <ThemedText style={styles.primaryButtonText} weight="bold">
                      Verify Token
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            /* Preview & confirm phase */
            <>
              {/* Valid token indicator */}
              <View style={styles.validBanner}>
                <Check size={16} color="#22C55E" />
                <ThemedText weight="semibold" style={{ color: "#16A34A" }}>
                  Token Verified
                </ThemedText>
              </View>

              {/* Organisation preview */}
              <View style={styles.previewCard}>
                <View style={styles.previewRow}>
                  <Building2 size={18} color="#6366F1" />
                  <View style={styles.previewInfo}>
                    <ThemedText variant="secondary" size="small">
                      Organisation
                    </ThemedText>
                    <ThemedText weight="semibold">
                      {invitePreview.organisation_id}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.previewRow}>
                  <Mail size={18} color="#6366F1" />
                  <View style={styles.previewInfo}>
                    <ThemedText variant="secondary" size="small">
                      Invited email
                    </ThemedText>
                    <ThemedText weight="semibold">
                      {invitePreview.email}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.previewRow}>
                  <Shield size={18} color={roleColor(invitePreview.role)} />
                  <View style={styles.previewInfo}>
                    <ThemedText variant="secondary" size="small">
                      You'll join as
                    </ThemedText>
                    <View style={[styles.roleBadge, { backgroundColor: roleColor(invitePreview.role) + "18" }]}>
                      <ThemedText
                        size="small"
                        weight="semibold"
                        style={{ color: roleColor(invitePreview.role) }}
                      >
                        {roleLabel(invitePreview.role)}
                      </ThemedText>
                    </View>
                  </View>
                </View>

                {invitePreview.inviter_name && (
                  <View style={styles.previewRow}>
                    <Users size={18} color="#6366F1" />
                    <View style={styles.previewInfo}>
                      <ThemedText variant="secondary" size="small">
                        Invited by
                      </ThemedText>
                      <ThemedText weight="semibold">
                        {invitePreview.inviter_name}
                      </ThemedText>
                    </View>
                  </View>
                )}

                <View style={styles.previewRow}>
                  <Shield size={18} color={colors.secondaryText} />
                  <View style={styles.previewInfo}>
                    <ThemedText variant="secondary" size="small">
                      Expires
                    </ThemedText>
                    <ThemedText weight="semibold">
                      {new Date(invitePreview.expires_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </ThemedText>
                  </View>
                </View>
              </View>

              {error && (
                <View style={styles.errorBanner}>
                  <X size={14} color="#EF4444" />
                  <ThemedText size="small" style={{ color: "#EF4444", flex: 1 }}>
                    {error}
                  </ThemedText>
                </View>
              )}

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    { backgroundColor: "#22C55E", opacity: isJoining ? 0.7 : 1, flex: 1 },
                  ]}
                  onPress={handleJoin}
                  disabled={isJoining}
                  activeOpacity={0.7}
                >
                  {isJoining ? (
                    <>
                      <ActivityIndicator size="small" color="white" />
                      <ThemedText style={styles.primaryButtonText} weight="bold">
                        Joining...
                      </ThemedText>
                    </>
                  ) : (
                    <>
                      <Users size={20} color="white" />
                      <ThemedText style={styles.primaryButtonText} weight="bold">
                        Join Organisation
                      </ThemedText>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.secondaryButton,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                  onPress={handleReset}
                  disabled={isJoining}
                >
                  <ThemedText variant="secondary" weight="semibold">
                    Cancel
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Info footer */}
        <ThemedText variant="secondary" size="small" style={styles.footerNote}>
          Joining an organisation will switch you to Organisation Workspace.{"\n"}
          You can switch back to Personal Workspace at any time from Settings.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },

  // Back
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: 28,
    gap: 8,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { letterSpacing: -0.5, textAlign: "center" },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: "center" },

  // Form
  formCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  label: { fontSize: 13 },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },

  // Error / valid banners
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  validBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(34, 197, 94, 0.08)",
  },

  // Preview card
  previewCard: {
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: "rgba(99, 102, 241, 0.04)",
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  previewInfo: {
    flex: 1,
    gap: 2,
  },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // Actions
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
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
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
  },

  // Footer
  footerNote: {
    textAlign: "center",
    marginTop: 20,
    lineHeight: 20,
  },
});
