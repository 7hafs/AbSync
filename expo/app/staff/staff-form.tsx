import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useStaffStore from "@/store/useStaffStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { StaffMember } from "@/types";


export default function StaffFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { staff, addStaff, updateStaff, deleteStaff, archiveStaff, getStaffById } = useStaffStore();
  const canEdit = true;
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [active, setActive] = useState(true);

  const staffId = typeof params.id === "string" ? params.id : undefined;
  const isEditing = !!staffId;

  useEffect(() => {
    if (staffId) {
      const existingStaff = getStaffById(staffId);
      if (existingStaff) {
        setName(existingStaff.name);
        setDepartment(existingStaff.department || "");
        setActive(existingStaff.active);
      }
    }
  }, [staffId, getStaffById]);

  const handleSave = () => {
    if (!canEdit) {
      Alert.alert("View-only access", "You can review this shared calendar, but only editors can update staff.");
      return;
    }

    if (!name.trim()) {
      Alert.alert("Error", "Please enter a staff name");
      return;
    }

    const staffData: StaffMember = {
      id: staffId || Date.now().toString(),
      name: name.trim(),
      department: department.trim() || undefined,
      active,
      createdAt: staffId ? getStaffById(staffId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
    };

    if (isEditing) {
      updateStaff(staffData);
      Alert.alert('Staff Updated', `${name.trim()} has been updated successfully.`);
    } else {
      addStaff(staffData);
      Alert.alert('Staff Added', `${name.trim()} has been added successfully.`);
    }

    router.back();
  };

  const handleArchive = () => {
    if (!canEdit) {
      Alert.alert("View-only access", "You can review this shared calendar, but only editors can archive staff.");
      return;
    }

    if (!staffId) return;

    Alert.alert(
      "Archive Staff",
      "Are you sure you want to archive this staff member? They will be moved to archived staff.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          onPress: () => {
            archiveStaff(staffId);
            router.back();
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!canEdit) {
      Alert.alert("View-only access", "You can review this shared calendar, but only editors can delete staff.");
      return;
    }

    if (!staffId) return;

    Alert.alert(
      "Delete Staff",
      "Are you sure you want to permanently delete this staff member? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteStaff(staffId);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isEditing ? "Edit Staff" : "Add Staff",
          headerRight: () =>
            isEditing ? (
              <TouchableOpacity onPress={handleDelete}>
                <ThemedText style={[styles.deleteButton, { color: "#FF3B30" }]}>
                  <ThemedText>Delete</ThemedText>
                </ThemedText>
              </TouchableOpacity>
            ) : null,
        }}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <ThemedText style={styles.label}>
            <ThemedText>Name *</ThemedText>
          </ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            placeholder="Enter staff name"
            placeholderTextColor={colors.secondaryText}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.label}>
            <ThemedText>Department</ThemedText>
          </ThemedText>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            placeholder="Enter department (optional)"
            placeholderTextColor={colors.secondaryText}
            value={department}
            onChangeText={setDepartment}
          />
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <ThemedText style={styles.label}>
              <ThemedText>Active</ThemedText>
            </ThemedText>
            <Switch value={active} onValueChange={setActive} />
          </View>
        </View>

        {canEdit ? (
        <TouchableOpacity
          testID="staff-save-button"
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
        >
          <ThemedText style={styles.saveButtonText}>
            <ThemedText>{isEditing ? "Update" : "Add"} Staff</ThemedText>
          </ThemedText>
        </TouchableOpacity>
        ) : (
          <View style={[styles.readOnlyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText variant="secondary">This shared calendar is view-only.</ThemedText>
          </View>
        )}

        {canEdit && isEditing && active && (
          <TouchableOpacity
            style={[styles.archiveButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={handleArchive}
          >
            <ThemedText style={[styles.archiveButtonText, { color: colors.text }]}>
              <ThemedText>Archive Staff Member</ThemedText>
            </ThemedText>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600" as const,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  saveButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  saveButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  deleteButton: {
    fontSize: 16,
    marginRight: 16,
  },
  archiveButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
  },
  archiveButtonText: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  readOnlyCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 20,
    alignItems: "center",
  },
});
