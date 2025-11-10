import React, { useMemo } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import { getWeekDates, formatDate, getShortDayName, generateTimeSlots } from "@/utils/dateUtils";
import useCalendarStore from "@/store/useCalendarStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { EventType } from "@/types";

interface WeekViewProps {
  currentDate: Date;
  onSelectDate: (date: string) => void;
}

export default function WeekView({ currentDate, onSelectDate }: WeekViewProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const { events, selectedDate } = useCalendarStore();
  
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const timeSlots = useMemo(() => generateTimeSlots(), []);
  
  const today = useMemo(() => {
    const now = new Date();
    return formatDate(now);
  }, []);
  
  const getEventsForDateAndTime = (date: string, time: string): EventType[] => {
    return events.filter(event => {
      return event.date === date && event.startTime && event.startTime.startsWith(time.split(":")[0]);
    });
  };
  
  return (
    <ThemedView style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.timeColumn}>
          <ThemedText variant="secondary" size="small">Time</ThemedText>
        </View>
        
        {weekDates.map((date, index) => {
          const dateStr = formatDate(date);
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          
          return (
            <View 
              key={index} 
              style={[
                styles.dayColumn,
                isSelected && { backgroundColor: colors.surfaceVariant },
              ]}
            >
              <ThemedText 
                variant={isToday ? "primary" : "secondary"} 
                size="small"
                weight={isToday ? "bold" : "normal"}
              >
                {getShortDayName(date)}
              </ThemedText>
              <ThemedText 
                variant={isToday ? "primary" : "default"} 
                weight={isToday ? "bold" : "normal"}
              >
                {date.getDate()}
              </ThemedText>
            </View>
          );
        })}
      </View>
      
      <ScrollView>
        {timeSlots.map((time, timeIndex) => (
          <View key={timeIndex} style={styles.timeRow}>
            <View style={styles.timeColumn}>
              <ThemedText variant="secondary" size="small">{time}</ThemedText>
            </View>
            
            {weekDates.map((date, dateIndex) => {
              const dateStr = formatDate(date);
              const eventsForSlot = getEventsForDateAndTime(dateStr, time);
              
              return (
                <View key={dateIndex} style={styles.timeSlot}>
                  {eventsForSlot.map((event, eventIndex) => (
                    <View 
                      key={eventIndex} 
                      style={[
                        styles.eventItem,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <ThemedText style={{ color: "white" }} numberOfLines={1}>
                        {event.title}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  timeColumn: {
    width: 50,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dayColumn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeRow: {
    flexDirection: "row",
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  timeSlot: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: "#EEEEEE",
    padding: 2,
  },
  eventItem: {
    padding: 4,
    borderRadius: 4,
    marginBottom: 2,
  },
});