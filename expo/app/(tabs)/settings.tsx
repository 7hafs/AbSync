import React from "react";
import {
  View,
  StyleSheet,
  Switch,
  Platform,
  TouchableOpacity,
  Alert,
} from "react-native";
import {
  Moon,
  Sun,
  Info,
  Users,
  ChevronRight,
  Archive,
  Share2,
  LogOut,
  ShieldCheck,
  Bell,
  BellOff,
  Zap,
  Clock,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useThemeStore from "@/store/useThemeStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useAuthStore from "@/store/useAuthStore";
import { useAuth } from "@/hooks/useAuth";
import useNotificationStore from "@/store/useNotificationStore";
import { sendTestNotification } from "@/utils/notificationService";

export default function SettingsScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode, setDarkMode } = useThemeStore();
  const { user, isAuthenticated, signOut: localSignOut } = useAuthStore();
  const { signOut: rorkSignOut } = useAuth();
  const {
    preferences: notifPrefs,
    setMorningEnabled,
    setEveningEnabled,
    setInstantAlertsEnabled,
  } = useNotificationStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

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

  const handleSignOut = () => {
    Alert.alert(
      "Sign out",
      "Your data is saved and will be restored when you sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          onPress: async () => {
            await rorkSignOut();
            localSignOut();
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container} useGradient>
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
            if (user?.id) {
              sendTestNotification(user.id).then(() => {
                Alert.alert("Test Sent", "A test notification has been sent.");
              });
            } else {
              Alert.alert("Sign In Required", "Please sign in to test notifications.");
            }
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
              <ThemedText weight="semibold">Shared calendar access</ThemedText>
              <ThemedText variant="secondary" size="small">
                {isAuthenticated
                  ? "Invite others or join a shared calendar"
                  : "Sign in to manage shared access"}
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
            <ShieldCheck size={24} color={colors.primary} />
            <View style={styles.settingTextContainer}>
              <ThemedText weight="semibold">Account</ThemedText>
              <ThemedText variant="secondary" size="small">
                {isAuthenticated && user
                  ? `${user.name} · ${user.email}`
                  : "Not signed in"}
              </ThemedText>
            </View>
          </View>
          {isAuthenticated ? (
            <TouchableOpacity testID="settings-sign-out" onPress={handleSignOut}>
              <LogOut size={20} color={colors.secondaryText} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="settings-sign-in"
              onPress={() => router.push("/auth" as any)}
            >
              <ChevronRight size={20} color={colors.secondaryText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

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

      <View style={styles.footer}>
        <ThemedText variant="secondary" size="small" style={styles.footerText}>
          AbsenceFlow — Your data is securely stored and restored on sign-in
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
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
    marginTop: "auto",
    alignItems: "center",
    padding: 16,
  },
  footerText: {
    textAlign: "center",
  },
});
