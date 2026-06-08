import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { CheckCircle, Circle, Clock } from "lucide-react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { ReminderType } from "@/types";
import { formatDateUK } from "@/utils/dateUtils";

interface ReminderItemProps {
  reminder: ReminderType;
  onPress: (reminder: ReminderType) => void;
  onToggleComplete: (id: string) => void;
}

export default function ReminderItem({
  reminder,
  onPress,
  onToggleComplete,
}: ReminderItemProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const formattedDate = formatDateUK(reminder.date);
  
  return (
    <TouchableOpacity onPress={() => onPress(reminder)}>
      <ThemedView
        style={[
          styles.container,
          reminder.isCompleted && styles.completedContainer,
        ]}
        variant="card"
      >
        <TouchableOpacity
          style={styles.checkButton}
          onPress={() => onToggleComplete(reminder.id)}
        >
          {reminder.isCompleted ? (
            <CheckCircle size={24} color={colors.primary} fill={colors.primary} />
          ) : (
            <Circle size={24} color={colors.primary} />
          )}
        </TouchableOpacity>
        
        <View style={styles.content}>
          <ThemedText
            weight="semibold"
            style={[
              reminder.isCompleted && styles.completedText,
            ]}
          >
            {reminder.title}
          </ThemedText>
          
          <View style={styles.dateContainer}>
            <Clock size={14} color={colors.secondaryText} />
            <ThemedText variant="secondary" size="small" style={styles.dateText}>
              {formattedDate} {reminder.time && `at ${reminder.time}`}
            </ThemedText>
          </View>
          
          {reminder.isRecurring && (
            <View
              style={[
                styles.recurringBadge,
                { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <ThemedText variant="secondary" size="small">
                Recurring
              </ThemedText>
            </View>
          )}
        </View>
      </ThemedView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  completedContainer: {
    opacity: 0.7,
  },
  checkButton: {
    marginRight: 16,
  },
  content: {
    flex: 1,
  },
  completedText: {
    textDecorationLine: "line-through",
  },
  dateContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  dateText: {
    marginLeft: 6,
  },
  recurringBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
});