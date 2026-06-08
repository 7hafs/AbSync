import React, { useState } from "react";
import { View, StyleSheet, TextInput, Switch, Platform, TouchableOpacity, ScrollView } from "react-native";
import ThemedText from "@/components/ThemedText";
import ThemedView from "@/components/ThemedView";
import Button from "@/components/Button";
import { EventType } from "@/types";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import useStaffStore from "@/store/useStaffStore";

interface EventFormProps {
  initialEvent?: EventType;
  onSave: (event: EventType) => void;
  onCancel: () => void;
}

export default function EventForm({
  initialEvent,
  onSave,
  onCancel,
}: EventFormProps) {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  
  const { staff } = useStaffStore();
  
  const [title, setTitle] = useState(initialEvent?.title || "");
  const [date, setDate] = useState(initialEvent?.date || "");
  const [startTime, setStartTime] = useState(initialEvent?.startTime || "");
  const [endTime, setEndTime] = useState(initialEvent?.endTime || "");
  const [timeOfDay, setTimeOfDay] = useState<'AM' | 'PM' | undefined>(initialEvent?.timeOfDay);
  const [personId, setPersonId] = useState<string | undefined>(initialEvent?.personId);
  const [isRecurring, setIsRecurring] = useState(initialEvent?.isRecurring || false);
  
  const handleSave = () => {
    if (!title || !date) {
      // Show error
      return;
    }
    
    const event: EventType = {
      id: initialEvent?.id || Date.now().toString(),
      title,
      date,
      startTime,
      endTime,
      timeOfDay,
      personId,
      isRecurring,
      recurringPattern: isRecurring ? "weekly" : undefined,
    };
    
    onSave(event);
  };
  
  return (
    <ThemedView style={styles.container}>
      <ThemedText size="large" weight="bold" style={styles.header}>
        {initialEvent ? "Edit Event" : "New Event"}
      </ThemedText>
      
      <ScrollView style={styles.form}>
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
            placeholder="Event title"
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
          <ThemedText weight="semibold">Time of Day</ThemedText>
          <View style={styles.timeOfDaySelector}>
            <TouchableOpacity
              style={[
                styles.timeOfDayButton,
                timeOfDay === 'AM' && { backgroundColor: colors.primary },
                { borderColor: colors.border }
              ]}
              onPress={() => setTimeOfDay('AM')}
            >
              <ThemedText style={timeOfDay === 'AM' && { color: 'white' }}>AM</ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.timeOfDayButton,
                timeOfDay === 'PM' && { backgroundColor: colors.primary },
                { borderColor: colors.border }
              ]}
              onPress={() => setTimeOfDay('PM')}
            >
              <ThemedText style={timeOfDay === 'PM' && { color: 'white' }}>PM</ThemedText>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.timeOfDayButton,
                !timeOfDay && { backgroundColor: colors.primary },
                { borderColor: colors.border }
              ]}
              onPress={() => setTimeOfDay(undefined)}
            >
              <ThemedText style={!timeOfDay && { color: 'white' }}>All Day</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.row}>
          <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
            <ThemedText weight="semibold">Start Time</ThemedText>
            <TextInput
              style={[
                styles.input,
                { 
                  color: colors.text,
                  backgroundColor: colors.surfaceVariant,
                  borderColor: colors.border,
                },
              ]}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="HH:MM"
              placeholderTextColor={colors.secondaryText}
            />
          </View>
          
          <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
            <ThemedText weight="semibold">End Time</ThemedText>
            <TextInput
              style={[
                styles.input,
                { 
                  color: colors.text,
                  backgroundColor: colors.surfaceVariant,
                  borderColor: colors.border,
                },
              ]}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="HH:MM"
              placeholderTextColor={colors.secondaryText}
            />
          </View>
        </View>
        
        {staff.length > 0 && (
          <View style={styles.formGroup}>
            <ThemedText weight="semibold">Assign to Person</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.peopleSelector}>
              <TouchableOpacity
                style={[
                  styles.personChip,
                  !personId && { backgroundColor: colors.primary },
                  { borderColor: colors.border }
                ]}
                onPress={() => setPersonId(undefined)}
              >
                <ThemedText size="small" style={!personId && { color: 'white' }}>None</ThemedText>
              </TouchableOpacity>
              
              {staff.map((person) => (
                <TouchableOpacity
                  key={person.id}
                  style={[
                    styles.personChip,
                    personId === person.id && { backgroundColor: colors.primary },
                    { borderColor: colors.border }
                  ]}
                  onPress={() => setPersonId(person.id)}
                >
                  <ThemedText size="small" style={personId === person.id && { color: 'white' }}>
                    {person.name}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
        
        <View style={[styles.formGroup, styles.switchRow]}>
          <ThemedText weight="semibold">Recurring Event</ThemedText>
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
      </ScrollView>
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
  row: {
    flexDirection: "row",
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
  timeOfDaySelector: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  timeOfDayButton: {
    flex: 1,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
  },
  peopleSelector: {
    marginTop: 8,
  },
  personChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
});