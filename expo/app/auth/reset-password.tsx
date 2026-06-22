/**
 * Password Reset screen.
 *
 * The AuthGate in _layout.tsx handles parsing the deep-link URL and calling
 * setSession() with the recovery tokens. By the time this screen mounts,
 * the session should already be active.
 *
 * This screen only needs to:
 * 1. Verify a session exists (AuthGate set it)
 * 2. Show the new-password form
 * 3. Call supabase.auth.updateUser({ password }) to finalize the reset
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
import { useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import { Eye, EyeOff, Lock, CheckCircle, AlertTriangle } from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import ErrorBoundary from "@/components/ErrorBoundary";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { supabase } from "@/lib/supabase";

function ResetPasswordScreen() {
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

  // ── Verify session (AuthGate should have set it by now) ────────────────────
  useEffect(() => {
    // LOG #11: First render of reset-password.tsx
    console.log("[reset-password:11] Screen mounted — starting session check");
    let cancelled = false;

    const verifySession = async () => {
      try {
        console.log("[reset-password:11] Checking for active session...");
        const { data: { session: existingSession }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.warn("[reset-password:11] getSession returned error:", sessionError.message);
        }

        if (existingSession) {
          console.log("[reset-password:11] Session found — user ID:", existingSession.user.id);
          if (!cancelled) setPhase("form");
          return;
        }

        // Session not found — AuthGate either hasn't finished or failed
        console.log("[reset-password:11] No session — retrying in 500ms...");

        // Retry once after a delay (AuthGate may still be processing)
        await new Promise((r) => setTimeout(r, 500));
        if (cancelled) return;

        const { data: { session: retrySession }, error: retryError } = await supabase.auth.getSession();
        if (retryError) {
          console.warn("[reset-password:11] Retry getSession returned error:", retryError.message);
        }

        if (retrySession) {
          console.log("[reset-password:11] Session found on retry — user ID:", retrySession.user.id);
          if (!cancelled) setPhase("form");
          return;
        }

        // Still no session — show error
        console.log("[reset-password:11] No session after retry — showing error UI");
        if (!cancelled) {
          setPhase("error");
          setErrorMessage(
            "Could not verify your reset link. The link may have expired. Please request a new password reset email."
          );
        }
      } catch (err) {
        // LOG #12: Uncaught exception during session check
        console.error("[reset-password:12] SESSION CHECK CRASH:", err);
        if (err instanceof Error) {
          console.error("[reset-password:12] Stack:", err.stack);
        }
        if (!cancelled) {
          setPhase("error");
          setErrorMessage("An unexpected error occurred. Please try again.");
        }
      }
    };

    verifySession();

    return () => {
      cancelled = true;
      // LOG #12: Screen unmount
      console.log("[reset-password:12] Screen unmounted");
    };
  }, []);

  // ── Set new password ───────────────────────────────────────────────────────
  const handleSetPassword = async () => {
    console.log("[reset-password] handleSetPassword called");

    // Validation
    if (!newPassword) {
      console.log("[reset-password] Validation: empty password");
      Alert.alert("Validation", "Please enter a new password.");
      return;
    }
    if (newPassword.length < 8) {
      console.log("[reset-password] Validation: password too short");
      Alert.alert("Validation", "Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      console.log("[reset-password] Validation: passwords don't match");
      Alert.alert("Validation", "Passwords do not match.");
      return;
    }

    setIsProcessing(true);
    console.log("[reset-password] Calling updateUser with new password...");
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        console.warn("[reset-password] updateUser FAILED:", error.message);
        Alert.alert("Error", error.message);
      } else {
        console.log("[reset-password] updateUser SUCCESS — password changed");
        setPhase("success");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      console.error("[reset-password] updateUser exception:", err);
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
            style={[styles.iconCircle, { backgroundColor: '#DC262618' }]}
          >
            <AlertTriangle size={48} color="#DC2626" />
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
            <ThemedText size="xlarge" weight="bold" style={styles.title}>
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

/**
 * Wrapped export — ErrorBoundary catches render crashes so the user sees
 * a fallback UI instead of a blank white screen.
 */
export default function ResetPasswordScreenWithBoundary() {
  // LOG #11: Wrapper mount
  console.log("[reset-password:11] ErrorBoundary wrapper mounted");

  return (
    <ErrorBoundary screenName="reset-password">
      <ResetPasswordScreen />
    </ErrorBoundary>
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
