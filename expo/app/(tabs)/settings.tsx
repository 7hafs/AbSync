import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Switch,
  Platform,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import {
  Moon,
  Sun,
  Info,
  Users,
  ChevronRight,
  Archive,
  Share2,
  Bell,
  Zap,
  Clock,
  Download,
  Upload,
  Database,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useThemeStore from "@/store/useThemeStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useNotificationStore from "@/store/useNotificationStore";
import useStaffStore from "@/store/useStaffStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import useCalendarStore from "@/store/useCalendarStore";
import useNotesStore from "@/store/useNotesStore";
import useRemindersStore from "@/store/useRemindersStore";
import { sendTestNotification } from "@/utils/notificationService";

interface BackupData {
  version: number;
  exportedAt: string;
  appVersion: string;
  staff: ReturnType<typeof useStaffStore.getState>["staff"];
  absences: ReturnType<typeof useAbsenceStore.getState>["absences"];
  events: ReturnType<typeof useCalendarStore.getState>["events"];
  notes: ReturnType<typeof useNotesStore.getState>["notes"];
  reminders: ReturnType<typeof useRemindersStore.getState>["reminders"];
  notificationPreferences: ReturnType<
    typeof useNotificationStore.getState
  >["preferences"];
  theme: ReturnType<typeof useThemeStore.getState>["isDarkMode"];
}

export default function SettingsScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode, setDarkMode } = useThemeStore();
  const {
    preferences: notifPrefs,
    setMorningEnabled,
    setEveningEnabled,
    setInstantAlertsEnabled,
  } = useNotificationStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleToggleDarkMode = () => {
    if (isDarkMode === null) {
      setDarkMode(true);
    } else if (isDarkMode) {
      setDarkMode(false);
    } else {
      setDarkMode(null);
    }
  };

  const getThemeStatusText = () => {
    if (isDarkMode === null) return "Following system";
    if (isDarkMode) return "Dark mode";
    return "Light mode";
  };

  // ── Backup & Restore ──────────────────────────────────────────────────────

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const backup: BackupData = {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: "2.0.0",
        staff: useStaffStore.getState().staff,
        absences: useAbsenceStore.getState().absences,
        events: useCalendarStore.getState().events,
        notes: useNotesStore.getState().notes,
        reminders: useRemindersStore.getState().reminders,
        notificationPreferences: useNotificationStore.getState().preferences,
        theme: useThemeStore.getState().isDarkMode,
      };

      const json = JSON.stringify(backup, null, 2);
      const fileName = `absenceflow-backup-${new Date().toISOString().split("T")[0]}.json`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/json",
          dialogTitle: "Save Backup",
          UTI: "public.json",
        });
      } else {
        Alert.alert(
          "Backup Created",
          `Saved to ${filePath}. Share is not available on this device.`
        );
      }
    } catch (err) {
      console.error("[Settings] Export failed:", err);
      Alert.alert("Export Failed", "Could not create backup file.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBackup = async () => {
    Alert.alert(
      "Import Backup",
      "To import a backup, open the .json backup file from your Files app or another app and share it with AbsenceFlow. The app will detect and restore your data automatically.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "How to Import",
          onPress: () => {
            Alert.alert(
              "Import Instructions",
              "1. Locate your backup .json file in Files, iCloud Drive, or another storage app.\n\n2. Tap the file and select 'Share'.\n\n3. Choose AbsenceFlow from the share sheet.\n\n4. The app will open and restore your data."
            );
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container} useGradient>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Appearance Section ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Appearance
          </ThemedText>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              {isDarkMode ? (
                <Moon size={24} color={colors.primary} />
              ) : (
                <Sun size={24} color={colors.primary} />
              )}
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Theme</ThemedText>
                <ThemedText variant="secondary" size="small">
                  {getThemeStatusText()}
                </ThemedText>
              </View>
            </View>

            <Switch
              value={isDarkMode !== null ? isDarkMode : false}
              onValueChange={handleToggleDarkMode}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === "android" ? colors.primary : ""}
            />
          </View>
        </View>

        {/* ── Notifications Section ────────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Notifications
          </ThemedText>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Clock size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">10:00 AM Summary</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Daily morning absence summary
                </ThemedText>
              </View>
            </View>
            <Switch
              value={notifPrefs.morningEnabled}
              onValueChange={(val) => setMorningEnabled(val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === "android" ? colors.primary : ""}
            />
          </View>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Clock size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">5:00 PM Summary</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Daily evening absence summary
                </ThemedText>
              </View>
            </View>
            <Switch
              value={notifPrefs.eveningEnabled}
              onValueChange={(val) => setEveningEnabled(val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === "android" ? colors.primary : ""}
            />
          </View>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Zap size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Real-time Alerts</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Instant notifications for absence changes
                </ThemedText>
              </View>
            </View>
            <Switch
              value={notifPrefs.instantAlertsEnabled}
              onValueChange={(val) => setInstantAlertsEnabled(val)}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={Platform.OS === "android" ? colors.primary : ""}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => {
              sendTestNotification().then(() => {
                Alert.alert(
                  "Test Sent",
                  "A test notification has been sent."
                );
              });
            }}
          >
            <View style={styles.settingContent}>
              <Bell size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Test Notification</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Send a test summary with current counts
                </ThemedText>
              </View>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* ── Backup & Restore Section ──────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Backup & Restore
          </ThemedText>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={handleExportBackup}
            disabled={isExporting}
          >
            <View style={styles.settingContent}>
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Download size={24} color={colors.primary} />
              )}
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Export Backup</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Save all data as a backup file
                </ThemedText>
              </View>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={handleImportBackup}
            disabled={isImporting}
          >
            <View style={styles.settingContent}>
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Upload size={24} color={colors.primary} />
              )}
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Import Backup</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Restore data from a backup file
                </ThemedText>
              </View>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Database size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Storage</ThemedText>
                <ThemedText variant="secondary" size="small">
                  All data is stored locally on this device
                </ThemedText>
              </View>
            </View>
          </View>
        </View>

        {/* ── Access & Sharing Section ─────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Access & Sharing
          </ThemedText>

          <TouchableOpacity
            testID="settings-sharing"
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/share/manage" as any)}
          >
            <View style={styles.settingContent}>
              <Share2 size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">
                  Shared calendar access
                </ThemedText>
                <ThemedText variant="secondary" size="small">
                  Invite others or join a shared calendar
                </ThemedText>
              </View>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* ── People & Absences Section ────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            People & Absences
          </ThemedText>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/staff")}
          >
            <View style={styles.settingContent}>
              <Users size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Manage People</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Add or remove people and track absences
                </ThemedText>
              </View>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/settings/archived-staff" as any)}
          >
            <View style={styles.settingContent}>
              <Archive size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Archived Staff</ThemedText>
                <ThemedText variant="secondary" size="small">
                  View and manage archived staff members
                </ThemedText>
              </View>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* ── About Section ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            About
          </ThemedText>

          <View
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.settingContent}>
              <Info size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Version</ThemedText>
                <ThemedText variant="secondary" size="small">
                  2.0.0
                </ThemedText>
              </View>
            </View>
          </View>
        </View>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <ThemedText
            variant="secondary"
            size="small"
            style={styles.footerText}
          >
            AbsenceFlow — Your data is stored locally and backed up on your
            device.
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
  },
  settingTextContainer: {
    marginLeft: 16,
  },
  footer: {
    marginTop: 8,
    alignItems: "center",
    padding: 16,
  },
  footerText: {
    textAlign: "center",
  },
});
