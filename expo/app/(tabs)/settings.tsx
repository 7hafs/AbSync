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
  TextInput,
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
  FileSpreadsheet,
  ShieldCheck,
  ShieldOff,
  RefreshCw,
  LogOut,
  User,
  Mail,
  Lock,
  Building2,
} from "lucide-react-native";
import { exportAbsencesCSV } from "@/utils/csvExport";
import { useRouter } from "expo-router";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useThemeStore from "@/store/useThemeStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useNotificationStore from "@/store/useNotificationStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import { sendTestNotification } from "@/utils/notificationService";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase, getAuthRedirectUrl } from "@/lib/supabase";
import {
  exportBackupFile,
  verifyStorageIntegrity,
  getStorageStats,
} from "@/lib/storageManager";

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
  const { profile, signOut } = useSupabaseAuth();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const [isExporting, setIsExporting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [integrityStatus, setIntegrityStatus] = useState<{
    checked: boolean;
    healthy: boolean;
    errors: number;
    warnings: number;
  }>({ checked: false, healthy: true, errors: 0, warnings: 0 });
  const [storageStats, setStorageStats] = useState<{
    totalRecords: number;
    absences: number;
    staff: number;
  } | null>(null);

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

  const loadStorageStats = async () => {
    const stats = await getStorageStats();
    setStorageStats(stats);
  };

  React.useEffect(() => {
    loadStorageStats();
  }, []);

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const result = await exportBackupFile();
      if (result.success) {
        Alert.alert(
          "Backup Exported",
          "Your backup file is ready. Save it to a safe location like iCloud Drive or Files."
        );
      } else {
        Alert.alert("Export Failed", result.message);
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
      "To restore your data, open a .json backup file from your Files app and share it with AbsenceFlow.\n\nYour current data will be replaced with the backup data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "How to Import",
          onPress: () => {
            Alert.alert(
              "Import Instructions",
              "1. Locate your backup .json file in Files, iCloud Drive, or another storage app.\n\n2. Tap the file and select 'Share'.\n\n3. Choose AbsenceFlow from the share sheet.\n\n4. The app will open and restore your data. You may need to restart the app."
            );
          },
        },
      ]
    );
  };

  const handleVerifyIntegrity = async () => {
    setIsChecking(true);
    try {
      const report = await verifyStorageIntegrity();
      setIntegrityStatus({
        checked: true,
        healthy: report.healthy,
        errors: report.errors.length,
        warnings: report.warnings.length,
      });
      await loadStorageStats();
      if (report.healthy) {
        Alert.alert(
          "Storage Healthy",
          `All data stores are intact.\n\nRecords: ${storageStats?.totalRecords ?? "..."}\n\n${report.warnings.length > 0 ? `Warnings: ${report.warnings.length}` : "No warnings."}`
        );
      } else {
        Alert.alert(
          "Storage Issues Detected",
          `${report.errors.length} error(s) found. Corrupted stores have been reset to prevent crashes.\n\nPlease restore from a backup if data is missing.\n\nErrors:\n${report.errors.join("\n")}`
        );
      }
    } catch (err) {
      console.error("[Settings] Integrity check failed:", err);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <ThemedView style={styles.container} useGradient>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── Account Section ──────────────────────────────────────────────── */}
        <View style={styles.section}>
          <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
            Account
          </ThemedText>

          <View
            style={[
              styles.accountCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.accountAvatar}>
              <User size={28} color={colors.primary} />
            </View>
            <View style={styles.accountInfo}>
              <ThemedText weight="bold" style={styles.accountName}>
                {profile?.name || "User"}
              </ThemedText>
              <View style={styles.accountEmailRow}>
                <Mail size={14} color={colors.secondaryText} />
                <ThemedText variant="secondary" size="small">
                  {profile?.email || ""}
                </ThemedText>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/settings/organisation" as any)}
          >
            <View style={styles.settingContent}>
              <Building2 size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Organisation</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Manage your organisation and members
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
            onPress={() => {
              Alert.alert(
                "Change Password",
                "A password reset email will be sent to your account email address.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Send Reset Email",
                    onPress: async () => {
                      if (profile?.email) {
                        const { error } = await supabase.auth.resetPasswordForEmail(
                          profile.email,
                          { redirectTo: getAuthRedirectUrl() }
                        );
                        if (error) {
                          Alert.alert("Error", error.message);
                        } else {
                          Alert.alert("Email Sent", "Check your inbox for the password reset link.");
                        }
                      }
                    },
                  },
                ]
              );
            }}
          >
            <View style={styles.settingContent}>
              <Lock size={22} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Change Password</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Send a password reset email
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
            onPress={() => {
              Alert.alert(
                "Sign Out",
                "Are you sure you want to sign out? Your data will remain safe on the server and will be restored when you sign back in.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign Out",
                    style: "destructive",
                    onPress: () => signOut(),
                  },
                ]
              );
            }}
          >
            <View style={styles.settingContent}>
              <LogOut size={22} color="#EF4444" />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold" style={{ color: "#EF4444" }}>
                  Sign Out
                </ThemedText>
                <ThemedText variant="secondary" size="small">
                  Sign out of your account
                </ThemedText>
              </View>
            </View>
          </TouchableOpacity>
        </View>

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
                  Save all data (staff, absences, notes, settings)
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
          >
            <View style={styles.settingContent}>
              <Upload size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Import Backup</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Restore all data from a backup file
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
            onPress={handleVerifyIntegrity}
            disabled={isChecking}
          >
            <View style={styles.settingContent}>
              {isChecking ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : integrityStatus.checked ? (
                integrityStatus.healthy ? (
                  <ShieldCheck size={24} color="#22C55E" />
                ) : (
                  <ShieldOff size={24} color="#EF4444" />
                )
              ) : (
                <Database size={24} color={colors.primary} />
              )}
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">
                  {integrityStatus.checked
                    ? integrityStatus.healthy
                      ? "Storage Healthy"
                      : "Storage Issues Detected"
                    : "Verify Storage Integrity"}
                </ThemedText>
                <ThemedText variant="secondary" size="small">
                  {storageStats
                    ? `${storageStats.totalRecords} records (${storageStats.staff} staff, ${storageStats.absences} absences)`
                    : "Check data health and record counts"}
                </ThemedText>
              </View>
            </View>
            {isChecking ? null : (
              <RefreshCw size={20} color={colors.secondaryText} />
            )}
          </TouchableOpacity>
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

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => router.push("/settings/about" as any)}
          >
            <View style={styles.settingContent}>
              <Info size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Support & About</ThemedText>
                <ThemedText variant="secondary" size="small">
                  App version, support contact, and release notes
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
              <Info size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Version</ThemedText>
                <ThemedText variant="secondary" size="small">
                  2.0.0
                </ThemedText>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={async () => {
              const absences = useAbsenceStore.getState().absences;
              const result = await exportAbsencesCSV(absences);
              Alert.alert(
                result.success ? "Export Complete" : "Export Failed",
                result.message
              );
            }}
          >
            <View style={styles.settingContent}>
              <FileSpreadsheet size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">Export Absences CSV</ThemedText>
                <ThemedText variant="secondary" size="small">
                  Export all absence records as a spreadsheet
                </ThemedText>
              </View>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <ThemedText
            variant="secondary"
            size="small"
            style={styles.footerText}
          >
            AbsenceFlow — Your data is securely stored and synced to your
            account. Sign in on any device to access your data. Export regular
            backups for added safety.
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
    flex: 1,
  },
  settingTextContainer: {
    marginLeft: 16,
    flex: 1,
  },
  footer: {
    marginTop: 8,
    alignItems: "center",
    padding: 16,
  },
  footerText: {
    textAlign: "center",
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    gap: 14,
  },
  accountAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(15, 118, 110, 0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 17,
  },
  accountEmailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
