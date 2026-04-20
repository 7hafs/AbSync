import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  FlatList,
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useAbsenceStore from "@/store/useAbsenceStore";
import useStaffStore from "@/store/useStaffStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { Absence, AbsenceSessionType, AbsenceTypeCategory, AbsenceStatus } from "@/types";
import { ChevronDown, X, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react-native";
import useAuthStore from "@/store/useAuthStore";

export default function AbsenceFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { absences, addAbsence, updateAbsence, deleteAbsence } = useAbsenceStore();
  const { staff, getStaffById } = useStaffStore();
  const { user } = useAuthStore();
  const canEdit = user?.accessLevel !== "viewer";
  
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [date, setDate] = useState(typeof params.date === "string" ? params.date : new Date().toISOString().split('T')[0]);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [session, setSession] = useState<AbsenceSessionType>(
    (typeof params.session === "string" && (params.session === 'AM' || params.session === 'PM')) 
      ? params.session as AbsenceSessionType 
      : "AM"
  );
  const [type, setType] = useState<AbsenceTypeCategory>("Holiday");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<AbsenceStatus>("Confirmed");
  const [showStaffPicker, setShowStaffPicker] = useState(false);
  
  const absenceId = typeof params.id === "string" ? params.id : undefined;
  const isEditing = !!absenceId;

  const activeStaff = staff.filter((s) => s.active);

  useEffect(() => {
    if (absenceId) {
      const existingAbsence = absences.find((a) => a.id === absenceId);
      if (existingAbsence) {
        setSelectedStaffId(existingAbsence.staffId);
        setDate(existingAbsence.date);
        setSelectedDates(new Set([existingAbsence.date]));
        setIsMultiDay(false);
        setSession(existingAbsence.session);
        setType(existingAbsence.type);
        setNote(existingAbsence.note || "");
        setStatus(existingAbsence.status);
      }
    } else if (!isMultiDay) {
      setSelectedDates(new Set([date]));
    }
  }, [absenceId, absences]);

  const handleSave = () => {
    if (!canEdit) {
      Alert.alert("View-only access", "You can review this shared calendar, but only editors can save absences.");
      return;
    }

    if (!selectedStaffId) {
      Alert.alert("Error", "Please select a staff member");
      return;
    }

    if (isMultiDay) {
      if (selectedDates.size === 0) {
        Alert.alert("Error", "Please select at least one date");
        return;
      }

      const dates = Array.from(selectedDates).sort();
      let absenceCount = 0;
      
      dates.forEach((dateStr) => {
        const absenceData: Absence = {
          id: `${Date.now()}-${absenceCount}`,
          staffId: selectedStaffId,
          date: dateStr,
          session,
          type,
          note: note.trim() || undefined,
          status,
          createdBy: "Admin",
          createdAt: new Date().toISOString(),
        };
        addAbsence(absenceData);
        absenceCount++;
      });
      
      Alert.alert("Success", `Added ${absenceCount} absence${absenceCount > 1 ? 's' : ''} for ${getStaffById(selectedStaffId)?.name}`);
    } else {
      const absenceData: Absence = {
        id: absenceId || Date.now().toString(),
        staffId: selectedStaffId,
        date,
        session,
        type,
        note: note.trim() || undefined,
        status,
        createdBy: "Admin",
        createdAt: absenceId ? absences.find((a) => a.id === absenceId)?.createdAt || new Date().toISOString() : new Date().toISOString(),
      };

      if (isEditing) {
        updateAbsence(absenceData);
      } else {
        addAbsence(absenceData);
      }
    }

    router.back();
  };

  const handleDelete = () => {
    if (!canEdit) {
      Alert.alert("View-only access", "You can review this shared calendar, but only editors can delete absences.");
      return;
    }

    if (!absenceId) return;

    Alert.alert(
      "Delete Absence",
      "Are you sure you want to delete this absence record?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteAbsence(absenceId);
            router.back();
          },
        },
      ]
    );
  };

  const selectedStaff = getStaffById(selectedStaffId);

  const toggleDate = (dateStr: string) => {
    const newDates = new Set(selectedDates);
    if (newDates.has(dateStr)) {
      newDates.delete(dateStr);
    } else {
      newDates.add(dateStr);
    }
    setSelectedDates(newDates);
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    return days;
  };

  const changeMonth = (direction: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(currentMonth.getMonth() + direction);
    setCurrentMonth(newMonth);
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('default', { month: 'long', year: 'numeric' });
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: isEditing ? "Edit Absence" : "Add Absence",
          headerRight: () =>
            isEditing && canEdit ? (
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
            <ThemedText>Staff Member *</ThemedText>
          </ThemedText>
          <TouchableOpacity
            style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setShowStaffPicker(true)}
          >
            <ThemedText style={!selectedStaffId ? { color: colors.secondaryText } : undefined}>
              <ThemedText>{selectedStaff ? selectedStaff.name : "Select staff member"}</ThemedText>
            </ThemedText>
            <ChevronDown size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {!isEditing && (
          <View style={styles.section}>
            <View style={styles.toggleRow}>
              <ThemedText style={styles.label}>
                <ThemedText>Multiple Days</ThemedText>
              </ThemedText>
              <TouchableOpacity
                style={[styles.toggle, isMultiDay && { backgroundColor: colors.primary }]}
                onPress={() => setIsMultiDay(!isMultiDay)}
              >
                <View style={[styles.toggleThumb, isMultiDay && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!isMultiDay ? (
          <View style={styles.section}>
            <ThemedText style={styles.label}>
              <ThemedText>Date</ThemedText>
            </ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.secondaryText}
            />
          </View>
        ) : (
          <View style={styles.section}>
            <ThemedText style={styles.label}>
              <ThemedText>Select Dates ({selectedDates.size} selected)</ThemedText>
            </ThemedText>
            <View style={[styles.calendarContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.monthHeader}>
                <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthButton}>
                  <ChevronLeft size={24} color={colors.text} />
                </TouchableOpacity>
                <ThemedText style={styles.monthTitle}>{formatMonthYear(currentMonth)}</ThemedText>
                <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthButton}>
                  <ChevronRight size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.weekDaysRow}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                  <ThemedText key={idx} style={[styles.weekDay, { color: colors.secondaryText }]}>
                    {day}
                  </ThemedText>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {getDaysInMonth(currentMonth).map((day, idx) => {
                  if (!day) {
                    return <View key={`empty-${idx}`} style={styles.dayCell} />;
                  }
                  const dateStr = day.toISOString().split('T')[0];
                  const isSelected = selectedDates.has(dateStr);
                  const isToday = dateStr === new Date().toISOString().split('T')[0];
                  
                  return (
                    <TouchableOpacity
                      key={dateStr}
                      style={[
                        styles.dayCell,
                        isSelected && { backgroundColor: colors.primary },
                        isToday && !isSelected && { borderColor: colors.primary, borderWidth: 1 },
                      ]}
                      onPress={() => toggleDate(dateStr)}
                    >
                      <ThemedText
                        style={[
                          styles.dayText,
                          isSelected && styles.dayTextSelected,
                        ]}
                      >
                        {day.getDate()}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <ThemedText style={styles.label}>
            <ThemedText>Session</ThemedText>
          </ThemedText>
          <View style={styles.buttonGroup}>
            {(['AM', 'PM', 'Full Day'] as AbsenceSessionType[]).map((s) => (
              <TouchableOpacity
                key={s}
                style={[
                  styles.optionButton,
                  { borderColor: colors.border },
                  session === s && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setSession(s)}
              >
                <ThemedText style={[
                  styles.optionText,
                  session === s && styles.optionTextSelected
                ]}>
                  <ThemedText>{s}</ThemedText>
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.label}>
            <ThemedText>Type</ThemedText>
          </ThemedText>
          <View style={styles.buttonGroup}>
            {(['Holiday', 'Sickness', 'Other'] as AbsenceTypeCategory[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.optionButton,
                  { borderColor: colors.border },
                  type === t && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setType(t)}
              >
                <ThemedText style={[
                  styles.optionText,
                  type === t && styles.optionTextSelected
                ]}>
                  <ThemedText>{t}</ThemedText>
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.label}>
            <ThemedText>Status</ThemedText>
          </ThemedText>
          <View style={styles.buttonGroup}>
            {(['Pending', 'Confirmed', 'Cancelled'] as AbsenceStatus[]).map((st) => (
              <TouchableOpacity
                key={st}
                style={[
                  styles.optionButton,
                  { borderColor: colors.border },
                  status === st && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setStatus(st)}
              >
                <ThemedText style={[
                  styles.optionText,
                  status === st && styles.optionTextSelected
                ]}>
                  <ThemedText>{st}</ThemedText>
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText style={styles.label}>
            <ThemedText>Note (Optional)</ThemedText>
          </ThemedText>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border }]}
            placeholder="Add a note..."
            placeholderTextColor={colors.secondaryText}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={4}
          />
        </View>

        {canEdit ? (
        <TouchableOpacity
          testID="absence-save-button"
          style={[styles.saveButton, { backgroundColor: colors.primary }]}
          onPress={handleSave}
        >
          <ThemedText style={styles.saveButtonText}>
            <ThemedText>{isEditing ? "Update" : "Add"} Absence</ThemedText>
          </ThemedText>
        </TouchableOpacity>
        ) : (
          <View style={[styles.readOnlyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <ThemedText variant="secondary">This shared calendar is view-only.</ThemedText>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showStaffPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStaffPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText style={styles.modalTitle}>
                <ThemedText>Select Staff Member</ThemedText>
              </ThemedText>
              <TouchableOpacity onPress={() => setShowStaffPicker(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={activeStaff}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.staffItem,
                    { borderBottomColor: colors.border },
                    selectedStaffId === item.id && { backgroundColor: colors.surface },
                  ]}
                  onPress={() => {
                    setSelectedStaffId(item.id);
                    setShowStaffPicker(false);
                  }}
                >
                  <ThemedText style={styles.staffItemName}>
                    <ThemedText>{item.name}</ThemedText>
                  </ThemedText>
                  {item.department && (
                    <ThemedText style={[styles.staffItemDept, { color: colors.secondaryText }]}>
                      <ThemedText>{item.department}</ThemedText>
                    </ThemedText>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
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
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  pickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  buttonGroup: {
    flexDirection: "row",
    gap: 8,
  },
  optionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
  },
  optionText: {
    fontSize: 14,
    fontWeight: "600" as const,
  },
  optionTextSelected: {
    color: "white",
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
  readOnlyCard: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 20,
    alignItems: "center",
  },
  deleteButton: {
    fontSize: 16,
    marginRight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    maxHeight: "70%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
  },
  staffItem: {
    padding: 16,
    borderBottomWidth: 1,
  },
  staffItemName: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  staffItemDept: {
    fontSize: 14,
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#ccc",
    padding: 3,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "white",
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
  calendarContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  monthHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  monthButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: "700" as const,
  },
  weekDaysRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  weekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: "14.28%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    marginBottom: 4,
  },
  dayText: {
    fontSize: 14,
  },
  dayTextSelected: {
    color: "white",
    fontWeight: "600" as const,
  },
});
