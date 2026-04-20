import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Redirect } from "expo-router";
import { LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import useAuthStore from "@/store/useAuthStore";
import { useColorScheme } from "react-native";

export default function AuthScreen() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const { signIn, isAuthenticated } = useAuthStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");

  const isFormValid = useMemo(() => {
    return name.trim().length >= 2 && email.includes("@");
  }, [email, name]);

  const handleContinue = () => {
    if (!isFormValid) {
      Alert.alert("Missing details", "Enter your name and a valid email to continue.");
      return;
    }

    console.log("[AuthScreen] Continuing into app", {
      email,
    });

    signIn({
      name,
      email,
    });
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary }]}>
              <ShieldCheck color="white" size={28} />
            </View>
            <ThemedText size="xlarge" weight="bold" style={styles.title}>
              Secure shared calendar access
            </ThemedText>
            <ThemedText variant="secondary" style={styles.subtitle}>
              Sign in to manage absences, join shared calendars, and control who can view or edit your team calendar.
            </ThemedText>

            <View style={styles.formGroup}>
              <ThemedText weight="semibold" style={styles.label}>Name</ThemedText>
              <View style={[styles.inputShell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <UserRound color={colors.secondaryText} size={18} />
                <TextInput
                  testID="auth-name-input"
                  style={[styles.input, { color: colors.text }]}
                  placeholder="Alex Morgan"
                  placeholderTextColor={colors.secondaryText}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemedText weight="semibold" style={styles.label}>Email</ThemedText>
              <View style={[styles.inputShell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Mail color={colors.secondaryText} size={18} />
                <TextInput
                  testID="auth-email-input"
                  style={[styles.input, { color: colors.text }]}
                  placeholder="you@school.org"
                  placeholderTextColor={colors.secondaryText}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={[styles.noteCard, { backgroundColor: colors.surfaceVariant }]}> 
              <LockKeyhole color={colors.primary} size={18} />
              <ThemedText variant="secondary" style={styles.noteText}>
                Shared links can be imported by other signed-in users. View-only guests can browse the calendar without editing it.
              </ThemedText>
            </View>

            <TouchableOpacity
              testID="auth-continue-button"
              style={[styles.primaryButton, { backgroundColor: isFormValid ? colors.primary : colors.border }]}
              onPress={handleContinue}
              activeOpacity={0.85}
            >
              <ThemedText style={styles.primaryButtonText}>Continue</ThemedText>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
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
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 15,
  },
  inputShell: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
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
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
  },
});
