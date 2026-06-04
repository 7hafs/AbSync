import React, { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import {
  LockKeyhole,
  ShieldCheck,
  LogIn,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import useAuthStore from "@/store/useAuthStore";
import { useAuth } from "@/hooks/useAuth";
import { useColorScheme } from "react-native";

export default function AuthScreen() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const { isAuthenticated } = useAuthStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const {
    signIn: rorkSignIn,
    isSigningIn,
    error: authError,
    clearError,
  } = useAuth();

  const canContinue = useMemo(() => !isSigningIn, [isSigningIn]);

  const handleGoogleSignIn = async () => {
    if (!canContinue) return;
    try {
      await rorkSignIn("google");
    } catch {
      // Error is handled by the auth hook
    }
  };

  const handleAppleSignIn = async () => {
    if (!canContinue) return;
    try {
      await rorkSignIn("apple");
    } catch {
      // Error is handled by the auth hook
    }
  };

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <ThemedView style={styles.container} useGradient>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.heroCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[styles.iconWrap, { backgroundColor: colors.primary }]}
            >
              <ShieldCheck color="white" size={28} />
            </View>
            <ThemedText size="xlarge" weight="bold" style={styles.title}>
              AbsenceFlow
            </ThemedText>
            <ThemedText variant="secondary" style={styles.subtitle}>
              Sign in to manage staff absences, track holidays, and keep your
              team calendar in sync. Your data is securely stored and always
              available when you sign back in.
            </ThemedText>

            {authError ? (
              <TouchableOpacity
                onPress={clearError}
                style={[
                  styles.errorCard,
                  { backgroundColor: colors.surfaceVariant },
                ]}
              >
                <ThemedText
                  style={{ color: "#DC2626", fontSize: 13, flex: 1 }}
                >
                  {authError}
                </ThemedText>
                <ThemedText
                  style={{ color: "#DC2626", fontWeight: "700", fontSize: 13 }}
                >
                  Dismiss
                </ThemedText>
              </TouchableOpacity>
            ) : null}

            {isSigningIn ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={colors.primary} />
                <ThemedText variant="secondary">
                  Signing you in…
                </ThemedText>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  testID="auth-google-button"
                  style={[
                    styles.oauthButton,
                    { backgroundColor: "#4285F4" },
                  ]}
                  onPress={handleGoogleSignIn}
                  activeOpacity={0.85}
                >
                  <LogIn size={20} color="white" />
                  <ThemedText style={styles.oauthButtonText}>
                    Sign in with Google
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  testID="auth-apple-button"
                  style={[
                    styles.oauthButton,
                    styles.appleButton,
                  ]}
                  onPress={handleAppleSignIn}
                  activeOpacity={0.85}
                >
                  <LogIn size={20} color="white" />
                  <ThemedText style={styles.oauthButtonText}>
                    Sign in with Apple
                  </ThemedText>
                </TouchableOpacity>
              </>
            )}

            <View
              style={[
                styles.noteCard,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <LockKeyhole color={colors.primary} size={18} />
              <ThemedText variant="secondary" style={styles.noteText}>
                Your account is linked to your email. All absence records,
                staff, and settings are permanently saved and restored
                automatically when you sign back in — even after reinstalling
                the app.
              </ThemedText>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  heroCard: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    gap: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    lineHeight: 30,
  },
  subtitle: {
    lineHeight: 22,
  },
  errorCard: {
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingWrap: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  oauthButton: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  appleButton: {
    backgroundColor: "#000",
  },
  oauthButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  noteCard: {
    borderRadius: 18,
    padding: 14,
    gap: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  noteText: {
    flex: 1,
    lineHeight: 20,
  },
});
