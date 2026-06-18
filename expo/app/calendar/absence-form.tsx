import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
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
import * as DocumentPicker from 'expo-document-picker';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Paperclip,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRoundX,
  X,
} from 'lucide-react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import Colors, { absenceColors } from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';

import { Absence, AbsenceDocument, AbsenceDuration, AbsenceStatus, AbsenceType, StaffMember } from '@/types';
import { useColorScheme } from 'react-native';
import { toDateString, fromDateString, todayDateString, formatDateUK } from '@/utils/dateUtils';

const ABSENCE_TYPES: AbsenceType[] = ['Holiday', 'Sickness', 'Training', 'Unpaid Leave', 'Other'];
const DURATIONS: AbsenceDuration[] = ['Full', 'AM', 'PM'];
const STATUSES: AbsenceStatus[] = ['Pending', 'Approved', 'Rejected'];

const SUPPORTED_DOC_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

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
  const { staff, addStaff } = useStaffStore();
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
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [showStaffPicker, setShowStaffPicker] = useState<boolean>(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState<string>('');
  const [showAddStaff, setShowAddStaff] = useState<boolean>(false);
  const [newStaffName, setNewStaffName] = useState<string>('');
  const [newStaffDepartment, setNewStaffDepartment] = useState<string>('');
  const [uploadedDocs, setUploadedDocs] = useState<AbsenceDocument[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Filtered staff for search
  const filteredStaff = useMemo(() => {
    if (!staffSearchQuery.trim()) return activeStaff;
    const query = staffSearchQuery.toLowerCase();
    return activeStaff.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.department?.toLowerCase().includes(query) ||
        s.employeeId?.toLowerCase().includes(query)
    );
  }, [activeStaff, staffSearchQuery]);

  useEffect(() => {
    if (existingAbsence) {
      setSelectedStaffId(existingAbsence.staffId ?? '');
      setType(existingAbsence.type === 'Public Holiday' ? 'Holiday' : existingAbsence.type);
      setDate(existingAbsence.date);
      setSelectedDates([existingAbsence.date]);
      setDuration(existingAbsence.duration);
      setStatus(existingAbsence.status);
      setNotes(existingAbsence.notes);
      setCover(existingAbsence.cover ?? '');
      setUploadedDocs(existingAbsence.documents ?? []);
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

  const selectedStaff = staff.find((s) => s.id === selectedStaffId);
  const datesToSave = selectedDates.length > 0 ? selectedDates.slice().sort() : [date];
  const dayCells = buildMonthDays(currentMonth);

  const handleToggleDate = (value: string) => {
    setSelectedDates((currentDates) => {
      if (currentDates.includes(value)) {
        return currentDates.filter((item) => item !== value);
      }
      return [...currentDates, value].sort();
    });
  };

  // Inline add staff
  const handleAddStaffInline = () => {
    if (!newStaffName.trim()) {
      Alert.alert('Missing name', 'Please enter a name for the new staff member.');
      return;
    }

    const newMember: StaffMember = {
      id: Date.now().toString(),
      name: newStaffName.trim(),
      department: newStaffDepartment.trim() || undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };

    addStaff(newMember);
    setSelectedStaffId(newMember.id);
    setShowAddStaff(false);
    setNewStaffName('');
    setNewStaffDepartment('');
    setStaffSearchQuery('');
    setShowStaffPicker(false);

    Alert.alert('Staff Added', `${newStaffName.trim()} has been added and selected.`);
  };

  // Document picker
  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_DOC_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const doc: AbsenceDocument = {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: asset.name,
        uri: asset.uri,
        type: asset.mimeType ?? 'application/octet-stream',
        size: asset.size ?? 0,
        uploadedAt: new Date().toISOString(),
      };

      setUploadedDocs((prev) => [...prev, doc]);
    } catch (err) {
      console.error('[AbsenceForm] Document picker error:', err);
      Alert.alert('Upload failed', 'Could not select the document. Please try again.');
    }
  };

  const handleRemoveDocument = (docId: string) => {
    setUploadedDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  const handleSave = async () => {
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

    setIsSaving(true);

    try {
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
          documents: uploadedDocs.length > 0 ? uploadedDocs : undefined,
        };

        updateAbsence(updatedAbsence);
        Alert.alert('Absence Updated', 'The absence has been updated successfully.');
        router.back();
        return;
      }

      const newIds = createAbsences({
        staffId: selectedStaffId,
        name: selectedStaff?.name ?? 'Unknown employee',
        type,
        dates: datesToSave,
        duration,
        notes: notes.trim(),
        cover: cover.trim() || null,
        createdBy: 'Manager',
      });

      // Attach documents to first absence if multi-day
      if (uploadedDocs.length > 0 && newIds.length > 0) {
        const store = useAbsenceStore.getState();
        const firstAbsence = store.absences.find((a) => a.id === newIds[0]);
        if (firstAbsence) {
          store.updateAbsence({ ...firstAbsence, documents: uploadedDocs });
        }
      }

      Alert.alert(
        'Absence Saved',
        `${datesToSave.length} absence request${datesToSave.length > 1 ? 's' : ''} saved successfully as Pending.`
      );
      router.back();
    } catch (err) {
      console.error('[AbsenceForm] Save error:', err);
      Alert.alert(
        'Save Failed',
        'Could not save the absence. Please check your connection and try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existingAbsence) return;

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
      if (confirmed) confirmDelete();
      return;
    }

    Alert.alert('Delete absence', 'Are you sure you want to remove this absence?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: confirmDelete },
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
              <ThemedText style={styles.heroTitle}>
                {existingAbsence ? 'Edit absence' : 'New absence request'}
              </ThemedText>
              <ThemedText variant="secondary" style={styles.heroSubtitle}>
                {existingAbsence
                  ? 'Update the absence details below.'
                  : 'Select an employee, choose dates on the calendar, and save.'}
              </ThemedText>
            </View>
          </View>

          {/* ── Employee Selection ─────────────────────────────────── */}
          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Employee Name *</ThemedText>
            <TouchableOpacity
              testID="absence-staff-picker"
              style={[styles.pickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                setStaffSearchQuery('');
                setShowStaffPicker(true);
              }}
            >
              <ThemedText style={!selectedStaff ? { color: colors.secondaryText } : undefined}>
                {selectedStaff?.name ?? 'Select employee'}
              </ThemedText>
              <ChevronDown size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>

          {/* ── Calendar Date Selection (always visible) ───────────── */}
          <View style={styles.formSection}>
            <ThemedText style={styles.label}>
              Date{selectedDates.length > 1 ? 's' : ''} *
              {selectedDates.length > 0 && (
                <ThemedText variant="secondary">
                  {' '}– {selectedDates.length} day{selectedDates.length > 1 ? 's' : ''} selected
                </ThemedText>
              )}
            </ThemedText>
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
                  const isToday = dateValue === todayDateString();
                  const isPast = dateValue < todayDateString();

                  return (
                    <TouchableOpacity
                      key={dateValue}
                      testID={`calendar-date-${dateValue}`}
                      style={[
                        styles.dayCell,
                        styles.dayButton,
                        { borderColor: isToday ? colors.primary : colors.border },
                        isSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
                        isPast && !isSelected && { opacity: 0.3 },
                      ]}
                      onPress={() => {
                        if (isPast) return; // Prevent selecting past dates
                        handleToggleDate(dateValue);
                      }}
                      disabled={isPast}
                    >
                      <ThemedText
                        style={[
                          styles.dayNumber,
                          isToday && !isSelected && { color: colors.primary, fontWeight: '800' as const },
                          isSelected && styles.dayNumberActive,
                        ]}
                      >
                        {dayValue.getDate()}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.selectedDatesBar, { backgroundColor: colors.surfaceVariant }]}>
                <CalendarDays size={14} color={colors.primary} />
                <ThemedText variant="secondary" style={styles.selectedDatesLabel}>
                  {selectedDates.length > 0
                    ? selectedDates
                        .map((d) => formatDateUK(d))
                        .join('  •  ')
                    : 'Tap a single day for a one-day absence, or tap multiple days for a multi-day absence'}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* ── Absence Type ────────────────────────────────────────── */}
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

          {/* ── Duration ────────────────────────────────────────────── */}
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

          {/* ── Status ──────────────────────────────────────────────── */}
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
          </View>

          {/* ── Cover ───────────────────────────────────────────────── */}
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

          {/* ── Notes ───────────────────────────────────────────────── */}
          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Notes</ThemedText>
            <TextInput
              testID="absence-notes-input"
              style={[styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Optional notes (e.g. reason, handover details)"
              placeholderTextColor={colors.secondaryText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* ── Document Upload ─────────────────────────────────────── */}
          <View style={styles.formSection}>
            <ThemedText style={styles.label}>Documents</ThemedText>
            {uploadedDocs.length > 0 && (
              <View style={styles.docList}>
                {uploadedDocs.map((doc) => (
                  <View key={doc.id} style={[styles.docRow, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
                    <FileText size={16} color={colors.primary} />
                    <View style={styles.docInfo}>
                      <ThemedText style={styles.docName} numberOfLines={1}>{doc.name}</ThemedText>
                      <ThemedText variant="secondary" style={styles.docSize}>
                        {(doc.size / 1024).toFixed(1)} KB
                      </ThemedText>
                    </View>
                    <TouchableOpacity
                      testID={`remove-doc-${doc.id}`}
                      style={styles.docRemoveButton}
                      onPress={() => handleRemoveDocument(doc.id)}
                    >
                      <Trash2 size={16} color={absenceColors.rejected} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity
              testID="absence-upload-doc"
              style={[styles.uploadButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={handlePickDocument}
            >
              <Upload size={16} color={colors.primary} />
              <ThemedText style={[styles.uploadButtonText, { color: colors.primary }]}>Attach document (PDF, JPG, PNG, DOCX)</ThemedText>
            </TouchableOpacity>
          </View>

          {/* ── Save ────────────────────────────────────────────────── */}
          {!canEdit ? (
            <View style={[styles.readOnlyCard, { backgroundColor: colors.surfaceVariant, borderColor: colors.border }]}>
              <UserRoundX size={18} color={colors.secondaryText} />
              <ThemedText variant="secondary">This shared calendar is view-only.</ThemedText>
            </View>
          ) : (
            <TouchableOpacity
              testID="absence-save-button"
              style={[styles.saveButton, { backgroundColor: isSaving ? colors.secondaryText : colors.primary }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <View style={styles.savingRow}>
                  <ActivityIndicator size="small" color="white" />
                  <ThemedText style={styles.saveButtonText}>
                    Saving...
                  </ThemedText>
                </View>
              ) : (
                <ThemedText style={styles.saveButtonText}>
                  {existingAbsence ? 'Update absence' : `Save ${datesToSave.length > 1 ? datesToSave.length + ' ' : ''}absence`}
                </ThemedText>
              )}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ── Staff Picker Modal ──────────────────────────────────────── */}
      <Modal visible={showStaffPicker} transparent animationType="slide" onRequestClose={() => setShowStaffPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText style={styles.modalTitle}>Select employee</ThemedText>
              <TouchableOpacity onPress={() => setShowStaffPicker(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Search bar in staff picker */}
            <View style={[styles.staffSearchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Search size={16} color={colors.secondaryText} />
              <TextInput
                testID="staff-search-input"
                style={[styles.staffSearchInput, { color: colors.text }]}
                placeholder="Search by name, ID, or department..."
                placeholderTextColor={colors.secondaryText}
                value={staffSearchQuery}
                onChangeText={setStaffSearchQuery}
                autoFocus
              />
            </View>

            {/* Show add staff form inline */}
            {showAddStaff ? (
              <View style={styles.inlineAddForm}>
                <ThemedText style={styles.inlineAddTitle}>Add new staff member</ThemedText>
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  placeholder="Staff name *"
                  placeholderTextColor={colors.secondaryText}
                  value={newStaffName}
                  onChangeText={setNewStaffName}
                  autoFocus
                />
                <TextInput
                  style={[styles.textInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text, marginTop: 8 }]}
                  placeholder="Department (optional)"
                  placeholderTextColor={colors.secondaryText}
                  value={newStaffDepartment}
                  onChangeText={setNewStaffDepartment}
                />
                <View style={styles.inlineAddActions}>
                  <TouchableOpacity
                    style={[styles.inlineCancelBtn, { borderColor: colors.border }]}
                    onPress={() => setShowAddStaff(false)}
                  >
                    <ThemedText>Cancel</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="inline-add-staff-save"
                    style={[styles.inlineSaveBtn, { backgroundColor: colors.primary }]}
                    onPress={handleAddStaffInline}
                  >
                    <ThemedText style={styles.inlineSaveBtnText}>Add & Select</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <FlatList
                data={filteredStaff}
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
                    <View style={[styles.staffRowDot, { backgroundColor: item.id === selectedStaffId ? colors.primary : 'transparent' }]} />
                    <View style={styles.staffRowInfo}>
                      <ThemedText style={styles.staffName}>{item.name}</ThemedText>
                      <ThemedText variant="secondary" style={styles.staffDept}>
                        {item.department ?? 'Team member'}
                        {item.employeeId ? ` · ${item.employeeId}` : ''}
                      </ThemedText>
                    </View>
                    {item.id === selectedStaffId && (
                      <View style={[styles.selectedCheck, { backgroundColor: colors.primary }]}>
                        <ThemedText style={styles.selectedCheckText}>✓</ThemedText>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyStaffList}>
                    <ThemedText variant="secondary">No staff members found</ThemedText>
                  </View>
                }
              />
            )}

            {/* Add new staff button at bottom */}
            {!showAddStaff && (
              <TouchableOpacity
                testID="staff-picker-add-new"
                style={[styles.addNewStaffBtn, { borderTopColor: colors.border, backgroundColor: colors.surface }]}
                onPress={() => setShowAddStaff(true)}
              >
                <Plus size={18} color={colors.primary} />
                <ThemedText style={[styles.addNewStaffText, { color: colors.primary }]}>Add new staff member</ThemedText>
              </TouchableOpacity>
            )}
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
  selectedDatesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedDatesLabel: {
    flex: 1,
    lineHeight: 18,
    fontSize: 13,
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
  docList: {
    gap: 8,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  docInfo: {
    flex: 1,
    gap: 2,
  },
  docName: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  docSize: {
    fontSize: 11,
  },
  docRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  uploadButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
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
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  /* ── Modal ──────────────────────────────────────────────────────── */
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  modalCard: {
    maxHeight: '85%',
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
  staffSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  staffSearchInput: {
    flex: 1,
    fontSize: 15,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  staffRowDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  staffRowInfo: {
    flex: 1,
    gap: 2,
  },
  staffName: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  staffDept: {
    fontSize: 12,
  },
  selectedCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCheckText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  emptyStaffList: {
    paddingHorizontal: 18,
    paddingVertical: 24,
    alignItems: 'center',
  },
  addNewStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingVertical: 16,
  },
  addNewStaffText: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  inlineAddForm: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    gap: 10,
  },
  inlineAddTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 4,
  },
  inlineAddActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  inlineCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  inlineSaveBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  inlineSaveBtnText: {
    color: 'white',
    fontWeight: '700' as const,
  },
});
