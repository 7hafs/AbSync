import React, { useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter, Redirect } from "expo-router";
import {
  CalendarDays,
  TriangleAlert,
} from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import useShareStore from "@/store/useShareStore";

import useStaffStore from "@/store/useStaffStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import { useColorScheme } from "react-native";

export default function ShareJoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ data?: string }>();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const { decodeShareLink } = useShareStore();

  const { replaceStaff } = useStaffStore();
  const { replaceAbsences } = useAbsenceStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const payload = useMemo(() => {
    if (!params.data || typeof params.data !== "string") return null;
    return decodeShareLink(params.data);
  }, [decodeShareLink, params.data]);

  const handleJoin = () => {
    if (!payload) {
      Alert.alert(
        "Invalid link",
        "This shared calendar link could not be read."
      );
      return;
    }

    replaceStaff(payload.staff);
    replaceAbsences(payload.absences);

    Alert.alert(
      "Calendar imported",
      `You now have ${payload.mode === "edit" ? "editing" : "view-only"} access to ${payload.sharedBy}'s calendar.`,
      [
        {
          text: "Open calendar",
          onPress: () => router.replace("/(tabs)" as any),
        },
      ]
    );
  };

  if (!params.data) {
    return <Redirect href="/share/manage" />;
  }

  return (
    <ThemedView style={styles.container} useGradient>
      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.headerRow}>
            <View
              style={[styles.iconWrap, { backgroundColor: colors.primary }]}
            >
              <CalendarDays size={22} color="white" />
            </View>
            <View style={styles.headerTextWrap}>
              <ThemedText size="large" weight="bold">
                Join shared calendar
              </ThemedText>
              <ThemedText variant="secondary">
                Review the access level and import this shared calendar into
                your app.
              </ThemedText>
            </View>
          </View>

          {payload ? (
            <>
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: colors.surfaceVariant },
                ]}
              >
                <ThemedText weight="semibold">Shared by</ThemedText>
                <ThemedText variant="secondary">
                  {payload.sharedBy} · {payload.sharedByEmail}
                </ThemedText>
                <ThemedText weight="semibold" style={styles.topSpacing}>
                  Access
                </ThemedText>
                <ThemedText variant="secondary">
                  {payload.mode === "edit" ? "Can edit calendar" : "View only"}
                </ThemedText>
                <ThemedText weight="semibold" style={styles.topSpacing}>
                  Included
                </ThemedText>
                <ThemedText variant="secondary">
                  {payload.staff.length} staff · {payload.absences.length}{" "}
                  absences
                </ThemedText>
              </View>



              <TouchableOpacity
                testID="share-join-confirm"
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleJoin}
              >
                <ThemedText style={styles.primaryButtonText}>
                  Import shared calendar
                </ThemedText>
              </TouchableOpacity>
            </>
          ) : (
            <View
              style={[
                styles.invalidCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <TriangleAlert size={18} color="#FF9500" />
              <ThemedText variant="secondary" style={styles.noticeText}>
                The shared link is invalid or incomplete. Ask the owner to
                generate a fresh link.
              </ThemedText>
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 16 },
  headerRow: { flexDirection: "row", gap: 14 },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextWrap: { flex: 1, gap: 4 },
  summaryCard: { borderRadius: 18, padding: 14 },
  topSpacing: { marginTop: 12 },
  noticeCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  invalidCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 10,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  noticeText: { flex: 1, lineHeight: 20 },
  primaryButton: {
    minHeight: 52,
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
