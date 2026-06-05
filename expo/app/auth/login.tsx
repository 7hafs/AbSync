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
import { Eye, EyeOff, LogIn, ArrowRight } from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

export default function LoginScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  const { signIn, isProcessing } = useSupabaseAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim()) {
      Alert.alert("Validation", "Please enter your email address.");
      return;
    }
    if (!password) {
      Alert.alert("Validation", "Please enter your password.");
      return;
    }

    const error = await signIn(email.trim(), password);
    if (error) {
      Alert.alert("Login Failed", error);
    }
    // On success, the auth state change listener will redirect via _layout
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
          <View style={styles.header}>
            <ThemedText size="xxlarge" weight="bold" style={styles.title}>
              Welcome back
            </ThemedText>
            <ThemedText variant="secondary" style={styles.subtitle}>
              Sign in to your AbSync account
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

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Password</ThemedText>
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
                  placeholder="Your password"
                  placeholderTextColor={colors.secondaryText}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  textContentType="password"
                  autoComplete="password"
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

            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => router.push("/auth/forgot-password" as never)}
            >
              <ThemedText style={{ color: colors.primary }} weight="semibold">
                Forgot Password?
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.loginButton,
                { backgroundColor: colors.primary },
                isProcessing && styles.buttonDisabled,
              ]}
              onPress={handleLogin}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <LogIn size={20} color="white" />
                  <ThemedText style={styles.loginButtonText}>Sign In</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <ThemedText variant="secondary">Don't have an account?</ThemedText>
            <TouchableOpacity
              style={styles.registerLink}
              onPress={() => router.push("/auth/register" as never)}
            >
              <ThemedText style={{ color: colors.primary }} weight="bold">
                Create Account
              </ThemedText>
              <ArrowRight size={16} color={colors.primary} />
            </TouchableOpacity>
          </View>
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
  header: { marginBottom: 40, gap: 8 },
  title: { letterSpacing: -0.5 },
  subtitle: { fontSize: 15 },
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
  forgotLink: {
    alignSelf: "flex-end",
    paddingVertical: 4,
  },
  loginButton: {
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
  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 36,
    gap: 4,
  },
  registerLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
});
