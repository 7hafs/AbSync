/**
 * Password Reset screen.
 *
 * This screen is reached via a deep link from the Supabase password reset email:
 *   rork-lxwo9f6yr6sjgzxbuwjkz://auth/reset-password#access_token=...&refresh_token=...&type=recovery
 *
 * The URL fragment contains the recovery tokens that allow the user to set a
 * new password without being signed in.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import { Eye, EyeOff, Lock, CheckCircle, AlertTriangle } from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"loading" | "form" | "success" | "error">("loading");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // ── Extract recovery tokens from the deep-link URL ──────────────────────────
  const linkingUrl = Linking.useURL();

  useEffect(() => {
    let cancelled = false;

    const processUrl = async (url: string | null) => {
      try {
        if (process.env.NODE_ENV === "development") {
          console.log("[reset-password] Deep link URL:", url);
        }

        if (!url) {
          if (!cancelled) {
            setPhase("error");
            setErrorMessage(
              "Could not read the reset link. Please try requesting a new password reset email."
            );
          }
          return;
        }

        // Supabase password recovery URLs use a # (hash/fragment) to carry
        // the tokens:  ...://auth/reset-password#access_token=abc&refresh_token=def&type=recovery
        const hashIndex = url.indexOf("#");
        if (hashIndex === -1) {
          if (!cancelled) {
            setPhase("error");
            setErrorMessage(
              "This reset link is missing the recovery token. Please request a new password reset email."
            );
          }
          return;
        }

        const fragment = url.substring(hashIndex + 1);
        const params = new URLSearchParams(fragment);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        if (
          !accessToken ||
          !refreshToken ||
          type !== "recovery"
        ) {
          if (!cancelled) {
            setPhase("error");
            setErrorMessage(
              "Invalid recovery link. Please request a new password reset email."
            );
          }
          return;
        }

        // Set the session using the recovery tokens.  This signs the user in
        // so they can then update their password via supabase.auth.updateUser().
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (sessionError) {
          if (!cancelled) {
            setPhase("error");
            setErrorMessage(
              sessionError.message ||
                "Could not verify your identity. Please request a new password reset email."
            );
          }
          return;
        }

        // Session set — show the new-password form
        if (!cancelled) {
          setPhase("form");
        }
      } catch (err) {
        if (!cancelled) {
          setPhase("error");
          setErrorMessage(
            "An unexpected error occurred. Please try again."
          );
        }
        console.error("[reset-password] URL processing error:", err);
      }
    };

    processUrl(linkingUrl);

    // Also try getInitialURL for cold starts where useURL might not
    // fire on first render.
    if (!linkingUrl) {
      Linking.getInitialURL().then((url) => {
        if (!cancelled && url) {
          processUrl(url);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [linkingUrl]);

  // ── Set new password ───────────────────────────────────────────────────────
  const handleSetPassword = async () => {
    // Validation
    if (!newPassword) {
      Alert.alert("Validation", "Please enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Validation", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }

    setIsProcessing(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        Alert.alert("Error", error.message);
      } else {
        setPhase("success");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      Alert.alert("Error", message);
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <ThemedView style={styles.container} useGradient>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <ThemedText
            variant="secondary"
            style={styles.statusText}
          >
            Verifying your reset link...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (phase === "error") {
    return (
      <ThemedView style={styles.container} useGradient>
        <View style={styles.centerContainer}>
          <View
            style={[styles.iconCircle, { backgroundColor: `${colors.error}18` }]}
          >
            <AlertTriangle size={48} color={colors.error} />
          </View>
          <ThemedText
            size="large"
            weight="bold"
            style={styles.errorTitle}
          >
            Link Expired
          </ThemedText>
          <ThemedText
            variant="secondary"
            style={styles.errorMessage}
          >
            {errorMessage}
          </ThemedText>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/auth/forgot-password" as never)}
          >
            <ThemedText style={styles.primaryButtonText}>
              Request New Reset Link
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.textButton}
            onPress={() => router.replace("/auth/login" as never)}
          >
            <ThemedText
              style={{ color: colors.primary }}
              weight="semibold"
            >
              Back to Sign In
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (phase === "success") {
    return (
      <ThemedView style={styles.container} useGradient>
        <View style={styles.centerContainer}>
          <View
            style={[
              styles.iconCircle,
              { backgroundColor: `${colors.primary}18` },
            ]}
          >
            <CheckCircle size={48} color={colors.primary} />
          </View>
          <ThemedText
            size="large"
            weight="bold"
            style={styles.successTitle}
          >
            Password Updated
          </ThemedText>
          <ThemedText
            variant="secondary"
            style={styles.successMessage}
          >
            Your password has been changed successfully. You can now sign in
            with your new password.
          </ThemedText>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={() => router.replace("/auth/login" as never)}
          >
            <ThemedText style={styles.primaryButtonText}>
              Sign In
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  // ── New password form ──────────────────────────────────────────────────────
  return (
    <ThemedView style={styles.container} useGradient>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View
              style={[
                styles.iconCircleSmall,
                { backgroundColor: `${colors.primary}18` },
              ]}
            >
              <Lock size={28} color={colors.primary} />
            </View>
            <ThemedText size="xxlarge" weight="bold" style={styles.title}>
              Set New Password
            </ThemedText>
            <ThemedText variant="secondary" style={styles.subtitle}>
              Choose a new password for your AbSync account. It must be at
              least 8 characters.
            </ThemedText>
          </View>

          <View style={styles.form}>
            {/* New Password */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>New Password</ThemedText>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      backgroundColor: colors.surfaceVariant,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="Min. 8 characters"
                  placeholderTextColor={colors.secondaryText}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={colors.secondaryText} />
                  ) : (
                    <Eye size={20} color={colors.secondaryText} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Confirm Password</ThemedText>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[
                    styles.input,
                    styles.passwordInput,
                    {
                      backgroundColor: colors.surfaceVariant,
                      color: colors.text,
                      borderColor: colors.border,
                    },
                  ]}
                  placeholder="Re-enter your password"
                  placeholderTextColor={colors.secondaryText}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowConfirm(!showConfirm)}
                >
                  {showConfirm ? (
                    <EyeOff size={20} color={colors.secondaryText} />
                  ) : (
                    <Eye size={20} color={colors.secondaryText} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.primary },
                isProcessing && styles.buttonDisabled,
              ]}
              onPress={handleSetPassword}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Lock size={20} color="white" />
                  <ThemedText style={styles.primaryButtonText}>
                    Set New Password
                  </ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  header: { marginBottom: 32, alignItems: "center", gap: 10 },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  iconCircleSmall: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { letterSpacing: -0.5, textAlign: "center" },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  statusText: { marginTop: 16, fontSize: 15 },
  errorTitle: { textAlign: "center", marginTop: 4 },
  errorMessage: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  successTitle: { textAlign: "center", marginTop: 4 },
  successMessage: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  form: { gap: 16 },
  inputGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "600" as const, marginLeft: 2 },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  passwordWrap: { position: "relative" },
  passwordInput: { paddingRight: 50 },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  primaryButton: {
    height: 52,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  textButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
  },
});
