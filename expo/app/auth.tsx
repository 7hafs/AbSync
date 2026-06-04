import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect, useRouter } from "expo-router";
import {
  LockKeyhole,
  ShieldCheck,
  Mail,
  Eye,
  EyeOff,
  User,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import useAuthStore from "@/store/useAuthStore";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useColorScheme } from "react-native";

type AuthMode = "login" | "register";

export default function AuthScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const { isAuthenticated } = useAuthStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const {
    signIn,
    signUp,
    resetPassword,
    isSigningIn,
    error: authError,
    clearError,
  } = useSupabaseAuth();

  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const canSubmit = useMemo(() => !isSigningIn, [isSigningIn]);

  function validateLogin(): boolean {
    const errors: Record<string, string> = {};
    if (!email.trim()) errors.email = "Email is required";
    if (!password) errors.password = "Password is required";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function validateRegister(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Full name is required";
    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(email.trim())) {
      errors.email = "Enter a valid email address";
    }
    if (!password) {
      errors.password = "Password is required";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters";
    }
    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleLogin = async () => {
    clearError();
    if (!validateLogin() || !canSubmit) return;
    try {
      await signIn(email.trim(), password);
    } catch {
      // Error handled by auth hook
    }
  };

  const handleRegister = async () => {
    clearError();
    if (!validateRegister() || !canSubmit) return;
    try {
      await signUp(name.trim(), email.trim(), password);
    } catch {
      // Error handled by auth hook
    }
  };

  const handleForgotPassword = async () => {
    clearError();
    if (!forgotEmail.trim()) {
      setFieldErrors({ forgotEmail: "Email is required" });
      return;
    }
    try {
      await resetPassword(forgotEmail.trim());
      setResetSent(true);
    } catch {
      // Error handled by auth hook
    }
  };

  const switchMode = (newMode: AuthMode) => {
    clearError();
    setFieldErrors({});
    setMode(newMode);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  if (isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  // ── Forgot Password Sheet ──────────────────────────────────────────────────
  if (showForgotPassword) {
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
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  setShowForgotPassword(false);
                  setResetSent(false);
                  setForgotEmail("");
                  clearError();
                  setFieldErrors({});
                }}
              >
                <ArrowLeft size={20} color={colors.primary} />
                <ThemedText style={{ color: colors.primary, fontWeight: "600" }}>
                  Back
                </ThemedText>
              </TouchableOpacity>

              <View
                style={[styles.iconWrap, { backgroundColor: colors.primary }]}
              >
                <LockKeyhole color="white" size={28} />
              </View>
              <ThemedText size="xlarge" weight="bold" style={styles.title}>
                Reset Password
              </ThemedText>
              <ThemedText variant="secondary" style={styles.subtitle}>
                Enter your email address and we'll send you a link to reset your
                password.
              </ThemedText>

              {resetSent ? (
                <View style={styles.successCard}>
                  <CheckCircle2 size={24} color="#059669" />
                  <ThemedText
                    style={{ color: "#059669", fontWeight: "600", flex: 1 }}
                  >
                    If an account exists with that email, a password reset link
                    has been sent. Check your inbox.
                  </ThemedText>
                </View>
              ) : (
                <>
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
                        style={{
                          color: "#DC2626",
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        Dismiss
                      </ThemedText>
                    </TouchableOpacity>
                  ) : null}

                  <View style={styles.inputGroup}>
                    <ThemedText
                      weight="semibold"
                      size="small"
                      style={styles.inputLabel}
                    >
                      Email Address
                    </ThemedText>
                    <View
                      style={[
                        styles.inputWrap,
                        {
                          backgroundColor: colors.surfaceVariant,
                          borderColor: fieldErrors.forgotEmail
                            ? "#DC2626"
                            : colors.border,
                        },
                      ]}
                    >
                      <Mail
                        size={18}
                        color={
                          fieldErrors.forgotEmail
                            ? "#DC2626"
                            : colors.secondaryText
                        }
                      />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="you@example.com"
                        placeholderTextColor={colors.secondaryText}
                        value={forgotEmail}
                        onChangeText={(t) => {
                          setForgotEmail(t);
                          if (fieldErrors.forgotEmail)
                            setFieldErrors((p) => ({ ...p, forgotEmail: "" }));
                        }}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        autoComplete="email"
                        editable={!isSigningIn}
                      />
                    </View>
                    {fieldErrors.forgotEmail ? (
                      <ThemedText style={styles.fieldError}>
                        {fieldErrors.forgotEmail}
                      </ThemedText>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.primaryButton,
                      { backgroundColor: colors.primary },
                      isSigningIn && styles.disabledButton,
                    ]}
                    onPress={handleForgotPassword}
                    disabled={isSigningIn}
                    activeOpacity={0.85}
                  >
                    {isSigningIn ? (
                      <ActivityIndicator size="small" color="white" />
                    ) : (
                      <ThemedText style={styles.primaryButtonText}>
                        Send Reset Link
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    );
  }

  // ── Login / Register ──────────────────────────────────────────────────────
  const isLogin = mode === "login";

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
              {isLogin
                ? "Sign in to manage staff absences, track holidays, and keep your team calendar in sync."
                : "Create your account to start managing absences. Your data is securely stored and always available when you sign back in."}
            </ThemedText>

            {/* Mode tabs */}
            <View
              style={[
                styles.tabBar,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.tab,
                  isLogin && { backgroundColor: colors.card },
                ]}
                onPress={() => switchMode("login")}
                activeOpacity={0.7}
              >
                <ThemedText
                  weight={isLogin ? "bold" : "normal"}
                  style={{ color: isLogin ? colors.text : colors.secondaryText }}
                >
                  Sign In
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.tab,
                  !isLogin && { backgroundColor: colors.card },
                ]}
                onPress={() => switchMode("register")}
                activeOpacity={0.7}
              >
                <ThemedText
                  weight={!isLogin ? "bold" : "normal"}
                  style={{
                    color: !isLogin ? colors.text : colors.secondaryText,
                  }}
                >
                  Register
                </ThemedText>
              </TouchableOpacity>
            </View>

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
                  {isLogin ? "Signing you in…" : "Creating your account…"}
                </ThemedText>
              </View>
            ) : (
              <>
                {/* Name field (register only) */}
                {!isLogin ? (
                  <View style={styles.inputGroup}>
                    <ThemedText
                      weight="semibold"
                      size="small"
                      style={styles.inputLabel}
                    >
                      Full Name
                    </ThemedText>
                    <View
                      style={[
                        styles.inputWrap,
                        {
                          backgroundColor: colors.surfaceVariant,
                          borderColor: fieldErrors.name
                            ? "#DC2626"
                            : colors.border,
                        },
                      ]}
                    >
                      <User
                        size={18}
                        color={
                          fieldErrors.name
                            ? "#DC2626"
                            : colors.secondaryText
                        }
                      />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="Your full name"
                        placeholderTextColor={colors.secondaryText}
                        value={name}
                        onChangeText={(t) => {
                          setName(t);
                          if (fieldErrors.name)
                            setFieldErrors((p) => ({ ...p, name: "" }));
                        }}
                        textContentType="name"
                        autoComplete="name"
                      />
                    </View>
                    {fieldErrors.name ? (
                      <ThemedText style={styles.fieldError}>
                        {fieldErrors.name}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}

                {/* Email */}
                <View style={styles.inputGroup}>
                  <ThemedText
                    weight="semibold"
                    size="small"
                    style={styles.inputLabel}
                  >
                    Email Address
                  </ThemedText>
                  <View
                    style={[
                      styles.inputWrap,
                      {
                        backgroundColor: colors.surfaceVariant,
                        borderColor: fieldErrors.email
                          ? "#DC2626"
                          : colors.border,
                      },
                    ]}
                  >
                    <Mail
                      size={18}
                      color={
                        fieldErrors.email ? "#DC2626" : colors.secondaryText
                      }
                    />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="you@example.com"
                      placeholderTextColor={colors.secondaryText}
                      value={email}
                      onChangeText={(t) => {
                        setEmail(t);
                        if (fieldErrors.email)
                          setFieldErrors((p) => ({ ...p, email: "" }));
                      }}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      autoComplete="email"
                    />
                  </View>
                  {fieldErrors.email ? (
                    <ThemedText style={styles.fieldError}>
                      {fieldErrors.email}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Password */}
                <View style={styles.inputGroup}>
                  <ThemedText
                    weight="semibold"
                    size="small"
                    style={styles.inputLabel}
                  >
                    Password
                  </ThemedText>
                  <View
                    style={[
                      styles.inputWrap,
                      {
                        backgroundColor: colors.surfaceVariant,
                        borderColor: fieldErrors.password
                          ? "#DC2626"
                          : colors.border,
                      },
                    ]}
                  >
                    <LockKeyhole
                      size={18}
                      color={
                        fieldErrors.password
                          ? "#DC2626"
                          : colors.secondaryText
                      }
                    />
                    <TextInput
                      style={[styles.input, { color: colors.text }]}
                      placeholder="••••••••"
                      placeholderTextColor={colors.secondaryText}
                      value={password}
                      onChangeText={(t) => {
                        setPassword(t);
                        if (fieldErrors.password)
                          setFieldErrors((p) => ({ ...p, password: "" }));
                      }}
                      secureTextEntry={!showPassword}
                      textContentType={isLogin ? "password" : "newPassword"}
                      autoComplete={isLogin ? "password" : "new-password"}
                      autoCapitalize="none"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeButton}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color={colors.secondaryText} />
                      ) : (
                        <Eye size={18} color={colors.secondaryText} />
                      )}
                    </TouchableOpacity>
                  </View>
                  {fieldErrors.password ? (
                    <ThemedText style={styles.fieldError}>
                      {fieldErrors.password}
                    </ThemedText>
                  ) : null}
                </View>

                {/* Confirm Password (register only) */}
                {!isLogin ? (
                  <View style={styles.inputGroup}>
                    <ThemedText
                      weight="semibold"
                      size="small"
                      style={styles.inputLabel}
                    >
                      Confirm Password
                    </ThemedText>
                    <View
                      style={[
                        styles.inputWrap,
                        {
                          backgroundColor: colors.surfaceVariant,
                          borderColor: fieldErrors.confirmPassword
                            ? "#DC2626"
                            : colors.border,
                        },
                      ]}
                    >
                      <LockKeyhole
                        size={18}
                        color={
                          fieldErrors.confirmPassword
                            ? "#DC2626"
                            : colors.secondaryText
                        }
                      />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="••••••••"
                        placeholderTextColor={colors.secondaryText}
                        value={confirmPassword}
                        onChangeText={(t) => {
                          setConfirmPassword(t);
                          if (fieldErrors.confirmPassword)
                            setFieldErrors((p) => ({
                              ...p,
                              confirmPassword: "",
                            }));
                        }}
                        secureTextEntry={!showConfirmPassword}
                        textContentType="newPassword"
                        autoComplete="new-password"
                        autoCapitalize="none"
                      />
                      <TouchableOpacity
                        onPress={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        style={styles.eyeButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        {showConfirmPassword ? (
                          <EyeOff size={18} color={colors.secondaryText} />
                        ) : (
                          <Eye size={18} color={colors.secondaryText} />
                        )}
                      </TouchableOpacity>
                    </View>
                    {fieldErrors.confirmPassword ? (
                      <ThemedText style={styles.fieldError}>
                        {fieldErrors.confirmPassword}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}

                {/* Submit Button */}
                <TouchableOpacity
                  testID={isLogin ? "auth-login-button" : "auth-register-button"}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={isLogin ? handleLogin : handleRegister}
                  activeOpacity={0.85}
                >
                  <ThemedText style={styles.primaryButtonText}>
                    {isLogin ? "Sign In" : "Create Account"}
                  </ThemedText>
                </TouchableOpacity>

                {/* Forgot Password (login only) */}
                {isLogin ? (
                  <TouchableOpacity
                    onPress={() => {
                      clearError();
                      setFieldErrors({});
                      setForgotEmail(email);
                      setResetSent(false);
                      setShowForgotPassword(true);
                    }}
                    style={styles.forgotLink}
                  >
                    <ThemedText
                      style={{ color: colors.primary, fontWeight: "600" }}
                    >
                      Forgot Password?
                    </ThemedText>
                  </TouchableOpacity>
                ) : null}
              </>
            )}

            {/* Data safety note */}
            <View
              style={[
                styles.noteCard,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <LockKeyhole color={colors.primary} size={18} />
              <ThemedText variant="secondary" style={styles.noteText}>
                Your account is linked to your email. All absence records, staff,
                and settings are permanently saved and restored automatically when
                you sign back in — even after reinstalling the app.
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
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  tabBar: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
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
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
  },
  eyeButton: {
    padding: 4,
  },
  fieldError: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "600",
  },
  errorCard: {
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  successCard: {
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(5, 150, 105, 0.1)",
  },
  loadingWrap: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
  forgotLink: {
    alignItems: "center",
    paddingVertical: 4,
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
