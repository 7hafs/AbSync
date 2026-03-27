import React, { useState, useMemo } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
} from "react-native";
import { useRouter } from "expo-router";
import { Plus, Search } from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useStaffStore from "@/store/useStaffStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { StaffMember } from "@/types";

export default function StaffScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { staff } = useStaffStore();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredStaff = useMemo(() => {
    if (!searchQuery.trim()) {
      return staff.filter((s) => s.active);
    }
    const query = searchQuery.toLowerCase();
    return staff.filter(
      (s) =>
        s.active &&
        (s.name.toLowerCase().includes(query) ||
          s.department?.toLowerCase().includes(query))
    );
  }, [staff, searchQuery]);

  const handleAddStaff = () => {
    router.push("/staff/staff-form");
  };

  const handleStaffPress = (staffMember: StaffMember) => {
    router.push({
      pathname: "/staff/staff-form",
      params: { id: staffMember.id },
    });
  };

  return (
    <ThemedView style={styles.container} useGradient>
      <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
        <Search size={20} color={colors.secondaryText} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search staff by name or department..."
          placeholderTextColor={colors.secondaryText}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <View style={styles.headerRow}>
        <ThemedText style={styles.countText}>
          {filteredStaff.length} staff members
        </ThemedText>
      </View>

      <FlatList
        data={filteredStaff}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.staffCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleStaffPress(item)}
          >
            <View style={styles.staffInfo}>
              <ThemedText style={styles.staffName}>{item.name}</ThemedText>
              {item.department && (
                <ThemedText style={[styles.department, { color: colors.secondaryText }]}>
                  {item.department}
                </ThemedText>
              )}
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText style={[styles.emptyText, { color: colors.secondaryText }]}>
              No staff members found
            </ThemedText>
          </View>
        }
      />

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={handleAddStaff}
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
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
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
  },
  staffInfo: {
    gap: 4,
  },
  staffName: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  department: {
    fontSize: 14,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});
