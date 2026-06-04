import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Switch,
  Platform,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
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
  LogOut,
  ShieldCheck,
  Bell,
  BellOff,
  Zap,
  Clock,
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Calendar,
} from "lucide-react-native";
import { useRouter } from "expo-router";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useThemeStore from "@/store/useThemeStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useAuthStore from "@/store/useAuthStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/lib/supabase";
import useNotificationStore from "@/store/useNotificationStore";
import { sendTestNotification } from "@/utils/notificationService";

export default function SettingsScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode, setDarkMode } = useThemeStore();
  const { user, isAuthenticated } = useAuthStore();
  const { signOut } = useSupabaseAuth();
  const {
    preferences: notifPrefs,
    setMorningEnabled,
    setEveningEnabled,
    setInstantAlertsEnabled,
  } = useNotificationStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  // Profile edit state
  const [profileVisible, setProfileVisible] = useState(false);
  const [editName, setEditName] = useState(user?.name ?? "");
  const [isSavingName, setIsSavingName] = useState(false);

  // Change password state
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isChangingPw, setIsChangingPw] = useState(false);

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
          style: "destructive",
          onPress: async () => {
            await signOut();
          },
        },
      ]
    );
  };

  const handleSaveName = async () => {
    if (!editName.trim() || !user?.id) return;
    setIsSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ name: editName.trim(), updated_at: new Date().toISOString() })
        .eq("id", user.id);

      if (error) {
        Alert.alert("Error", error.message);
      } else {
        // Update local store
        useAuthStore.getState().updateUser({ ...user, name: editName.trim() });
        Alert.alert("Saved", "Your name has been updated.");
        setProfileVisible(false);
      }
    } catch (err) {
      Alert.alert("Error", "Failed to save name.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      Alert.alert("Invalid Password", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert("Mismatch", "Passwords do not match.");
      return;
    }

    setIsChangingPw(true);
    try {
      // First verify current password by attempting sign-in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? "",
        password: currentPassword,
      });

      if (signInError) {
        Alert.alert("Error", "Current password is incorrect.");
        setIsChangingPw(false);
        return;
      }

      // Update the password
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        Alert.alert("Error", error.message);
      } else {
        Alert.alert("Success", "Your password has been changed.");
        setPasswordVisible(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmNewPassword("");
      }
    } catch {
      Alert.alert("Error", "Failed to change password.");
    } finally {
      setIsChangingPw(false);
    }
  };

  const formatJoinedDate = (isoString?: string) => {
    if (!isoString) return "Unknown";
    try {
      return new Date(isoString).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return "Unknown";
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

          <TouchableOpacity
            style={[
              styles.settingItem,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onPress={() => {
              setEditName(user?.name ?? "");
              setProfileVisible(true);
            }}
          >
            <View style={styles.settingContent}>
              <User size={24} color={colors.primary} />
              <View style={styles.settingTextContainer}>
                <ThemedText weight="semibold">
                  {isAuthenticated && user
                    ? user.name
                    : "Not signed in"}
                </ThemedText>
                <ThemedText variant="secondary" size="small">
                  {isAuthenticated && user
                    ? user.email
                    : "Sign in to access your account"}
                </ThemedText>
              </View>
            </View>
            {isAuthenticated ? (
              <ChevronRight size={20} color={colors.secondaryText} />
            ) : (
              <TouchableOpacity
                onPress={() => router.push("/auth" as any)}
              >
                <ChevronRight size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>

          {isAuthenticated ? (
            <>
              <TouchableOpacity
                style={[
                  styles.settingItem,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => setPasswordVisible(true)}
              >
                <View style={styles.settingContent}>
                  <Lock size={24} color={colors.primary} />
                  <View style={styles.settingTextContainer}>
                    <ThemedText weight="semibold">Change Password</ThemedText>
                    <ThemedText variant="secondary" size="small">
                      Update your account password
                    </ThemedText>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.secondaryText} />
              </TouchableOpacity>

              <TouchableOpacity
                testID="settings-sign-out"
                style={[
                  styles.settingItem,
                  styles.signOutItem,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={handleSignOut}
              >
                <View style={styles.settingContent}>
                  <LogOut size={24} color="#DC2626" />
                  <View style={styles.settingTextContainer}>
                    <ThemedText weight="semibold" style={{ color: "#DC2626" }}>
                      Sign Out
                    </ThemedText>
                    <ThemedText variant="secondary" size="small">
                      Your data is always saved
                    </ThemedText>
                  </View>
                </View>
              </TouchableOpacity>
            </>
          ) : null}
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
              if (user?.id) {
                sendTestNotification(user.id).then(() => {
                  Alert.alert(
                    "Test Sent",
                    "A test notification has been sent."
                  );
                });
              } else {
                Alert.alert(
                  "Sign In Required",
                  "Please sign in to test notifications."
                );
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
                  {isAuthenticated
                    ? "Invite others or join a shared calendar"
                    : "Sign in to manage shared access"}
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
            AbsenceFlow — Your data is securely stored and restored on sign-in
          </ThemedText>
        </View>
      </ScrollView>

      {/* ── Edit Name Modal ────────────────────────────────────────────────── */}
      <Modal
        visible={profileVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <ThemedText size="large" weight="bold" style={styles.modalTitle}>
              Edit Profile
            </ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText weight="semibold" size="small" style={styles.inputLabel}>
                Email
              </ThemedText>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                    opacity: 0.6,
                  },
                ]}
              >
                <Mail size={18} color={colors.secondaryText} />
                <TextInput
                  style={[styles.modalInput, { color: colors.text }]}
                  value={user?.email ?? ""}
                  editable={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText weight="semibold" size="small" style={styles.inputLabel}>
                Name
              </ThemedText>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                  },
                ]}
              >
                <User size={18} color={colors.secondaryText} />
                <TextInput
                  style={[styles.modalInput, { color: colors.text }]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your name"
                  placeholderTextColor={colors.secondaryText}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText weight="semibold" size="small" style={styles.inputLabel}>
                Account Created
              </ThemedText>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                    opacity: 0.6,
                  },
                ]}
              >
                <Calendar size={18} color={colors.secondaryText} />
                <TextInput
                  style={[styles.modalInput, { color: colors.text }]}
                  value={formatJoinedDate(user?.joinedAt)}
                  editable={false}
                />
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.surfaceVariant },
                ]}
                onPress={() => setProfileVisible(false)}
              >
                <ThemedText weight="semibold">Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleSaveName}
                disabled={isSavingName}
              >
                {isSavingName ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <ThemedText style={{ color: "white", fontWeight: "700" }}>
                    Save
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Change Password Modal ──────────────────────────────────────────── */}
      <Modal
        visible={passwordVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <ThemedText size="large" weight="bold" style={styles.modalTitle}>
              Change Password
            </ThemedText>

            <View style={styles.inputGroup}>
              <ThemedText weight="semibold" size="small" style={styles.inputLabel}>
                Current Password
              </ThemedText>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Lock size={18} color={colors.secondaryText} />
                <TextInput
                  style={[styles.modalInput, { color: colors.text }]}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Current password"
                  placeholderTextColor={colors.secondaryText}
                  secureTextEntry={!showCurrentPw}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setShowCurrentPw(!showCurrentPw)}
                >
                  {showCurrentPw ? (
                    <EyeOff size={18} color={colors.secondaryText} />
                  ) : (
                    <Eye size={18} color={colors.secondaryText} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText weight="semibold" size="small" style={styles.inputLabel}>
                New Password
              </ThemedText>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Lock size={18} color={colors.secondaryText} />
                <TextInput
                  style={[styles.modalInput, { color: colors.text }]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 8 characters"
                  placeholderTextColor={colors.secondaryText}
                  secureTextEntry={!showNewPw}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowNewPw(!showNewPw)}>
                  {showNewPw ? (
                    <EyeOff size={18} color={colors.secondaryText} />
                  ) : (
                    <Eye size={18} color={colors.secondaryText} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText weight="semibold" size="small" style={styles.inputLabel}>
                Confirm New Password
              </ThemedText>
              <View
                style={[
                  styles.inputWrap,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Lock size={18} color={colors.secondaryText} />
                <TextInput
                  style={[styles.modalInput, { color: colors.text }]}
                  value={confirmNewPassword}
                  onChangeText={setConfirmNewPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.secondaryText}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.surfaceVariant },
                ]}
                onPress={() => {
                  setPasswordVisible(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmNewPassword("");
                }}
              >
                <ThemedText weight="semibold">Cancel</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleChangePassword}
                disabled={isChangingPw}
              >
                {isChangingPw ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <ThemedText style={{ color: "white", fontWeight: "700" }}>
                    Update
                  </ThemedText>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  signOutItem: {
    marginTop: 4,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  modalTitle: {
    marginBottom: 4,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    marginBottom: 2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 50,
    gap: 10,
  },
  modalInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
