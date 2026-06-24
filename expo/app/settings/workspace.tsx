import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import {
  User,
  Building2,
  Users,
  Crown,
  Shield,
  ArrowRight,
  Check,
  RefreshCw,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import {
  fetchOrganisation,
  fetchOrganisationMembers,
  OrganisationRow,
} from "@/lib/dataService";

export default function WorkspaceSwitcherScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const {
    profile,
    switchToPersonalWorkspace,
    switchToOrganisationWorkspace,
    refreshProfile,
  } = useSupabaseAuth();

  const [isSwitching, setIsSwitching] = useState(false);
  const [orgDetails, setOrgDetails] = useState<{ org: OrganisationRow; memberCount: number; userRole: string } | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(false);

  const isPersonal = profile?.workspaceMode === "personal";
  const isOrg = profile?.workspaceMode === "organisation";
  const hasOrg = !!profile?.organisationId;

  // Load org details when in org mode
  useEffect(() => {
    if (profile?.organisationId && isOrg) {
      setIsLoadingOrg(true);
      Promise.all([
        fetchOrganisation(profile.organisationId),
        fetchOrganisationMembers(profile.organisationId),
      ])
        .then(([org, members]) => {
          if (org) {
            const userMember = members.find((m) => m.user_id === profile.id);
            setOrgDetails({
              org,
              memberCount: members.length,
              userRole: userMember?.role ?? "unknown",
            });
          }
        })
        .catch(() => setOrgDetails(null))
        .finally(() => setIsLoadingOrg(false));
    }
  }, [profile?.organisationId, profile?.id, isOrg]);

  const handleSwitchToPersonal = useCallback(async () => {
    setIsSwitching(true);
    try {
      await switchToPersonalWorkspace();
      await refreshProfile();
      Alert.alert("Switched", "You are now in Personal Workspace.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to switch workspace.");
    } finally {
      setIsSwitching(false);
    }
  }, [switchToPersonalWorkspace, refreshProfile, router]);

  const handleSwitchToOrg = useCallback(async () => {
    if (!hasOrg) {
      Alert.alert(
        "No Organisation",
        "You are not a member of any organisation. Create or join one first."
      );
      return;
    }

    setIsSwitching(true);
    try {
      await switchToOrganisationWorkspace();
      await refreshProfile();
      Alert.alert("Switched", "You are now in Organisation Workspace.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to switch workspace.");
    } finally {
      setIsSwitching(false);
    }
  }, [hasOrg, switchToOrganisationWorkspace, refreshProfile, router]);

  const roleLabel = (role: string) => {
    const labels: Record<string, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
    return labels[role] ?? role;
  };

  return (
    <ThemedView style={styles.container} useGradient>
      <Stack.Screen options={{ title: "Workspace" }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Current mode banner */}
        <View
          style={[
            styles.currentBanner,
            {
              backgroundColor: isPersonal
                ? "rgba(15, 118, 110, 0.08)"
                : "rgba(99, 102, 241, 0.08)",
              borderColor: isPersonal
                ? "rgba(15, 118, 110, 0.2)"
                : "rgba(99, 102, 241, 0.2)",
            },
          ]}
        >
          {isPersonal ? (
            <User size={22} color={colors.primary} />
          ) : (
            <Building2 size={22} color="#6366F1" />
          )}
          <View style={{ flex: 1 }}>
            <ThemedText weight="bold" style={{ color: isPersonal ? colors.primary : "#6366F1" }}>
              {isPersonal ? "Personal Workspace" : "Organisation Workspace"}
            </ThemedText>
            <ThemedText variant="secondary" size="small">
              {isPersonal
                ? "Private data, private calendar, no teams."
                : "Shared calendar, roles, and invitations active."}
            </ThemedText>
          </View>
        </View>

        <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
          Switch Workspace
        </ThemedText>

        {/* ── Personal Workspace Option ──────────────────────────────────── */}
        <TouchableOpacity
          style={[
            styles.optionCard,
            {
              backgroundColor: colors.card,
              borderColor: isPersonal ? colors.primary : colors.border,
              borderWidth: isPersonal ? 2 : 1,
            },
          ]}
          onPress={isPersonal ? undefined : handleSwitchToPersonal}
          disabled={isSwitching || isPersonal}
          activeOpacity={0.7}
        >
          <View style={styles.optionLeft}>
            <View
              style={[
                styles.optionIcon,
                { backgroundColor: "rgba(15, 118, 110, 0.1)" },
              ]}
            >
              <User size={24} color={colors.primary} />
            </View>
            <View style={styles.optionInfo}>
              <View style={styles.optionHeader}>
                <ThemedText weight="bold" style={styles.optionTitle}>
                  Personal Workspace
                </ThemedText>
                {isPersonal && (
                  <View style={[styles.activeBadge, { backgroundColor: colors.primary + "18" }]}>
                    <Check size={12} color={colors.primary} />
                    <ThemedText size="small" weight="bold" style={{ color: colors.primary }}>
                      Active
                    </ThemedText>
                  </View>
                )}
              </View>
              <ThemedText variant="secondary" size="small">
                Private staff, private absences, private notes & reminders.
              </ThemedText>
            </View>
          </View>
          {!isPersonal && (
            isSwitching ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <ArrowRight size={20} color={colors.primary} />
            )
          )}
        </TouchableOpacity>

        {/* ── Organisation Workspace Option ──────────────────────────────── */}
        {hasOrg ? (
          <TouchableOpacity
            style={[
              styles.optionCard,
              {
                backgroundColor: colors.card,
                borderColor: isOrg ? "#6366F1" : colors.border,
                borderWidth: isOrg ? 2 : 1,
              },
            ]}
            onPress={isOrg ? undefined : handleSwitchToOrg}
            disabled={isSwitching || isOrg}
            activeOpacity={0.7}
          >
            <View style={styles.optionLeft}>
              <View
                style={[
                  styles.optionIcon,
                  { backgroundColor: "rgba(99, 102, 241, 0.1)" },
                ]}
              >
                <Building2 size={24} color="#6366F1" />
              </View>
              <View style={styles.optionInfo}>
                <View style={styles.optionHeader}>
                  <ThemedText weight="bold" style={styles.optionTitle}>
                    Organisation Workspace
                  </ThemedText>
                  {isOrg && (
                    <View style={[styles.activeBadge, { backgroundColor: "#6366F1" + "18" }]}>
                      <Check size={12} color="#6366F1" />
                      <ThemedText size="small" weight="bold" style={{ color: "#6366F1" }}>
                        Active
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText variant="secondary" size="small">
                  Shared calendar, shared staff, team invitations.
                </ThemedText>

                {isLoadingOrg ? (
                  <ActivityIndicator size="small" color="#6366F1" style={{ marginTop: 8 }} />
                ) : orgDetails ? (
                  <View style={styles.orgMetaRow}>
                    <View style={styles.orgMetaItem}>
                      <Building2 size={12} color={colors.secondaryText} />
                      <ThemedText variant="secondary" size="small">
                        {orgDetails.org.name}
                      </ThemedText>
                    </View>
                    <View style={styles.orgMetaItem}>
                      <Users size={12} color={colors.secondaryText} />
                      <ThemedText variant="secondary" size="small">
                        {orgDetails.memberCount} member{orgDetails.memberCount !== 1 ? "s" : ""}
                      </ThemedText>
                    </View>
                    <View style={styles.orgMetaItem}>
                      <Shield size={12} color={colors.secondaryText} />
                      <ThemedText variant="secondary" size="small">
                        {roleLabel(orgDetails.userRole)}
                      </ThemedText>
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
            {!isOrg && (
              isSwitching ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <ArrowRight size={20} color="#6366F1" />
              )
            )}
          </TouchableOpacity>
        ) : (
          /* No org membership — show create/join options */
          <View
            style={[
              styles.optionCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.optionLeft}>
              <View
                style={[
                  styles.optionIcon,
                  { backgroundColor: "rgba(99, 102, 241, 0.1)" },
                ]}
              >
                <Building2 size={24} color="#6366F1" />
              </View>
              <View style={styles.optionInfo}>
                <ThemedText weight="bold" style={styles.optionTitle}>
                  Organisation Workspace
                </ThemedText>
                <ThemedText variant="secondary" size="small">
                  You don't belong to an organisation yet.
                </ThemedText>
                <View style={styles.noOrgActions}>
                  <TouchableOpacity
                    style={[styles.noOrgBtn, { backgroundColor: "#6366F1" }]}
                    onPress={() => router.push("/settings/organisation" as never)}
                    activeOpacity={0.7}
                  >
                    <Building2 size={14} color="white" />
                    <ThemedText size="small" weight="bold" style={{ color: "white" }}>
                      Create
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.noOrgBtn, { backgroundColor: colors.surfaceVariant }]}
                    onPress={() => router.push("/onboarding/workspace" as never)}
                    activeOpacity={0.7}
                  >
                    <Users size={14} color="#6366F1" />
                    <ThemedText size="small" weight="bold" style={{ color: "#6366F1" }}>
                      Join
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Info footer ────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <ThemedText variant="secondary" size="small" style={styles.footerText}>
            {isPersonal
              ? "Switching to Organisation Workspace will show shared team data. Your organisation membership is preserved — you can switch back any time."
              : "Switching to Personal Workspace will show your private data. You remain a member of your organisation — switch back any time."}
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionTitle: { marginBottom: 16, marginTop: 8 },

  // Current mode banner
  currentBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 24,
  },

  // Option cards
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    justifyContent: "space-between",
  },
  optionLeft: { flexDirection: "row", alignItems: "flex-start", gap: 14, flex: 1 },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  optionInfo: { flex: 1, gap: 4 },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  optionTitle: { fontSize: 16 },
  activeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },

  // Org metadata
  orgMetaRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    flexWrap: "wrap",
  },
  orgMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  // No org actions
  noOrgActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  noOrgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },

  // Footer
  footer: { marginTop: 16, alignItems: "center", paddingHorizontal: 8 },
  footerText: { textAlign: "center", lineHeight: 18 },
});
