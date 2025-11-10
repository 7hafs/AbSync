import React, { useState } from "react";
import { View, StyleSheet, TextInput, Switch, Platform } from "react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import Button from "@/components/Button";
import { ReminderType } from "@/types";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";

interface ReminderFormProps {
  initialReminder?: ReminderType;
  onSave: (reminder: ReminderType) => void;
  onCancel: () => void;
}

export default function ReminderForm({
  initialReminder,
  onSave,
  onCancel,
}: ReminderFormProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const [title, setTitle] = useState(initialReminder?.title || "");
  const [date, setDate] = useState(initialReminder?.date || "");
  const [time, setTime] = useState(initialReminder?.time || "");
  const [isRecurring, setIsRecurring] = useState(initialReminder?.isRecurring || false);
  
  const handleSave = () => {
    if (!title || !date) {
      // Show error
      return;
    }
    
    const reminder: ReminderType = {
      id: initialReminder?.id || Date.now().toString(),
      title,
      date,
      time,
      isCompleted: initialReminder?.isCompleted || false,
      isRecurring,
      recurringPattern: isRecurring ? "weekly" : undefined,
    };
    
    onSave(reminder);
  };
  
  return (
    <ThemedView style={styles.container}>
      <ThemedText size="large" weight="bold" style={styles.header}>
        {initialReminder ? "Edit Reminder" : "New Reminder"}
      </ThemedText>
      
      <View style={styles.form}>
        <View style={styles.formGroup}>
          <ThemedText weight="semibold">Title</ThemedText>
          <TextInput
            style={[
              styles.input,
              { 
                color: colors.text,
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.border,
              },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="Reminder title"
            placeholderTextColor={colors.secondaryText}
          />
        </View>
        
        <View style={styles.formGroup}>
          <ThemedText weight="semibold">Date</ThemedText>
          <TextInput
            style={[
              styles.input,
              { 
                color: colors.text,
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.border,
              },
            ]}
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.secondaryText}
          />
        </View>
        
        <View style={styles.formGroup}>
          <ThemedText weight="semibold">Time (optional)</ThemedText>
          <TextInput
            style={[
              styles.input,
              { 
                color: colors.text,
                backgroundColor: colors.surfaceVariant,
                borderColor: colors.border,
              },
            ]}
            value={time}
            onChangeText={setTime}
            placeholder="HH:MM"
            placeholderTextColor={colors.secondaryText}
          />
        </View>
        
        <View style={[styles.formGroup, styles.switchRow]}>
          <ThemedText weight="semibold">Recurring Reminder</ThemedText>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={Platform.OS === "android" ? colors.primary : ""}
          />
        </View>
        
        <View style={styles.buttonContainer}>
          <Button
            title="Cancel"
            variant="outlined"
            style={styles.button}
            onPress={onCancel}
          />
          <Button
            title="Save"
            style={styles.button}
            onPress={handleSave}
          />
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  form: {
    flex: 1,
  },
  formGroup: {
    marginBottom: 16,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  button: {
    flex: 1,
    marginHorizontal: 8,
  },
});