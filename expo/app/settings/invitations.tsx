import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Stack } from "expo-router";
import { useColorScheme } from "react-native";
import {
  Mail,
  UserPlus,
  Shield,
  Clock,
  XCircle,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Ban,
  History,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useInvitationStore } from "@/store/useInvitationStore";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "#0F766E",
  manager: "#6366F1",
  staff: "#64748B",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  accepted: "#22C55E",
  revoked: "#EF4444",
  expired: "#94A3B8",
};

export default function InvitationsScreen() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { profile } = useSupabaseAuth();
  const {
    invitations,
    isLoading,
    error,
    isProcessing,
    lastMessage,
    loadInvitations,
    inviteMember,
    revoke,
    resend,
    clearMessage,
  } = useInvitationStore();

  const [emailInput, setEmailInput] = useState("");
  const [selectedRole, setSelectedRole] = useState("staff");
  const [showForm, setShowForm] = useState(false);

  // Load invitations when we have an org ID
  useEffect(() => {
    if (profile?.organisationId) {
      loadInvitations(profile.organisationId);
    }
  }, [profile?.organisationId, loadInvitations]);

  // Clear last message after 4 seconds
  useEffect(() => {
    if (lastMessage) {
      const timer = setTimeout(() => clearMessage(), 4000);
      return () => clearTimeout(timer);
    }
  }, [lastMessage, clearMessage]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleInvite = useCallback(async () => {
    if (!profile?.organisationId || !emailInput.trim()) return;

    const errorMsg = await inviteMember(
      profile.organisationId,
      emailInput.trim(),
      selectedRole,
      profile.id
    );

    if (!errorMsg) {
      setEmailInput("");
      setShowForm(false);
    }
  }, [profile, emailInput, selectedRole, inviteMember]);

  const handleRevoke = useCallback(
    (invitationId: string, email: string) => {
      Alert.alert(
        "Revoke Invitation",
        `Are you sure you want to revoke the invitation sent to ${email}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Revoke",
            style: "destructive",
            onPress: () => revoke(invitationId),
          },
        ]
      );
    },
    [revoke]
  );

  const handleResend = useCallback(
    (invitationId: string, email: string) => {
      Alert.alert(
        "Resend Invitation",
        `Extend the invitation expiry for ${email} by 7 days?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Resend",
            onPress: () => resend(invitationId),
          },
        ]
      );
    },
    [resend]
  );

  // ── Format helpers ──────────────────────────────────────────────────────

  const formatExpiry = (expiresAt: string) => {
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return "Expired";
    if (diffDays === 1) return "Expires tomorrow";
    return `Expires in ${diffDays} days`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  // ── Role picker ─────────────────────────────────────────────────────────

  const roleOption = (role: string) => {
    const isSelected = selectedRole === role;
    const roleColor = ROLE_COLORS[role] ?? colors.secondaryText;
    return (
      <TouchableOpacity
        key={role}
        style={[
          styles.roleOption,
          {
            backgroundColor: isSelected ? roleColor + "22" : colors.surfaceVariant,
            borderColor: isSelected ? roleColor : "transparent",
          },
        ]}
        onPress={() => setSelectedRole(role)}
      >
        <ThemedText
          size="small"
          weight={isSelected ? "semibold" : undefined}
          style={{ color: isSelected ? roleColor : colors.secondaryText }}
        >
          {ROLE_LABELS[role] ?? role}
        </ThemedText>
      </TouchableOpacity>
    );
  };

  // ── Render help text when no invitations exist ──────────────────────────

  const renderEmptyState = () => (
    <View
      style={[
        styles.emptyCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <Mail size={40} color={colors.secondaryText} />
      <ThemedText weight="semibold" style={styles.emptyTitle}>
        No pending invitations
      </ThemedText>
      <ThemedText
        variant="secondary"
        size="small"
        style={styles.emptySubtext}
      >
        Invite team members to join your organisation.{"\n"}
        They'll receive access once they sign in with the invited email address.
      </ThemedText>
    </View>
  );

  // ── Loading state ───────────────────────────────────────────────────────

  if (isLoading && invitations.length === 0) {
    return (
      <ThemedView style={styles.container} useGradient>
        <Stack.Screen options={{ title: "Invitations" }} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText variant="secondary" style={styles.loadingText}>
            Loading invitations...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container} useGradient>
      <Stack.Screen
        options={{
          title: "Invitations",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                if (profile?.organisationId) {
                  loadInvitations(profile.organisationId);
                }
              }}
              style={styles.headerRefresh}
            >
              <RefreshCw size={18} color={colors.primary} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Status message ──────────────────────────────────────────────── */}
        {lastMessage && (
          <View
            style={[
              styles.statusBar,
              {
                backgroundColor: lastMessage.includes("Failed") || lastMessage.includes("already")
                  ? "rgba(239, 68, 68, 0.1)"
                  : "rgba(34, 197, 94, 0.1)",
                borderColor: lastMessage.includes("Failed") || lastMessage.includes("already")
                  ? "rgba(239, 68, 68, 0.3)"
                  : "rgba(34, 197, 94, 0.3)",
              },
            ]}
          >
            {lastMessage.includes("Failed") || lastMessage.includes("already") ? (
              <AlertTriangle size={16} color="#EF4444" />
            ) : (
              <CheckCircle2 size={16} color="#22C55E" />
            )}
            <ThemedText
              size="small"
              style={{
                flex: 1,
                color: lastMessage.includes("Failed") || lastMessage.includes("already")
                  ? "#EF4444"
                  : "#22C55E",
              }}
            >
              {lastMessage}
            </ThemedText>
          </View>
        )}

        {/* ── Invite Member Form ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText size="large" weight="bold">
              Invite Member
            </ThemedText>
            {!showForm && (
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={() => setShowForm(true)}
              >
                <UserPlus size={18} color="white" />
                <ThemedText style={styles.addButtonText} weight="semibold">
                  Invite
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>

          {showForm && (
            <View
              style={[
                styles.formCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.formField}>
                <ThemedText weight="semibold" style={styles.fieldLabel}>
                  Email Address
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
                  value={emailInput}
                  onChangeText={setEmailInput}
                  placeholder="colleague@company.com"
                  placeholderTextColor={colors.secondaryText}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleInvite}
                />
              </View>

              <View style={styles.formField}>
                <ThemedText weight="semibold" style={styles.fieldLabel}>
                  Role
                </ThemedText>
                <View style={styles.rolePicker}>
                  {roleOption("staff")}
                  {roleOption("manager")}
                  {roleOption("owner")}
                </View>
              </View>

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                  onPress={() => {
                    setShowForm(false);
                    setEmailInput("");
                  }}
                  disabled={isProcessing}
                >
                  <XCircle size={18} color={colors.secondaryText} />
                  <ThemedText variant="secondary" weight="semibold">
                    Cancel
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    { backgroundColor: colors.primary },
                    isProcessing && styles.disabledButton,
                  ]}
                  onPress={handleInvite}
                  disabled={isProcessing || !emailInput.trim()}
                >
                  {isProcessing ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Send size={18} color="white" />
                  )}
                  <ThemedText
                    style={styles.sendButtonText}
                    weight="semibold"
                  >
                    {isProcessing ? "Sending..." : "Send Invitation"}
                  </ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── Pending Invitations ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ThemedText size="large" weight="bold">
              Pending Invitations
            </ThemedText>
            <View
              style={[
                styles.countBadge,
                { backgroundColor: colors.primary + "18" },
              ]}
            >
              <ThemedText
                size="small"
                weight="semibold"
                style={{ color: colors.primary }}
              >
                {invitations.length}
              </ThemedText>
            </View>
          </View>

          {error && invitations.length === 0 && (
            <View style={styles.inlineError}>
              <AlertTriangle size={14} color="#EF4444" />
              <ThemedText size="small" style={{ color: "#EF4444", flex: 1 }}>
                {error}
              </ThemedText>
              <TouchableOpacity
                onPress={() => {
                  if (profile?.organisationId) {
                    loadInvitations(profile.organisationId);
                  }
                }}
              >
                <RefreshCw size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}

          {invitations.length === 0 && !error ? (
            renderEmptyState()
          ) : (
            invitations.map((inv, i) => (
              <View
                key={inv.id}
                style={[
                  styles.invitationCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                  isExpired(inv.expires_at) && styles.expiredCard,
                ]}
              >
                {/* Top row: email + status */}
                <View style={styles.invitationTop}>
                  <View style={styles.invitationEmailRow}>
                    <Mail size={18} color={colors.primary} />
                    <ThemedText weight="semibold" style={styles.invitationEmail}>
                      {inv.email}
                    </ThemedText>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          (isExpired(inv.expires_at)
                            ? STATUS_COLORS.expired
                            : STATUS_COLORS.pending) + "18",
                      },
                    ]}
                  >
                    <Clock size={12} color={isExpired(inv.expires_at) ? STATUS_COLORS.expired : STATUS_COLORS.pending} />
                    <ThemedText
                      size="small"
                      weight="semibold"
                      style={{
                        color: isExpired(inv.expires_at)
                          ? STATUS_COLORS.expired
                          : STATUS_COLORS.pending,
                        fontSize: 11,
                      }}
                    >
                      {isExpired(inv.expires_at) ? "Expired" : "Pending"}
                    </ThemedText>
                  </View>
                </View>

                {/* Detail row: role + invited by + expiry */}
                <View style={styles.invitationDetails}>
                  <View style={styles.detailChip}>
                    <Shield size={12} color={ROLE_COLORS[inv.role] ?? colors.secondaryText} />
                    <ThemedText
                      size="small"
                      style={{
                        color: ROLE_COLORS[inv.role] ?? colors.secondaryText,
                        fontWeight: "600",
                        fontSize: 11,
                      }}
                    >
                      {ROLE_LABELS[inv.role] ?? inv.role}
                    </ThemedText>
                  </View>

                  <ThemedText variant="secondary" size="small">
                    {formatExpiry(inv.expires_at)}
                  </ThemedText>
                </View>

                {inv.inviter_name && (
                  <ThemedText variant="secondary" size="small" style={styles.inviterText}>
                    Invited by {inv.inviter_name} · {formatDate(inv.created_at)}
                  </ThemedText>
                )}

                {/* Actions */}
                <View style={styles.invitationActions}>
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      { backgroundColor: colors.surfaceVariant },
                    ]}
                    onPress={() => handleResend(inv.id, inv.email)}
                    disabled={isProcessing}
                  >
                    <Send size={14} color={colors.primary} />
                    <ThemedText size="small" style={{ color: colors.primary }}>
                      Resend
                    </ThemedText>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      { backgroundColor: "rgba(239, 68, 68, 0.08)" },
                    ]}
                    onPress={() => handleRevoke(inv.id, inv.email)}
                    disabled={isProcessing}
                  >
                    <Ban size={14} color="#EF4444" />
                    <ThemedText size="small" style={{ color: "#EF4444" }}>
                      Revoke
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            How Invitations Work
          </ThemedText>

          <View
            style={[
              styles.infoCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.infoStep}>
              <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                <ThemedText style={styles.stepNumberText} weight="bold">
                  1
                </ThemedText>
              </View>
              <View style={styles.stepContent}>
                <ThemedText weight="semibold">Send an invitation</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Enter your colleague's email and choose their role. Invitations
                  expire after 7 days.
                </ThemedText>
              </View>
            </View>

            <View style={styles.stepDivider} />

            <View style={styles.infoStep}>
              <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                <ThemedText style={styles.stepNumberText} weight="bold">
                  2
                </ThemedText>
              </View>
              <View style={styles.stepContent}>
                <ThemedText weight="semibold">They sign in</ThemedText>
                <ThemedText variant="secondary" size="small">
                  When your colleague signs into AbSync with the invited email,
                  they'll automatically join your organisation.
                </ThemedText>
              </View>
            </View>

            <View style={styles.stepDivider} />

            <View style={styles.infoStep}>
              <View style={[styles.stepNumber, { backgroundColor: colors.primary }]}>
                <ThemedText style={styles.stepNumberText} weight="bold">
                  3
                </ThemedText>
              </View>
              <View style={styles.stepContent}>
                <ThemedText weight="semibold">Shared access</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Once joined, they'll see your organisation's calendar, staff,
                  and absence records. Data is scoped to your organisation.
                </ThemedText>
              </View>
            </View>
          </View>
        </View>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <ThemedText variant="secondary" size="small" style={styles.footerText}>
            Managers can invite staff and other managers. Only the owner
            can grant owner permissions to another member.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  // ── Status bar ──────────────────────────────────────────────────────────
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },

  // ── Invite form ─────────────────────────────────────────────────────────
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  addButtonText: {
    color: "white",
    fontSize: 14,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  formField: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 16,
  },
  rolePicker: {
    flexDirection: "row",
    gap: 8,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
  },
  formActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sendButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  sendButtonText: {
    color: "white",
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.6,
  },

  // ── Count badge ─────────────────────────────────────────────────────────
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },

  // ── Invitation cards ────────────────────────────────────────────────────
  invitationCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    gap: 10,
  },
  expiredCard: {
    opacity: 0.6,
  },
  invitationTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  invitationEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  invitationEmail: {
    fontSize: 15,
    flexShrink: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  invitationDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
  },
  inviterText: {
    fontSize: 12,
  },
  invitationActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },

  // ── How it works ────────────────────────────────────────────────────────
  infoCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  infoStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepNumberText: {
    color: "white",
    fontSize: 13,
  },
  stepContent: {
    flex: 1,
    gap: 2,
  },
  stepDivider: {
    height: 16,
    width: 1,
    backgroundColor: "rgba(100, 116, 139, 0.2)",
    marginLeft: 13,
    marginVertical: 4,
  },

  // ── Permission denied state ─────────────────────────────────────────────
  deniedTitle: {
    fontSize: 18,
    marginTop: 8,
  },
  deniedSubtext: {
    textAlign: "center",
    lineHeight: 22,
    marginTop: 4,
  },

  // ── Empty / error states ────────────────────────────────────────────────
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  loadingText: {
    marginTop: 8,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
  },
  emptySubtext: {
    textAlign: "center",
    lineHeight: 20,
  },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },

  // ── Footer ─────────────────────────────────────────────────────────────
  footer: {
    marginTop: 8,
    alignItems: "center",
    padding: 16,
  },
  footerText: {
    textAlign: "center",
    lineHeight: 20,
  },
  headerRefresh: {
    padding: 4,
  },
});
