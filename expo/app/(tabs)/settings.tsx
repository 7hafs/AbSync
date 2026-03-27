import React from "react";
import { View, StyleSheet, Switch, Platform, TouchableOpacity } from "react-native";
import { Moon, Sun, Info, Users, ChevronRight, Archive } from "lucide-react-native";
import { useRouter } from "expo-router";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useThemeStore from "@/store/useThemeStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";

export default function SettingsScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode, setDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const handleToggleDarkMode = () => {
    if (isDarkMode === null) {
      setDarkMode(true);
    } else if (isDarkMode) {
      setDarkMode(false);
    } else {
      setDarkMode(null); // Follow system
    }
  };
  
  const getThemeStatusText = () => {
    if (isDarkMode === null) {
      return "Following system";
    } else if (isDarkMode) {
      return "Dark mode";
    } else {
      return "Light mode";
    }
  };
  
  return (
    <ThemedView style={styles.container} useGradient>
      <View style={styles.section}>
        <ThemedText size="large" weight="bold" style={styles.sectionTitle}>
          Appearance
        </ThemedText>
        
        <View style={[
          styles.settingItem,
          { backgroundColor: colors.card, borderColor: colors.border }
        ]}>
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
          People & Absences
        </ThemedText>
        
        <TouchableOpacity
          style={[
            styles.settingItem,
            { backgroundColor: colors.card, borderColor: colors.border }
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
            { backgroundColor: colors.card, borderColor: colors.border }
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
        
        <View style={[
          styles.settingItem,
          { backgroundColor: colors.card, borderColor: colors.border }
        ]}>
          <View style={styles.settingContent}>
            <Info size={24} color={colors.primary} />
            <View style={styles.settingTextContainer}>
              <ThemedText weight="semibold">Version</ThemedText>
              <ThemedText variant="secondary" size="small">
                1.0.0
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
      
      <View style={styles.footer}>
        <ThemedText variant="secondary" size="small" style={styles.footerText}>
          FocusEaze - Calendar, Notes & Reminders
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