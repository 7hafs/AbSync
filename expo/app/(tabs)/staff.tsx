import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Plus, Search, Upload } from "lucide-react-native";
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
  const canEdit = true;
  const [searchQuery, setSearchQuery] = useState<string>("");
  const params = useLocalSearchParams<{ filter?: string }>();
  const activeFilter = params.filter ?? 'active';

  const filteredStaff = useMemo(() => {
    let base = staff;

    // Apply active/inactive/all filter from route params
    if (activeFilter === 'active') {
      base = base.filter((s) => s.active);
    } else if (activeFilter === 'inactive') {
      base = base.filter((s) => !s.active);
    }
    // 'all' or missing filter shows everything

    if (!searchQuery.trim()) {
      return base;
    }
    const query = searchQuery.toLowerCase();
    return base.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.department?.toLowerCase().includes(query)
    );
  }, [staff, searchQuery, activeFilter]);

  const handleAddStaff = () => {
    if (!canEdit) {
      return;
    }

    router.push("/staff/staff-form");
  };

  const handleBulkImport = () => {
    router.push("/staff/bulk-import");
  };

  const handleStaffPress = (staffMember: StaffMember) => {
    if (!canEdit) {
      return;
    }

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
          testID="staff-search-input"
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
        {!canEdit ? (
          <ThemedText variant="secondary" size="small">
            View-only access
          </ThemedText>
        ) : null}
      </View>

      <FlatList
        data={filteredStaff}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            testID={`staff-card-${item.id}`}
            style={[styles.staffCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => handleStaffPress(item)}
            activeOpacity={canEdit ? 0.8 : 1}
          >
            <View style={styles.staffInfo}>
              <ThemedText style={styles.staffName}>{item.name}</ThemedText>
              {item.department ? (
                <ThemedText style={[styles.department, { color: colors.secondaryText }]}>
                  {item.department}
                </ThemedText>
              ) : null}
              {!canEdit ? (
                <Text style={[styles.readOnlyBadge, { color: colors.primary }]}>Shared view</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <ThemedText style={[styles.emptyText, { color: colors.secondaryText }]}>No staff members found</ThemedText>
          </View>
        }
      />

      {canEdit ? (
        <View style={styles.fabContainer}>
          <TouchableOpacity
            testID="staff-bulk-import-button"
            style={[styles.fabSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleBulkImport}
          >
            <Upload size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="staff-add-button"
            style={[styles.fab, { backgroundColor: colors.primary }]}
            onPress={handleAddStaff}
          >
            <Plus size={24} color="white" />
          </TouchableOpacity>
        </View>
      ) : null}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  readOnlyBadge: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
  },
  fabContainer: {
    position: "absolute",
    bottom: 24,
    right: 24,
    alignItems: "center",
    gap: 12,
  },
  fabSecondary: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3.84,
  },
  fab: {
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
