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
import { useRouter } from "expo-router";
import {
  Building2,
  Users,
  Crown,
  Hash,
  Shield,
  UserCircle,
  Pencil,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  UserPlus,
  ShieldAlert,
  MoreVertical,
  Trash2,
  ChevronUp,
  ChevronDown,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useOrganisationRole } from "@/hooks/useOrganisationRole";
import { ROLE_LABEL, ROLE_COLOR } from "@/lib/roles";
import { updateMemberRole, removeOrganisationMember, isMemberSoleOwner } from "@/lib/dataService";
import {
  useOrganisationStore,
  MemberInfo,
} from "@/store/useOrganisationStore";



export default function OrganisationScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { profile } = useSupabaseAuth();
  const {
    role,
    isOwner: userIsOwner,
    canInvite,
    canEditOrganisation,
    canManageMembers,
  } = useOrganisationRole();
  const {
    organisation,
    members,
    isLoading,
    error,
    isSaving,
    loadOrganisation,
    updateName,
  } = useOrganisationStore();

  const {
    setWorkspaceMode,
    switchToPersonalWorkspace,
  } = useSupabaseAuth();

  const [isEditing, setIsEditing] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [memberMenuOpen, setMemberMenuOpen] = useState<string | null>(null);

  // Load organisation data when we have a profile with org ID
  useEffect(() => {
    if (profile?.organisationId) {
      loadOrganisation(profile.organisationId);
    }
  }, [profile?.organisationId, loadOrganisation]);

  // ── Leave organisation ──────────────────────────────────────────────────

  const handleLeaveOrganisation = useCallback(async () => {
    if (!organisation) return;

    if (userIsOwner) {
      const otherOwners = members.filter(
        (m) => m.role === 'owner' && m.user_id !== profile?.id
      );
      if (otherOwners.length === 0 && members.length > 1) {
        Alert.alert(
          'Cannot Leave',
          'You are the only owner. Assign another owner before leaving, or remove all members first.'
        );
        return;
      }
    }

    Alert.alert(
      'Leave Organisation',
      `Are you sure you want to leave ${organisation.name}? Your personal data will remain safe.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            setIsLeaving(true);
            try {
              await switchToPersonalWorkspace();
              Alert.alert('Left Organisation', 'You are now in Personal Workspace mode.');
              router.back();
            } catch (err) {
              Alert.alert('Error', 'Failed to leave organisation. Please try again.');
            } finally {
              setIsLeaving(false);
            }
          },
        },
      ]
    );
  }, [organisation, userIsOwner, members, profile, switchToPersonalWorkspace, router]);

  // ── Edit name handlers ──────────────────────────────────────────────────

  const startEditing = useCallback(() => {
    if (organisation) {
      setNameDraft(organisation.name);
      setIsEditing(true);
    }
  }, [organisation]);

  const cancelEditing = useCallback(() => {
    setNameDraft(organisation?.name ?? "");
    setIsEditing(false);
  }, [organisation]);

  const saveName = useCallback(async () => {
    if (!organisation || !nameDraft.trim()) return;
    const ok = await updateName(organisation.id, nameDraft);
    if (ok) {
      setIsEditing(false);
    }
  }, [organisation, nameDraft, updateName]);

  // ── Member actions ──────────────────────────────────────────────────────

  const handlePromote = useCallback(async (member: MemberInfo) => {
    if (!organisation) return;
    setMemberMenuOpen(null);

    const nextRole = member.role === "staff" ? "manager" : "owner";
    const label = ROLE_LABEL[nextRole as keyof typeof ROLE_LABEL] ?? nextRole;

    Alert.alert(
      "Change Role",
      `Promote ${member.profile_name ?? member.user_id} to ${label}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Promote",
          onPress: async () => {
            const ok = await updateMemberRole(member.id, nextRole);
            if (ok && profile?.organisationId) {
              loadOrganisation(profile.organisationId);
            } else {
              Alert.alert("Error", "Failed to update member role. Please try again.");
            }
          },
        },
      ]
    );
  }, [organisation, profile?.organisationId, loadOrganisation]);

  const handleDemote = useCallback(async (member: MemberInfo) => {
    if (!organisation) return;
    setMemberMenuOpen(null);

    const nextRole = member.role === "owner" ? "manager" : "staff";
    const label = ROLE_LABEL[nextRole as keyof typeof ROLE_LABEL] ?? nextRole;

    Alert.alert(
      "Change Role",
      `Demote ${member.profile_name ?? member.user_id} to ${label}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Demote",
          style: "destructive",
          onPress: async () => {
            const ok = await updateMemberRole(member.id, nextRole);
            if (ok && profile?.organisationId) {
              loadOrganisation(profile.organisationId);
            } else {
              Alert.alert("Error", "Failed to update member role. Please try again.");
            }
          },
        },
      ]
    );
  }, [organisation, profile?.organisationId, loadOrganisation]);

  const handleRemove = useCallback(async (member: MemberInfo) => {
    if (!organisation) return;
    setMemberMenuOpen(null);

    // Check sole owner safety
    if (member.role === "owner") {
      const soleOwner = await isMemberSoleOwner(member.id, organisation.id);
      if (soleOwner) {
        Alert.alert(
          "Cannot Remove",
          "This member is the only owner of the organisation. Assign another owner before removing them."
        );
        return;
      }
    }

    Alert.alert(
      "Remove Member",
      `Remove ${member.profile_name ?? member.user_id} from the organisation? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const ok = await removeOrganisationMember(member.id);
            if (ok && profile?.organisationId) {
              loadOrganisation(profile.organisationId);
            } else {
              Alert.alert("Error", "Failed to remove member. Please try again.");
            }
          },
        },
      ]
    );
  }, [organisation, profile?.organisationId, loadOrganisation]);

  // ── Derived data ────────────────────────────────────────────────────────

  const owner = members.find((m) => m.role === "owner");
  const ownerName =
    owner?.profile_name ?? "Unknown";
  const sortedMembers = [...members].sort((a, b) => {
    const order: Record<string, number> = { owner: 0, manager: 1, staff: 2 };
    return (order[a.role] ?? 99) - (order[b.role] ?? 99);
  });

  // ── Render helpers ──────────────────────────────────────────────────────

  const roleBadge = (memberRole: string, isCurrentUser: boolean) => {
    const label = ROLE_LABEL[memberRole as keyof typeof ROLE_LABEL] ?? memberRole;
    const roleColor = ROLE_COLOR[memberRole as keyof typeof ROLE_COLOR] ?? colors.secondaryText;
    return (
      <View style={styles.badgeRow}>
        <View style={[styles.roleBadge, { backgroundColor: roleColor + "18" }]}>
          <ThemedText
            size="small"
            weight="semibold"
            style={{ color: roleColor, fontSize: 11 }}
          >
            {label}
          </ThemedText>
        </View>
        {isCurrentUser && (
          <View style={[styles.youBadge, { backgroundColor: colors.primary + "18" }]}>
            <ThemedText
              size="small"
              weight="semibold"
              style={{ color: colors.primary, fontSize: 10 }}
            >
              You
            </ThemedText>
          </View>
        )}
      </View>
    );
  };

  // ── Loading state ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <ThemedView style={styles.container} useGradient>
        <Stack.Screen options={{ title: "Organisation" }} />
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText
            variant="secondary"
            style={styles.loadingText}
          >
            Loading organisation...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────

  if (error && !organisation) {
    return (
      <ThemedView style={styles.container} useGradient>
        <Stack.Screen options={{ title: "Organisation" }} />
        <View style={styles.centerState}>
          <AlertTriangle size={48} color={colors.secondaryText} />
          <ThemedText
            variant="secondary"
            style={styles.errorText}
          >
            {error}
          </ThemedText>
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: colors.primary },
            ]}
            onPress={() => {
              if (profile?.organisationId) {
                loadOrganisation(profile.organisationId);
              }
            }}
          >
            <RefreshCw size={16} color="white" />
            <ThemedText
              style={styles.retryButtonText}
              weight="semibold"
            >
              Retry
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  // ── No organisation state ───────────────────────────────────────────────

  if (!organisation) {
    return (
      <ThemedView style={styles.container} useGradient>
        <Stack.Screen options={{ title: "Organisation" }} />
        <View style={styles.centerState}>
          <Building2 size={48} color={colors.secondaryText} />
          <ThemedText
            variant="secondary"
            style={styles.emptyText}
          >
            No organisation found
          </ThemedText>
          <ThemedText
            variant="secondary"
            size="small"
            style={styles.emptySubtext}
          >
            An organisation is created automatically when you sign up.{"\n"}
            If you just signed up, try pulling to refresh.
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // ── Organisation loaded ─────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container} useGradient>
      <Stack.Screen
        options={{
          title: "Organisation",
          headerRight: () => (
            <TouchableOpacity
              onPress={() => {
                if (profile?.organisationId) {
                  loadOrganisation(profile.organisationId);
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
        {/* ── Organisation Name Hero ──────────────────────────────────────── */}
        <View style={styles.section}>
          <View
            style={[
              styles.heroCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Building2 size={36} color={colors.primary} />

            {/* Role badge for current user */}
            {role && (
              <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLOR[role] ?? colors.secondaryText) + "18" }]}>
                <ThemedText
                  size="small"
                  weight="semibold"
                  style={{ color: ROLE_COLOR[role] ?? colors.secondaryText, fontSize: 11 }}
                >
                  {ROLE_LABEL[role] ?? role}
                </ThemedText>
              </View>
            )}

            {isEditing ? (
              <View style={styles.editNameRow}>
                <TextInput
                  style={[
                    styles.nameInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceVariant,
                      borderColor: colors.primary,
                    },
                  ]}
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  autoFocus
                  selectTextOnFocus
                  returnKeyType="done"
                  onSubmitEditing={saveName}
                />
                <TouchableOpacity
                  style={[styles.iconBtn, { backgroundColor: colors.primary }]}
                  onPress={saveName}
                  disabled={isSaving || !nameDraft.trim()}
                >
                  {isSaving ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Check size={18} color="white" />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.iconBtn,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                  onPress={cancelEditing}
                  disabled={isSaving}
                >
                  <X size={18} color={colors.secondaryText} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.nameRow}
                onPress={canEditOrganisation ? startEditing : undefined}
                activeOpacity={canEditOrganisation ? 0.7 : 1}
              >
                <ThemedText size="xlarge" weight="bold" style={styles.orgName}>
                  {organisation.name}
                </ThemedText>
                {canEditOrganisation && (
                  <Pencil size={16} color={colors.secondaryText} />
                )}
              </TouchableOpacity>
            )}

            <ThemedText variant="secondary" size="small">
              Created{" "}
              {new Date(organisation.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </ThemedText>
          </View>
        </View>

        {/* ── Invite Members Action ──────────────────────────────────────── */}
        {canInvite && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[
                styles.inviteButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={() => router.push("/settings/invitations" as never)}
              activeOpacity={0.8}
            >
              <UserPlus size={22} color="white" />
              <View style={styles.inviteButtonTextContainer}>
                <ThemedText weight="bold" style={styles.inviteButtonTitle}>
                  Invite Members
                </ThemedText>
                <ThemedText style={styles.inviteButtonSubtitle}>
                  Add team members to your organisation
                </ThemedText>
              </View>
              <ChevronRight size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Staff: no invite permission notice ─────────────────────────── */}
        {!canInvite && (
          <View style={styles.section}>
            <View
              style={[
                styles.permissionNotice,
                { backgroundColor: "rgba(239, 68, 68, 0.06)", borderColor: "rgba(239, 68, 68, 0.15)" },
              ]}
            >
              <ShieldAlert size={18} color="#EF4444" />
              <View style={{ flex: 1 }}>
                <ThemedText size="small" weight="semibold" style={{ color: "#EF4444" }}>
                  Invitations restricted
                </ThemedText>
                <ThemedText size="small" variant="secondary">
                  Only owners and managers can invite new members.
                </ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* ── Overview Cards ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Overview
          </ThemedText>

          <View style={styles.cardRow}>
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Crown size={24} color={colors.primary} />
              <ThemedText
                variant="secondary"
                size="small"
                style={styles.statLabel}
              >
                Owner
              </ThemedText>
              <ThemedText weight="semibold" style={styles.statValue}>
                {ownerName}
              </ThemedText>
            </View>

            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Users size={24} color={colors.primary} />
              <ThemedText
                variant="secondary"
                size="small"
                style={styles.statLabel}
              >
                Members
              </ThemedText>
              <ThemedText weight="semibold" style={styles.statValue}>
                {members.length}
              </ThemedText>
            </View>
          </View>

          <View style={styles.cardRow}>
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Shield size={24} color={colors.primary} />
              <ThemedText
                variant="secondary"
                size="small"
                style={styles.statLabel}
              >
                Managers
              </ThemedText>
              <ThemedText weight="semibold" style={styles.statValue}>
                {members.filter((m) => m.role === "manager").length}
              </ThemedText>
            </View>

            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <UserCircle size={24} color={colors.primary} />
              <ThemedText
                variant="secondary"
                size="small"
                style={styles.statLabel}
              >
                Staff
              </ThemedText>
              <ThemedText weight="semibold" style={styles.statValue}>
                {members.filter((m) => m.role === "staff").length}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* ── Members List ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Members
          </ThemedText>

          {members.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Users size={32} color={colors.secondaryText} />
              <ThemedText variant="secondary">
                No members found
              </ThemedText>
              <ThemedText variant="secondary" size="small">
                Members will appear here once invitations are enabled.
              </ThemedText>
            </View>
          ) : (
            sortedMembers.map((member, i) => (
              <View
                key={member.id}
                style={[
                  styles.memberCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                  i === sortedMembers.length - 1 && styles.memberCardLast,
                ]}
              >
                <View style={styles.memberAvatar}>
                  <UserCircle size={28} color={colors.primary} />
                </View>
                <View style={styles.memberInfo}>
                  <View style={styles.memberNameRow}>
                    <ThemedText weight="semibold">
                      {member.profile_name ?? "Unknown User"}
                    </ThemedText>
                    {roleBadge(member.role, member.user_id === profile?.id)}
                  </View>
                  {member.profile_email && (
                    <ThemedText variant="secondary" size="small">
                      {member.profile_email}
                    </ThemedText>
                  )}
                </View>

                {/* Owner-only: member management menu */}
                {canManageMembers && member.user_id !== profile?.id && (
                  <View style={styles.memberMenuContainer}>
                    <TouchableOpacity
                      style={styles.memberMenuButton}
                      onPress={() =>
                        setMemberMenuOpen(
                          memberMenuOpen === member.id ? null : member.id
                        )
                      }
                    >
                      <MoreVertical size={18} color={colors.secondaryText} />
                    </TouchableOpacity>

                    {memberMenuOpen === member.id && (
                      <View
                        style={[
                          styles.memberContextMenu,
                          {
                            backgroundColor: colors.surfaceVariant,
                            borderColor: colors.border,
                          },
                        ]}
                      >
                        {member.role !== "owner" && (
                          <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handlePromote(member)}
                          >
                            <ChevronUp size={16} color={colors.primary} />
                            <ThemedText size="small" style={{ color: colors.primary }}>
                              Promote
                            </ThemedText>
                          </TouchableOpacity>
                        )}
                        {member.role !== "staff" && (
                          <TouchableOpacity
                            style={styles.menuItem}
                            onPress={() => handleDemote(member)}
                          >
                            <ChevronDown size={16} color="#F59E0B" />
                            <ThemedText size="small" style={{ color: "#F59E0B" }}>
                              Demote
                            </ThemedText>
                          </TouchableOpacity>
                        )}
                        <View style={styles.menuDivider} />
                        <TouchableOpacity
                          style={styles.menuItem}
                          onPress={() => handleRemove(member)}
                        >
                          <Trash2 size={16} color="#EF4444" />
                          <ThemedText size="small" style={{ color: "#EF4444" }}>
                            Remove
                          </ThemedText>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            ))
          )}

          {error && organisation && (
            <View style={styles.inlineError}>
              <AlertTriangle size={14} color="#EF4444" />
              <ThemedText size="small" style={{ color: "#EF4444", flex: 1 }}>
                {error}
              </ThemedText>
            </View>
          )}
        </View>

        {/* ── Organisation ID (debug) ─────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Details
          </ThemedText>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Hash size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Organisation ID</ThemedText>
                <ThemedText
                  variant="secondary"
                  size="small"
                  style={styles.monoText}
                  numberOfLines={1}
                  selectable
                >
                  {organisation.id}
                </ThemedText>
              </View>
            </View>
          </View>

          {organisation.slug && (
            <View
              style={[
                styles.settingItem,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.settingContent}>
                <Hash size={22} color={colors.primary} />
                <View style={styles.settingTextContainer}>
                  <ThemedText weight="semibold">Slug</ThemedText>
                  <ThemedText
                    variant="secondary"
                    size="small"
                    style={styles.monoText}
                    selectable
                  >
                    {organisation.slug}
                  </ThemedText>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Leave Organisation ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.leaveButton,
              { backgroundColor: "rgba(239, 68, 68, 0.08)", borderColor: "rgba(239, 68, 68, 0.2)" },
            ]}
            onPress={handleLeaveOrganisation}
            disabled={isLeaving}
            activeOpacity={0.7}
          >
            {isLeaving ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Trash2 size={20} color="#EF4444" />
                <ThemedText weight="semibold" style={{ color: "#EF4444" }}>
                  Leave Organisation
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
          <ThemedText variant="secondary" size="small" style={{ textAlign: "center", marginTop: 8 }}>
            Leaving will switch you to Personal Workspace mode.{'\n'}
            All your personal data remains safe.
          </ThemedText>
        </View>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <ThemedText
            variant="secondary"
            size="small"
            style={styles.footerText}
          >
            {userIsOwner
              ? "As the owner, you control who can invite members and manage the organisation. Invite team members to share your calendar, staff records, and absence data."
              : role === "manager"
                ? "As a manager, you can invite members and approve absences. Contact the owner to change organisation settings."
                : "As a staff member, you can view the calendar, create absence requests, and edit your own requests."
            }
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

  // ── Invite button ──────────────────────────────────────────────────────
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: 16,
    gap: 14,
  },
  inviteButtonTextContainer: {
    flex: 1,
    gap: 2,
  },
  inviteButtonTitle: {
    color: "white",
    fontSize: 17,
  },
  inviteButtonSubtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
  },

  // ── Hero card ──────────────────────────────────────────────────────────
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  orgName: {
    textAlign: "center",
  },
  editNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    paddingHorizontal: 4,
  },
  nameInput: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 18,
    fontWeight: "600",
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Stat cards ─────────────────────────────────────────────────────────
  cardRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  statLabel: {
    marginTop: 2,
  },
  statValue: {
    fontSize: 16,
  },

  // ── Member cards ───────────────────────────────────────────────────────
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  memberCardLast: {
    marginBottom: 0,
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(15, 118, 110, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  memberNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
  },
  youBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  permissionNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },

  // ── Member management menu ─────────────────────────────────────────────
  memberMenuContainer: {
    position: "relative",
  },
  memberMenuButton: {
    padding: 8,
    borderRadius: 8,
  },
  memberContextMenu: {
    position: "absolute",
    right: 0,
    top: 36,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    minWidth: 140,
    zIndex: 100,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuDivider: {
    height: 1,
    backgroundColor: "rgba(100, 116, 139, 0.15)",
    marginHorizontal: 10,
    marginVertical: 4,
  },

  // ── Setting item (for org ID etc.) ─────────────────────────────────────
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  settingContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  settingTextContainer: {
    marginLeft: 16,
    flex: 1,
  },
  monoText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    marginTop: 2,
  },

  // ── Empty / error / loading states ─────────────────────────────────────
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
  errorText: {
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
    fontWeight: "600",
    fontSize: 17,
  },
  emptySubtext: {
    textAlign: "center",
    lineHeight: 20,
    marginTop: 4,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    gap: 8,
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
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  retryButtonText: {
    color: "white",
  },
  headerRefresh: {
    padding: 4,
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
  leaveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
});
