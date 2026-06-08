import React, { useMemo } from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import { getDaysInMonth, formatDate } from "@/utils/dateUtils";
import useCalendarStore from "@/store/useCalendarStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";

interface MonthViewProps {
  currentDate: Date;
  onSelectDate: (date: string) => void;
}

export default function MonthView({ currentDate, onSelectDate }: MonthViewProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const { events, selectedDate } = useCalendarStore();
  const { absences } = useAbsenceStore();
  
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    return getDaysInMonth(year, month);
  }, [currentDate]);
  
  const firstDayOfMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    return new Date(year, month, 1).getDay();
  }, [currentDate]);
  
  const today = useMemo(() => {
    const now = new Date();
    return formatDate(now);
  }, []);
  
  const generateCalendarDays = () => {
    const days = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const dateString = formatDate(date);
      
      const hasEvents = events.some(event => event.date === dateString);
      const absencesForDay = absences.filter((a) => a.date === dateString && a.type !== 'Public Holiday' && a.status !== 'Rejected');
      const hasAbsences = absencesForDay.length > 0;
      const hasConflict = absencesForDay.length > 2;
      
      days.push({
        day: i,
        date: dateString,
        hasEvents,
        hasAbsences,
        hasConflict,
        absenceCount: absencesForDay.length,
        isToday: dateString === today,
        isSelected: dateString === selectedDate,
      });
    }
    
    return days;
  };
  
  const calendarDays = useMemo(() => generateCalendarDays(), [
    currentDate,
    events,
    selectedDate,
    today,
  ]);
  
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  
  return (
    <ThemedView style={styles.container}>
      <View style={styles.weekDaysContainer}>
        {weekDays.map((day) => (
          <View key={day} style={styles.weekDayCell}>
            <ThemedText variant="secondary" size="small">
              {day}
            </ThemedText>
          </View>
        ))}
      </View>
      
      <View style={styles.daysContainer}>
        {calendarDays.map((day, index) => (
          <View key={day ? day.date : `empty-${index}`} style={styles.dayCell}>
            {day ? (
              <TouchableOpacity
                style={[
                  styles.dayButton,
                  day.isToday && styles.todayButton,
                  day.isSelected && { backgroundColor: colors.primary },
                  day.hasConflict && !day.isSelected && { backgroundColor: "#FF5722", opacity: 0.8 },
                ]}
                onPress={() => onSelectDate(day.date)}
              >
                <ThemedText
                  style={[
                    (day.isSelected || day.hasConflict) && { color: "white" },
                  ]}
                  weight={day.isToday ? "bold" : "normal"}
                >
                  {day.day}
                </ThemedText>
                <View style={styles.indicators}>
                  {day.hasEvents && (
                    <View
                      style={[
                        styles.eventDot,
                        { backgroundColor: (day.isSelected || day.hasConflict) ? "white" : colors.primary },
                      ]}
                    />
                  )}
                  {day.hasAbsences && (
                    <View
                      style={[
                        styles.absenceDot,
                        { backgroundColor: (day.isSelected || day.hasConflict) ? "white" : "#FF9800" },
                      ]}
                    />
                  )}
                  {day.hasConflict && (
                    <View style={styles.conflictBadge}>
                      <ThemedText style={styles.conflictText}>
                        {day.absenceCount}
                      </ThemedText>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ) : (
              <View />
            )}
          </View>
        ))}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  weekDaysContainer: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
  },
  daysContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    padding: 2,
  },
  dayButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  todayButton: {
    borderWidth: 1,
    borderColor: "#D72638",
  },
  indicators: {
    flexDirection: "row",
    gap: 3,
    marginTop: 2,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  absenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  conflictBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "white",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  conflictText: {
    color: "#FF5722",
    fontSize: 10,
    fontWeight: "bold" as const,
  },
});