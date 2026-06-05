import React, { useState } from "react";
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
import { ArrowLeft, Mail, CheckCircle } from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  const { forgotPassword, isProcessing } = useSupabaseAuth();

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert("Validation", "Please enter your email address.");
      return;
    }

    const error = await forgotPassword(email.trim());
    if (error) {
      Alert.alert("Error", error);
    } else {
      setSent(true);
    }
  };

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
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={20} color={colors.text} />
          </TouchableOpacity>

          {!sent ? (
            <>
              <View style={styles.header}>
                <ThemedText size="xxlarge" weight="bold" style={styles.title}>
                  Forgot Password?
                </ThemedText>
                <ThemedText variant="secondary" style={styles.subtitle}>
                  Enter your email address and we'll send you a password reset
                  link.
                </ThemedText>
              </View>

              <View style={styles.form}>
                <View style={styles.inputGroup}>
                  <ThemedText style={styles.label}>Email Address</ThemedText>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: colors.surfaceVariant,
                        color: colors.text,
                        borderColor: colors.border,
                      },
                    ]}
                    placeholder="you@example.com"
                    placeholderTextColor={colors.secondaryText}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoComplete="email"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.resetButton,
                    { backgroundColor: colors.primary },
                    isProcessing && styles.buttonDisabled,
                  ]}
                  onPress={handleReset}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Mail size={20} color="white" />
                      <ThemedText style={styles.resetButtonText}>
                        Send Reset Link
                      </ThemedText>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.successContainer}>
              <View
                style={[
                  styles.successIcon,
                  { backgroundColor: `${colors.primary}18` },
                ]}
              >
                <CheckCircle size={48} color={colors.primary} />
              </View>
              <ThemedText size="xlarge" weight="bold" style={styles.successTitle}>
                Email Sent
              </ThemedText>
              <ThemedText
                variant="secondary"
                style={styles.successMessage}
              >
                If an account exists for {email.trim()}, you'll receive a
                password reset link shortly. Check your spam folder if you
                don't see it.
              </ThemedText>
              <TouchableOpacity
                style={[styles.backToLogin, { backgroundColor: colors.primary }]}
                onPress={() => router.back()}
              >
                <ThemedText style={styles.resetButtonText}>
                  Back to Sign In
                </ThemedText>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  header: { marginBottom: 32, gap: 8 },
  title: { letterSpacing: -0.5 },
  subtitle: { fontSize: 15, lineHeight: 22 },
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
  resetButton: {
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
  resetButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  successContainer: {
    alignItems: "center",
    paddingHorizontal: 16,
    gap: 16,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  successTitle: {},
  successMessage: {
    textAlign: "center",
    lineHeight: 22,
  },
  backToLogin: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    marginTop: 16,
  },
});
