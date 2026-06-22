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
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import {
  useOrganisationStore,
  MemberInfo,
} from "@/store/useOrganisationStore";

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

export default function OrganisationScreen() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { profile } = useSupabaseAuth();
  const {
    organisation,
    members,
    isLoading,
    error,
    isSaving,
    loadOrganisation,
    updateName,
  } = useOrganisationStore();

  const [isEditing, setIsEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  // Load organisation data when we have a profile with org ID
  useEffect(() => {
    if (profile?.organisationId) {
      loadOrganisation(profile.organisationId);
    }
  }, [profile?.organisationId, loadOrganisation]);

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

  // ── Derived data ────────────────────────────────────────────────────────

  const owner = members.find((m) => m.role === "owner");
  const ownerName =
    owner?.profile_name ?? "Unknown";
  const sortedMembers = [...members].sort((a, b) => {
    const order: Record<string, number> = { owner: 0, manager: 1, staff: 2 };
    return (order[a.role] ?? 99) - (order[b.role] ?? 99);
  });

  // ── Render helpers ──────────────────────────────────────────────────────

  const roleBadge = (role: string) => {
    const label = ROLE_LABELS[role] ?? role;
    const roleColor = ROLE_COLORS[role] ?? colors.secondaryText;
    return (
      <View style={[styles.roleBadge, { backgroundColor: roleColor + "18" }]}>
        <ThemedText
          size="small"
          weight="semibold"
          style={{ color: roleColor, fontSize: 11 }}
        >
          {label}
        </ThemedText>
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
                onPress={startEditing}
                activeOpacity={0.7}
              >
                <ThemedText size="xlarge" weight="bold" style={styles.orgName}>
                  {organisation.name}
                </ThemedText>
                <Pencil size={16} color={colors.secondaryText} />
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
                    {roleBadge(member.role)}
                  </View>
                  {member.profile_email && (
                    <ThemedText variant="secondary" size="small">
                      {member.profile_email}
                    </ThemedText>
                  )}
                </View>
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

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <ThemedText
            variant="secondary"
            size="small"
            style={styles.footerText}
          >
            Invitations and role management are coming soon. For now, each
            account gets its own organisation automatically.
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
});
