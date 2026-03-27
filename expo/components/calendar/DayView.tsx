import React, { useMemo } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, useColorScheme } from "react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import { formatDate, getDayName } from "@/utils/dateUtils";
import useCalendarStore from "@/store/useCalendarStore";
import useNotesStore from "@/store/useNotesStore";
import useRemindersStore from "@/store/useRemindersStore";
import usePeopleStore from "@/store/usePeopleStore";
import Colors from "@/constants/colors";
import useThemeStore from "@/store/useThemeStore";
import { EventType, NoteType, ReminderType } from "@/types";
import { FileText, Clock, UserX, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";

interface DayViewProps {
  currentDate: Date;
  onEventPress: (event: EventType) => void;
  onDateChange?: (date: Date) => void;
}

export default function DayView({ currentDate, onEventPress, onDateChange }: DayViewProps) {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const { events } = useCalendarStore();
  const { notes } = useNotesStore();
  const { reminders } = useRemindersStore();
  const { people, getAbsencesForDate } = usePeopleStore();
  
  const dateStr = useMemo(() => formatDate(currentDate), [currentDate]);
  const dayName = useMemo(() => getDayName(currentDate), [currentDate]);
  
  const eventsForDay = useMemo(() => {
    return events.filter(event => event.date === dateStr);
  }, [events, dateStr]);
  
  const notesForDay = useMemo(() => {
    return notes.filter(note => note.date === dateStr);
  }, [notes, dateStr]);
  
  const remindersForDay = useMemo(() => {
    return reminders.filter(reminder => reminder.date === dateStr);
  }, [reminders, dateStr]);
  
  const absencesForDay = useMemo(() => {
    return getAbsencesForDate(dateStr);
  }, [dateStr, getAbsencesForDate]);
  
  const hasConflict = useMemo(() => absencesForDay.length > 2, [absencesForDay]);
  
  const changeDay = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction);
    if (onDateChange) {
      onDateChange(newDate);
    }
  };
  
  const amEvents = useMemo(() => {
    return eventsForDay.filter(event => event.timeOfDay === 'AM' || (!event.timeOfDay && event.startTime && parseInt(event.startTime.split(':')[0]) < 12));
  }, [eventsForDay]);
  
  const pmEvents = useMemo(() => {
    return eventsForDay.filter(event => event.timeOfDay === 'PM' || (!event.timeOfDay && event.startTime && parseInt(event.startTime.split(':')[0]) >= 12));
  }, [eventsForDay]);
  
  const handleNotePress = (note: NoteType) => {
    router.push({
      pathname: "/notes/note-editor",
      params: { id: note.id },
    });
  };
  
  const handleReminderPress = (reminder: ReminderType) => {
    router.push({
      pathname: "/reminders/reminder-form",
      params: { id: reminder.id },
    });
  };
  
  const handleAddNote = () => {
    router.push({
      pathname: "/notes/note-editor",
      params: { date: dateStr },
    });
  };
  
  const handleAddReminder = () => {
    router.push({
      pathname: "/reminders/reminder-form",
      params: { date: dateStr },
    });
  };
  
  return (
    <ThemedView style={styles.container}>
      <View style={[
        styles.header,
        hasConflict && { backgroundColor: "#FF5722" }
      ]}>
        <View style={styles.dateNavigation}>
          <TouchableOpacity 
            style={[styles.navButton, { backgroundColor: hasConflict ? "rgba(255,255,255,0.2)" : colors.surfaceVariant }]}
            onPress={() => changeDay(-1)}
          >
            <ChevronLeft size={24} color={hasConflict ? "white" : colors.text} />
          </TouchableOpacity>
          <View style={styles.dateInfo}>
            <ThemedText 
              size="large" 
              weight="bold"
              style={hasConflict && { color: "white" }}
            >
              {dayName}
            </ThemedText>
            {hasConflict && (
              <ThemedText style={styles.conflictWarning}>
                ⚠️ High Absence Alert: {absencesForDay.length} absent
              </ThemedText>
            )}
          </View>
          <TouchableOpacity 
            style={[styles.navButton, { backgroundColor: hasConflict ? "rgba(255,255,255,0.2)" : colors.surfaceVariant }]}
            onPress={() => changeDay(1)}
          >
            <ChevronRight size={24} color={hasConflict ? "white" : colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: colors.surfaceVariant }]} 
            onPress={handleAddNote}
          >
            <FileText size={16} color={colors.primary} />
            <ThemedText style={styles.addButtonText}>Add Note</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.addButton, { backgroundColor: colors.surfaceVariant }]} 
            onPress={handleAddReminder}
          >
            <Clock size={16} color={colors.primary} />
            <ThemedText style={styles.addButtonText}>Add Reminder</ThemedText>
          </TouchableOpacity>
        </View>
      </View>
      
      {absencesForDay.length > 0 && (
        <View style={styles.absencesContainer}>
          <ThemedText weight="semibold" style={styles.sectionTitle}>
            Absences/Vacations
          </ThemedText>
          {absencesForDay.map((absence) => {
            const person = people.find(p => p.id === absence.personId);
            return (
              <View 
                key={absence.id} 
                style={[styles.absenceItem, { backgroundColor: colors.surfaceVariant }]}
              >
                <UserX size={16} color={colors.primary} />
                <View style={styles.absenceInfo}>
                  <ThemedText weight="semibold">
                    {person?.name || 'Unknown Person'}
                  </ThemedText>
                  <ThemedText variant="secondary" size="small">
                    {absence.type === 'vacation' ? 'Vacation' : 'Absence'}
                    {absence.reason ? ` - ${absence.reason}` : ''}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </View>
      )}
      
      {(notesForDay.length > 0 || remindersForDay.length > 0) && (
        <View style={styles.itemsContainer}>
          {notesForDay.length > 0 && (
            <View style={styles.sectionContainer}>
              <ThemedText weight="semibold" style={styles.sectionTitle}>
                Notes
              </ThemedText>
              {notesForDay.map((note) => (
                <TouchableOpacity 
                  key={note.id} 
                  style={[styles.noteItem, { backgroundColor: colors.surfaceVariant }]}
                  onPress={() => handleNotePress(note)}
                >
                  <FileText size={16} color={colors.primary} />
                  <ThemedText style={styles.itemTitle} numberOfLines={1}>
                    {note.title}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}
          
          {remindersForDay.length > 0 && (
            <View style={styles.sectionContainer}>
              <ThemedText weight="semibold" style={styles.sectionTitle}>
                Reminders
              </ThemedText>
              {remindersForDay.map((reminder) => (
                <TouchableOpacity 
                  key={reminder.id} 
                  style={[
                    styles.reminderItem, 
                    { 
                      backgroundColor: colors.surfaceVariant,
                      opacity: reminder.isCompleted ? 0.6 : 1
                    }
                  ]}
                  onPress={() => handleReminderPress(reminder)}
                >
                  <Clock size={16} color={colors.primary} />
                  <ThemedText 
                    style={[
                      styles.itemTitle, 
                      reminder.isCompleted && styles.completedText
                    ]} 
                    numberOfLines={1}
                  >
                    {reminder.title}
                  </ThemedText>
                  {reminder.time && (
                    <ThemedText variant="secondary" size="small">
                      {reminder.time}
                    </ThemedText>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}
      
      <ScrollView>
        <View style={styles.periodSection}>
          <View style={[styles.periodHeader, { backgroundColor: colors.primary }]}>
            <ThemedText style={{ color: 'white' }} weight="bold">AM</ThemedText>
          </View>
          
          {amEvents.length > 0 ? (
            amEvents.map((event) => {
              const person = event.personId ? people.find(p => p.id === event.personId) : null;
              return (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.eventCard,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                  onPress={() => onEventPress(event)}
                >
                  <View style={styles.eventCardContent}>
                    <ThemedText weight="semibold">{event.title}</ThemedText>
                    {event.startTime && event.endTime && (
                      <ThemedText variant="secondary" size="small">
                        {event.startTime} - {event.endTime}
                      </ThemedText>
                    )}
                    {person && (
                      <ThemedText variant="secondary" size="small">
                        {person.name}
                      </ThemedText>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyPeriod}>
              <ThemedText variant="secondary" size="small">No AM events</ThemedText>
            </View>
          )}
        </View>
        
        <View style={styles.periodSection}>
          <View style={[styles.periodHeader, { backgroundColor: colors.primary }]}>
            <ThemedText style={{ color: 'white' }} weight="bold">PM</ThemedText>
          </View>
          
          {pmEvents.length > 0 ? (
            pmEvents.map((event) => {
              const person = event.personId ? people.find(p => p.id === event.personId) : null;
              return (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.eventCard,
                    { backgroundColor: colors.surfaceVariant },
                  ]}
                  onPress={() => onEventPress(event)}
                >
                  <View style={styles.eventCardContent}>
                    <ThemedText weight="semibold">{event.title}</ThemedText>
                    {event.startTime && event.endTime && (
                      <ThemedText variant="secondary" size="small">
                        {event.startTime} - {event.endTime}
                      </ThemedText>
                    )}
                    {person && (
                      <ThemedText variant="secondary" size="small">
                        {person.name}
                      </ThemedText>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyPeriod}>
              <ThemedText variant="secondary" size="small">No PM events</ThemedText>
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  dateNavigation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dateInfo: {
    flex: 1,
    alignItems: "center",
  },
  conflictWarning: {
    color: "white",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600" as const,
  },
  headerActions: {
    flexDirection: "row",
    marginTop: 12,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  addButtonText: {
    marginLeft: 6,
  },
  itemsContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  sectionContainer: {
    marginBottom: 12,
  },
  sectionTitle: {
    marginBottom: 8,
  },
  noteItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  reminderItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  itemTitle: {
    marginLeft: 8,
    flex: 1,
  },
  completedText: {
    textDecorationLine: "line-through",
  },
  absencesContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  absenceItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  absenceInfo: {
    marginLeft: 8,
    flex: 1,
  },
  periodSection: {
    marginBottom: 24,
  },
  periodHeader: {
    padding: 12,
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 8,
  },
  eventCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  eventCardContent: {
    padding: 16,
  },
  emptyPeriod: {
    marginHorizontal: 16,
    padding: 24,
    alignItems: "center",
  },
});