import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Check,
  Copy,
  Link2,
  Shield,
  ShieldAlert,
  UsersRound,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";

import useShareStore from "@/store/useShareStore";
import useStaffStore from "@/store/useStaffStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import { useColorScheme } from "react-native";

export default function ShareManageScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();

  const { staff } = useStaffStore();
  const { absences } = useAbsenceStore();
  const { lastGeneratedLink, createShareLink } = useShareStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  const [viewOnly, setViewOnly] = useState<boolean>(true);
  const [importValue, setImportValue] = useState<string>("");

  const activeAbsenceCount = useMemo(() => {
    return absences.filter((absence) => absence.status !== "Rejected").length;
  }, [absences]);

  const handleCreateShare = async () => {
    const link = createShareLink({
      mode: viewOnly ? "view" : "edit",
      sharedBy: "User",
      sharedByEmail: "user@device",
      workspaceId: "local-workspace",
      staff,
      absences,
    });

    console.log("[ShareManageScreen] Created share link", {
      linkLength: link.length,
      mode: viewOnly ? "view" : "edit",
    });

    try {
      await Share.share({
        message: `Open this shared AbsenceFlow calendar: ${link}`,
        url: link,
      });
    } catch (error) {
      console.log("[ShareManageScreen] Share sheet unavailable", error);
      Alert.alert("Share link ready", link);
    }
  };

  const handleOpenImport = () => {
    if (!importValue.trim()) {
      Alert.alert(
        "Missing link",
        "Paste a shared calendar link or payload first."
      );
      return;
    }

    router.push({
      pathname: "/share/join" as any,
      params: { data: importValue.trim() },
    });
  };

  return (
    <ThemedView style={styles.container} useGradient>
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary }]}>
              <UsersRound size={20} color="white" />
            </View>
            <View style={styles.headerTextWrap}>
              <ThemedText size="large" weight="bold">
                Share your calendar
              </ThemedText>
              <ThemedText variant="secondary">
                Invite others with a secure link tied to your current calendar
                snapshot.
              </ThemedText>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <ThemedText weight="bold" style={styles.statValue}>
                {staff.length}
              </ThemedText>
              <ThemedText variant="secondary" size="small">
                Staff
              </ThemedText>
            </View>
            <View
              style={[
                styles.statCard,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <ThemedText weight="bold" style={styles.statValue}>
                {activeAbsenceCount}
              </ThemedText>
              <ThemedText variant="secondary" size="small">
                Active absences
              </ThemedText>
            </View>
          </View>

          <View
            style={[
              styles.modeCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.modeInfo}>
              {viewOnly ? (
                <Shield size={18} color={colors.primary} />
              ) : (
                <ShieldAlert size={18} color={colors.primary} />
              )}
              <View style={styles.modeTextWrap}>
                <ThemedText weight="semibold">
                  {viewOnly ? "View-only access" : "Editing access"}
                </ThemedText>
                <ThemedText variant="secondary" size="small">
                  {viewOnly
                    ? "Recipients can review the calendar without making changes."
                    : "Recipients can import and continue editing the shared calendar."}
                </ThemedText>
              </View>
            </View>
            <Switch
              testID="share-mode-switch"
              value={!viewOnly}
              onValueChange={(value) => setViewOnly(!value)}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>

          <TouchableOpacity
            testID="share-create-link"
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={handleCreateShare}
          >
            <Link2 size={18} color="white" />
            <ThemedText style={styles.primaryButtonText}>
              Create share link
            </ThemedText>
          </TouchableOpacity>

          {lastGeneratedLink ? (
            <View
              style={[
                styles.linkCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <View style={styles.linkHeader}>
                <Check size={16} color={colors.primary} />
                <ThemedText weight="semibold">Latest share link</ThemedText>
              </View>
              <TextInput
                testID="share-link-output"
                style={[styles.linkInput, { color: colors.text }]}
                value={lastGeneratedLink}
                editable={false}
                multiline
              />
              <ThemedText variant="secondary" size="small">
                If the share sheet does not open on your device, copy this link
                manually.
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <ThemedText size="large" weight="bold">
            Join a shared calendar
          </ThemedText>
          <ThemedText variant="secondary" style={styles.importDescription}>
            Paste a share link or encoded payload to import a shared team
            calendar.
          </ThemedText>
          <TextInput
            testID="share-import-input"
            style={[
              styles.importInput,
              {
                backgroundColor: colors.surface,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="Paste share link or payload"
            placeholderTextColor={colors.secondaryText}
            value={importValue}
            onChangeText={setImportValue}
            multiline
          />
          <TouchableOpacity
            testID="share-import-button"
            style={[
              styles.secondaryButton,
              { backgroundColor: colors.surfaceVariant },
            ]}
            onPress={handleOpenImport}
          >
            <Copy size={18} color={colors.primary} />
            <ThemedText weight="semibold" style={{ color: colors.primary }}>
              Review shared calendar
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 16 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: { flex: 1, gap: 4 },
  statsRow: { flexDirection: "row", gap: 12 },
  statCard: { flex: 1, borderRadius: 18, padding: 14, gap: 4 },
  statValue: { fontSize: 24 },
  modeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  modeInfo: { flex: 1, flexDirection: "row", gap: 10, alignItems: "flex-start" },
  modeTextWrap: { flex: 1, gap: 3 },
  primaryButton: {
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  linkCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  linkHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  linkInput: { minHeight: 94, textAlignVertical: "top", fontSize: 13 },
  importDescription: { lineHeight: 20 },
  importInput: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    textAlignVertical: "top",
    fontSize: 15,
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
});
