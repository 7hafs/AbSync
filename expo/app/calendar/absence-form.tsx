import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Platform,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, UserRoundX, X } from 'lucide-react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import Colors from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';

import { Absence, AbsenceDuration, AbsenceStatus, AbsenceType } from '@/types';
import { useColorScheme } from 'react-native';
import { toDateString, fromDateString, todayDateString } from '@/utils/dateUtils';

const ABSENCE_TYPES: AbsenceType[] = ['Holiday', 'Sickness', 'Training', 'Unpaid Leave', 'Other'];
const DURATIONS: AbsenceDuration[] = ['Full', 'AM', 'PM'];
const STATUSES: AbsenceStatus[] = ['Pending', 'Approved', 'Rejected'];

function getTypeColor(type: AbsenceType) {
  switch (type) {
    case 'Holiday':
      return absenceColors.holiday;
    case 'Sickness':
      return absenceColors.sickness;
    case 'Training':
      return absenceColors.training;
    case 'Unpaid Leave':
      return absenceColors.unpaidLeave;
    case 'Other':
      return absenceColors.other;
    case 'Public Holiday':
      return absenceColors.publicHoliday;
    default:
      return absenceColors.pending;
  }
}

function formatDateLabel(date: string) {
  return fromDateString(date).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatMonthYear(date: Date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function buildMonthDays(targetDate: Date): Array<Date | null> {
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Array<Date | null> = [];

  for (let index = 0; index < firstDay.getDay(); index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(year, month, day));
  }

  return days;
}

export default function AbsenceFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; date?: string; session?: string }>();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 900;

  const canEdit = true;
  const { staff, getStaffById } = useStaffStore();
  const {
    absences,
    createAbsences,
    updateAbsence,
    deleteAbsence,
    validateNewAbsence,
  } = useAbsenceStore();

  const absenceId = typeof params.id === 'string' ? params.id : undefined;
  const existingAbsence = useMemo(
    () => absences.find((absence) => absence.id === absenceId),
    [absences, absenceId]
  );
  const activeStaff = useMemo(() => staff.filter((member) => member.active), [staff]);

  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [duration, setDuration] = useState<AbsenceDuration>('Full');
  const [type, setType] = useState<AbsenceType>('Holiday');
  const [status, setStatus] = useState<AbsenceStatus>('Pending');
  const [date, setDate] = useState<string>(typeof params.date === 'string' ? params.date : todayDateString());
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [notes, setNotes] = useState<string>('');
  const [cover, setCover] = useState<string>('');
  const [isMultiDay, setIsMultiDay] = useState<boolean>(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [showStaffPicker, setShowStaffPicker] = useState<boolean>(false);

  useEffect(() => {
    if (existingAbsence) {
      setSelectedStaffId(existingAbsence.staffId);
      setType(existingAbsence.type === 'Public Holiday' ? 'Holiday' : existingAbsence.type);
      setDate(existingAbsence.date);
      setSelectedDates([existingAbsence.date]);
      setDuration(existingAbsence.duration);
      setStatus(existingAbsence.status);
      setNotes(existingAbsence.notes);
      setCover(existingAbsence.cover ?? '');
      setCurrentMonth(new Date(existingAbsence.date));
      return;
    }

    const routeDate = typeof params.date === 'string' ? params.date : todayDateString();
    const routeDuration = params.session === 'AM' || params.session === 'PM' ? params.session : 'Full';
    setDate(routeDate);
    setSelectedDates([routeDate]);
    setDuration(routeDuration);
    setStatus('Pending');
    setCurrentMonth(new Date(routeDate));
  }, [existingAbsence, params.date, params.session]);

  const selectedStaff = getStaffById(selectedStaffId);
  const datesToSave = isMultiDay ? selectedDates.slice().sort() : [date];
  const dayCells = buildMonthDays(currentMonth);

  const handleToggleDate = (value: string) => {
    setSelectedDates((currentDates) => {
      if (currentDates.includes(value)) {
        return currentDates.filter((item) => item !== value);
      }

      return [...currentDates, value].sort();
    });
  };

  const handleSave = () => {
    if (!canEdit) {
      Alert.alert('View-only access', 'Only editors can create or update absences.');
      return;
    }

    if (!selectedStaffId) {
      Alert.alert('Missing employee', 'Please select an employee name.');
      return;
    }

    if (!type) {
      Alert.alert('Missing type', 'Please select an absence type.');
      return;
    }

    if (!datesToSave.length || datesToSave.some((value) => !value)) {
      Alert.alert('Missing date', 'Please select at least one date.');
      return;
    }

    const validation = validateNewAbsence(selectedStaffId, datesToSave, duration, absenceId);
    if (!validation.valid) {
      Alert.alert('Cannot save absence', validation.message ?? 'Please review this request.');
      return;
    }

    if (existingAbsence) {
      if (existingAbsence.locked || existingAbsence.type === 'Public Holiday') {
        Alert.alert('Locked event', 'Public holidays cannot be edited.');
        return;
      }

      const updatedAbsence: Absence = {
        ...existingAbsence,
        staffId: selectedStaffId,
        name: selectedStaff?.name ?? existingAbsence.name,
        type,
        date: datesToSave[0],
        duration,
        status,
        cover: cover.trim() || null,
        notes: notes.trim(),
      };

      updateAbsence(updatedAbsence);
      router.back();
      return;
    }

    createAbsences({
      staffId: selectedStaffId,
      name: selectedStaff?.name ?? 'Unknown employee',
      type,
      dates: datesToSave,
      duration,
      notes: notes.trim(),
      cover: cover.trim() || null,
      createdBy: 'Manager',
    });

    Alert.alert(
      'Absence Saved',
      `${datesToSave.length} absence request${datesToSave.length > 1 ? 's' : ''} saved successfully as Pending.`
    );
    router.back();
  };

  const handleDelete = () => {
    if (!existingAbsence) {
      return;
    }

    if (existingAbsence.locked || existingAbsence.type === 'Public Holiday') {
      Alert.alert('Locked event', 'Public holidays cannot be deleted.');
      return;
    }

    const confirmDelete = () => {
      console.log('[AbsenceForm] Deleting absence', existingAbsence.id);
      deleteAbsence(existingAbsence.id);
      router.back();
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('Are you sure you want to remove this absence?')
        : true;
      if (confirmed) {
        confirmDelete();
      }
      return;
    }

    Alert.alert('Delete absence', 'Are you sure you want to remove this absence?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: confirmDelete,
      },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: existingAbsence ? 'Edit Absence' : 'Create Absence',
          headerRight: () =>
            existingAbsence && canEdit && !existingAbsence.locked ? (
              <TouchableOpacity onPress={handleDelete} testID="absence-delete-button">
                <ThemedText style={styles.deleteText}>Delete</ThemedText>
              </TouchableOpacity>
            ) : null,
        }}
      />

      <ScrollView contentContainerStyle={[styles.content, isLargeScreen && styles.contentLarge]}>
        <View style={[styles.heroCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.heroTopRow}>
            <View>
              <ThemedText style={styles.heroTitle}>Absence request</ThemedText>
              <ThemedText variant="secondary" style={styles.heroSubtitle}>
                Save requests with status, cover, clash detection, and multi-day support.
              </ThemedText>
            </View>

          </View>

          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Employee Name *</ThemedText>
            <TouchableOpacity
              testID="absence-staff-picker"
              style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowStaffPicker(true)}
            >
              <ThemedText style={!selectedStaff ? { color: colors.secondaryText } : undefined}>
                {selectedStaff?.name ?? 'Select employee'}
              </ThemedText>
              <ChevronDown size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          <View style={styles.formSection}>
            <View style={styles.inlineLabelRow}>
              <ThemedText style={styles.label}>Multi-day</ThemedText>
              {!existingAbsence ? (
                <TouchableOpacity
                  testID="absence-multiday-toggle"
                  style={[styles.toggleButton, { backgroundColor: isMultiDay ? colors.primary : colors.surfaceVariant }]}
                  onPress={() => setIsMultiDay((currentValue) => !currentValue)}
                >
                  <ThemedText style={[styles.toggleButtonText, isMultiDay && styles.toggleButtonTextActive]}>
                    {isMultiDay ? 'On' : 'Off'}
                  </ThemedText>
                </TouchableOpacity>
              ) : null}
            </View>

            {!isMultiDay ? (
              <View style={[styles.singleDateCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <CalendarDays size={18} color={colors.primary} />
                <TextInput
                  testID="absence-date-input"
                  style={[styles.dateInput, { color: colors.text }]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.secondaryText}
                  autoCapitalize="none"
                />
              </View>
            ) : (
              <View style={[styles.calendarPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.calendarHeader}>
                  <TouchableOpacity onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
                    <ChevronLeft size={20} color={colors.text} />
                  </TouchableOpacity>
                  <ThemedText style={styles.calendarTitle}>{formatMonthYear(currentMonth)}</ThemedText>
                  <TouchableOpacity onPress={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
                    <ChevronRight size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <View style={styles.weekRow}>
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayLabel) => (
                    <ThemedText key={dayLabel} style={[styles.weekLabel, { color: colors.secondaryText }]}>
                      {dayLabel}
                    </ThemedText>
                  ))}
                </View>

                <View style={styles.daysGrid}>
                  {dayCells.map((dayValue, index) => {
                    if (!dayValue) {
                      return <View key={`empty-${index}`} style={styles.dayCell} />;
                    }

                    const dateValue = toDateString(dayValue);
                    const isSelected = selectedDates.includes(dateValue);

                    return (
                      <TouchableOpacity
                        key={dateValue}
                        testID={`calendar-date-${dateValue}`}
                        style={[
                          styles.dayCell,
                          styles.dayButton,
                          { borderColor: colors.border },
                          isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => handleToggleDate(dateValue)}
                      >
                        <ThemedText style={[styles.dayNumber, isSelected && styles.dayNumberActive]}>
                          {dayValue.getDate()}
                        </ThemedText>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <ThemedText variant="secondary" style={styles.selectedDatesLabel}>
                  {selectedDates.length ? selectedDates.map(formatDateLabel).join(' • ') : 'No dates selected'}
                </ThemedText>
              </View>
            )}
          </View>

          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Absence Type *</ThemedText>
            <View style={styles.optionGrid}>
              {ABSENCE_TYPES.map((item) => {
                const active = item === type;
                const itemColor = getTypeColor(item);
                return (
                  <TouchableOpacity
                    key={item}
                    testID={`absence-type-${item}`}
                    style={[
                      styles.optionButton,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      active && { backgroundColor: itemColor, borderColor: itemColor },
                    ]}
                    onPress={() => setType(item)}
                  >
                    <View style={[styles.typeDotSmall, { backgroundColor: itemColor }]} />
                    <ThemedText style={[styles.optionText, active && styles.optionTextActive]}>{item}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Duration</ThemedText>
            <View style={styles.segmentRow}>
              {DURATIONS.map((item) => {
                const active = item === duration;
                return (
                  <TouchableOpacity
                    key={item}
                    testID={`absence-duration-${item}`}
                    style={[
                      styles.segmentButton,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      active && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setDuration(item)}
                  >
                    <ThemedText style={[styles.segmentText, active && styles.optionTextActive]}>{item}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Status</ThemedText>
            <View style={styles.segmentRow}>
              {STATUSES.map((item) => {
                const active = item === status;
                return (
                  <TouchableOpacity
                    key={item}
                    testID={`absence-status-${item}`}
                    style={[
                      styles.segmentButton,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      active && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                    onPress={() => setStatus(item)}
                  >
                    <ThemedText style={[styles.segmentText, active && styles.optionTextActive]}>{item}</ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
            <ThemedText variant="secondary" style={styles.helperText}>
              New requests should normally stay Pending until reviewed.
            </ThemedText>
          </View>

          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Covered by</ThemedText>
            <TextInput
              testID="absence-cover-input"
              style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={cover}
              onChangeText={setCover}
              placeholder="Optional cover person"
              placeholderTextColor={colors.secondaryText}
            />
          </View>

          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Notes</ThemedText>
            <TextInput
              testID="absence-notes-input"
              style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes"
              placeholderTextColor={colors.secondaryText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {!canEdit ? (
            <View style={[styles.readOnlyCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              <UserRoundX size={18} color={colors.secondaryText} />
              <ThemedText variant="secondary">This shared calendar is view-only.</ThemedText>
            </View>
          ) : (
            <TouchableOpacity
              testID="absence-save-button"
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleSave}
            >
              <ThemedText style={styles.saveButtonText}>{existingAbsence ? 'Update absence' : 'Save absence'}</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal visible={showStaffPicker} transparent animationType="slide" onRequestClose={() => setShowStaffPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}> 
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText style={styles.modalTitle}>Select employee</ThemedText>
              <TouchableOpacity onPress={() => setShowStaffPicker(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={activeStaff}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`staff-option-${item.id}`}
                  style={[styles.staffRow, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSelectedStaffId(item.id);
                    setShowStaffPicker(false);
                  }}
                >
                  <ThemedText style={styles.staffName}>{item.name}</ThemedText>
                  <ThemedText variant="secondary">{item.department ?? 'Team member'}</ThemedText>
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
    paddingBottom: 32,
  },
  contentLarge: {
    alignItems: 'center',
  },
  heroCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,
    gap: 18,
    width: '100%',
    maxWidth: 860,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  heroSubtitle: {
    marginTop: 6,
    lineHeight: 20,
    maxWidth: 520,
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
  },
  limitText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  formSection: {
    gap: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  pickerButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inlineLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  toggleButtonTextActive: {
    color: 'white',
  },
  singleDateCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateInput: {
    flex: 1,
    fontSize: 16,
  },
  calendarPanel: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 12,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600' as const,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
  },
  dayButton: {
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  dayNumberActive: {
    color: 'white',
  },
  selectedDatesLabel: {
    lineHeight: 20,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionButton: {
    minWidth: '47%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  typeDotSmall: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  optionTextActive: {
    color: 'white',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 110,
    fontSize: 16,
  },
  readOnlyCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  saveButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700' as const,
  },
  deleteText: {
    color: '#DC2626',
    fontWeight: '700' as const,
    marginRight: 14,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  modalCard: {
    maxHeight: '70%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  modalHeader: {
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  staffRow: {
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 4,
  },
  staffName: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
});
