import React from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Text,
} from "react-native";
import { Archive, RotateCcw, Trash2 } from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useStaffStore from "@/store/useStaffStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { StaffMember } from "@/types";

export default function ArchivedStaffScreen() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { getArchivedStaff, unarchiveStaff, deleteStaff } = useStaffStore();
  const archivedStaff = getArchivedStaff();

  const handleUnarchive = (staffMember: StaffMember) => {
    Alert.alert(
      "Unarchive Staff",
      `Are you sure you want to unarchive ${staffMember.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unarchive",
          onPress: () => {
            unarchiveStaff(staffMember.id);
            console.log(`Unarchived staff: ${staffMember.name}`);
          },
        },
      ]
    );
  };

  const handleDelete = (staffMember: StaffMember) => {
    Alert.alert(
      "Delete Staff",
      `Are you sure you want to permanently delete ${staffMember.name}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteStaff(staffMember.id);
            console.log(`Deleted staff: ${staffMember.name}`);
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container} useGradient>
      <View style={styles.header}>
        <Archive size={24} color={colors.primary} />
        <ThemedText style={styles.headerTitle}>
          <Text>Archived Staff</Text>
        </ThemedText>
      </View>

      <View style={styles.headerRow}>
        <ThemedText style={styles.countText}>
          <Text>{archivedStaff.length} archived staff members</Text>
        </ThemedText>
      </View>

      <FlatList
        data={archivedStaff}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.staffCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.staffInfo}>
              <ThemedText style={styles.staffName}>{item.name}</ThemedText>
              {item.department && (
                <ThemedText
                  style={[styles.department, { color: colors.secondaryText }]}
                >
                  {item.department}
                </ThemedText>
              )}
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary }]}
                onPress={() => handleUnarchive(item)}
              >
                <RotateCcw size={20} color="white" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: "#FF5722" }]}
                onPress={() => handleDelete(item)}
              >
                <Trash2 size={20} color="white" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Archive size={48} color={colors.secondaryText} />
            <ThemedText
              style={[styles.emptyText, { color: colors.secondaryText }]}
            >
              <Text>No archived staff members</Text>
            </ThemedText>
            <ThemedText
              style={[styles.emptySubtext, { color: colors.secondaryText }]}
            >
              <Text>Archived staff will appear here</Text>
            </ThemedText>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
  },
  headerRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  countText: {
    fontSize: 14,
    fontWeight: "600" as const,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  staffCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  staffInfo: {
    flex: 1,
    gap: 4,
  },
  staffName: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  department: {
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600" as const,
  },
  emptySubtext: {
    fontSize: 14,
  },
});
