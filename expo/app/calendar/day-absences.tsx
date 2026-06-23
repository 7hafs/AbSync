import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Filter,
  Plus,
  Trash2,
  User,
  ShieldAlert,
} from 'lucide-react-native';
import { useColorScheme } from 'react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import Colors, { absenceColors } from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';
import { useOrganisationRole } from '@/hooks/useOrganisationRole';

import { Absence, AbsenceStatus, AbsenceType } from '@/types';
import { toDateString, todayDateString, formatDateUKLong } from '@/utils/dateUtils';

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

function getStatusColor(status: AbsenceStatus) {
  switch (status) {
    case 'Approved':
      return absenceColors.approved;
    case 'Rejected':
      return absenceColors.rejected;
    default:
      return absenceColors.pending;
  }
}

function getDurationSortValue(duration: Absence['duration']) {
  if (duration === 'AM') {
    return 0;
  }

  if (duration === 'PM') {
    return 1;
  }

  return 2;
}

export default function DayAbsencesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ date?: string }>();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 960;

  const { canApproveAbsences } = useOrganisationRole();
  const { getStaffById } = useStaffStore();
  const {
    absences,
    deleteAbsence,
    updateAbsenceStatus,
  } = useAbsenceStore();

  type FilterMode = 'all' | 'current' | 'upcoming' | 'completed';
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const date = typeof params.date === 'string' ? params.date : todayDateString();

  const dayAbsences = useMemo(() => {
    return absences
      .filter((absence) => absence.date === date)
      .sort((left, right) => getDurationSortValue(left.duration) - getDurationSortValue(right.duration));
  }, [absences, date]);

  const amAbsences = dayAbsences.filter((absence) => absence.type !== 'Public Holiday' && absence.status !== 'Rejected' && (absence.duration === 'AM' || absence.duration === 'Full'));
  const pmAbsences = dayAbsences.filter((absence) => absence.type !== 'Public Holiday' && absence.status !== 'Rejected' && (absence.duration === 'PM' || absence.duration === 'Full'));
  const reviewAbsences = dayAbsences.filter((absence) => absence.type === 'Public Holiday' || absence.status !== 'Approved');

  const formattedDate = formatDateUKLong(date);

  const goToDate = (offset: number) => {
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + offset);
    router.replace({
      pathname: '/calendar/day-absences' as never,
      params: { date: toDateString(nextDate) },
    });
  };

  const handleDelete = (absence: Absence) => {
    if (!canApproveAbsences) {
      Alert.alert('Permission required', 'Only owners and managers can delete absences.');
      return;
    }

    if (absence.locked || absence.type === 'Public Holiday') {
      Alert.alert('Locked event', 'Public holidays cannot be deleted.');
      return;
    }

    const confirmDelete = () => {
      console.log('[DayAbsencesScreen] Deleting absence', absence.id);
      deleteAbsence(absence.id);
    };

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm(`Remove ${absence.name}'s absence?`)
        : true;
      if (confirmed) {
        confirmDelete();
      }
      return;
    }

    Alert.alert('Delete absence', `Remove ${absence.name}'s absence?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: confirmDelete,
      },
    ]);
  };

  const handleStatusUpdate = (absence: Absence, status: AbsenceStatus) => {
    if (!canApproveAbsences) {
      Alert.alert('Permission required', 'Only owners and managers can approve or reject requests.');
      return;
    }

    if (absence.locked || absence.type === 'Public Holiday') {
      return;
    }

    updateAbsenceStatus(absence.id, status);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Day view' }} />

      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            testID="day-prev-button"
            style={[styles.navButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => goToDate(-1)}
          >
            <ChevronLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <ThemedText style={styles.headerTitle}>{formattedDate}</ThemedText>
            <ThemedText variant="secondary">{dayAbsences.length} entries</ThemedText>
          </View>
          <TouchableOpacity
            testID="day-next-button"
            style={[styles.navButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => goToDate(1)}
          >
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.metricRow}>
          <View style={[styles.metricCard, { backgroundColor: colors.surfaceVariant }]}>
            <ThemedText style={styles.metricValue}>{amAbsences.length}</ThemedText>
            <ThemedText variant="secondary">AM absent</ThemedText>
          </View>
          <View style={[styles.metricCard, { backgroundColor: colors.surfaceVariant }]}>
            <ThemedText style={styles.metricValue}>{pmAbsences.length}</ThemedText>
            <ThemedText variant="secondary">PM absent</ThemedText>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, isLargeScreen && styles.contentLarge]}>
        <View style={styles.filterRow}>
          {(['all', 'current', 'upcoming', 'completed'] as FilterMode[]).map((mode) => {
            const active = mode === filterMode;
            const labels: Record<FilterMode, string> = {
              all: 'All',
              current: 'Current',
              upcoming: 'Upcoming',
              completed: 'Completed',
            };
            return (
              <TouchableOpacity
                key={mode}
                testID={`filter-${mode}`}
                style={[
                  styles.filterChip,
                  { borderColor: colors.border },
                  active && { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
                onPress={() => setFilterMode(mode)}
              >
                {mode === 'all' ? (
                  <Filter size={12} color={active ? 'white' : colors.secondaryText} />
                ) : null}
                <ThemedText style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {labels[mode]}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.listWrap}>
          {dayAbsences.length > 0 ? (
            <View style={styles.sessionSections}>
              <View style={[styles.sessionSection, { backgroundColor: 'rgba(255, 184, 77, 0.10)', borderColor: 'rgba(255, 159, 28, 0.35)' }]}>
                <View style={[styles.sessionHeader, { backgroundColor: 'rgba(255, 159, 28, 0.18)' }]}>
                  <ThemedText style={[styles.sessionHeaderText, { color: '#C26A00' }]}>AM · Morning</ThemedText>
                  <ThemedText variant="secondary">{amAbsences.length}</ThemedText>
                </View>
                {amAbsences.length === 0 ? (
                  <ThemedText variant="secondary" style={styles.sessionEmpty}>No morning absences</ThemedText>
                ) : (
                  <View style={styles.sessionNameList}>
                    {amAbsences.map((absence) => (
                      <View key={`am-${absence.id}`} style={[styles.sessionNamePill, { backgroundColor: `${getTypeColor(absence.type)}22`, borderColor: getTypeColor(absence.type) }]}>
                        <View style={[styles.typeDotSmall, { backgroundColor: getTypeColor(absence.type) }]} />
                        <ThemedText style={styles.sessionName}>{absence.name}</ThemedText>
                        <ThemedText variant="secondary" style={styles.sessionType}>{absence.type}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              <View style={[styles.sessionSection, { backgroundColor: 'rgba(91, 127, 255, 0.10)', borderColor: 'rgba(91, 127, 255, 0.35)' }]}>
                <View style={[styles.sessionHeader, { backgroundColor: 'rgba(91, 127, 255, 0.18)' }]}>
                  <ThemedText style={[styles.sessionHeaderText, { color: '#2E4BCE' }]}>PM · Afternoon</ThemedText>
                  <ThemedText variant="secondary">{pmAbsences.length}</ThemedText>
                </View>
                {pmAbsences.length === 0 ? (
                  <ThemedText variant="secondary" style={styles.sessionEmpty}>No afternoon absences</ThemedText>
                ) : (
                  <View style={styles.sessionNameList}>
                    {pmAbsences.map((absence) => (
                      <View key={`pm-${absence.id}`} style={[styles.sessionNamePill, { backgroundColor: `${getTypeColor(absence.type)}22`, borderColor: getTypeColor(absence.type) }]}>
                        <View style={[styles.typeDotSmall, { backgroundColor: getTypeColor(absence.type) }]} />
                        <ThemedText style={styles.sessionName}>{absence.name}</ThemedText>
                        <ThemedText variant="secondary" style={styles.sessionType}>{absence.type}</ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          ) : null}

          {reviewAbsences.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <CalendarDays size={44} color={colors.secondaryText} />
              <ThemedText style={styles.emptyTitle}>No absences recorded</ThemedText>
              <ThemedText variant="secondary" style={styles.emptyCopy}>
                Add a request for this date to start tracking availability.
              </ThemedText>
              {canApproveAbsences ? (
                <TouchableOpacity
                  testID="day-add-button"
                  style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                  onPress={() => router.push({ pathname: '/calendar/absence-form' as never, params: { date } })}
                >
                  <Plus size={18} color="white" />
                  <ThemedText style={styles.emptyButtonText}>Create absence</ThemedText>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : (
            reviewAbsences.map((absence) => {
              const staffMember = absence.type === 'Public Holiday' || !absence.staffId ? undefined : getStaffById(absence.staffId);
              const departmentLabel = staffMember?.department ?? (absence.type === 'Public Holiday' ? 'UK calendar' : 'Team member');
              const isLocked = Boolean(absence.locked || absence.type === 'Public Holiday');

              return (
                <View
                  key={absence.id}
                  testID={`absence-card-${absence.id}`}
                  style={[styles.absenceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.cardTopRow}>
                    <View style={styles.cardTitleWrap}>
                      <View style={[styles.typeDot, { backgroundColor: getTypeColor(absence.type) }]} />
                      <View>
                        <ThemedText style={styles.cardTitle}>
                          {absence.type} – {absence.name}
                          {absence.duration !== 'Full' ? ` (${absence.duration})` : ''}
                        </ThemedText>
                        <ThemedText variant="secondary">{departmentLabel}</ThemedText>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(absence.status) }]}>
                      <ThemedText style={styles.statusText}>{absence.status}</ThemedText>
                    </View>
                  </View>

                  <View style={styles.metaRow}>
                    <View style={styles.metaItem}>
                      <Clock3 size={14} color={colors.secondaryText} />
                      <ThemedText variant="secondary">{absence.duration}</ThemedText>
                    </View>
                    <View style={styles.metaItem}>
                      <User size={14} color={colors.secondaryText} />
                      <ThemedText variant="secondary">{absence.name}</ThemedText>
                    </View>
                    <View style={styles.metaItem}>
                      <Briefcase size={14} color={colors.secondaryText} />
                      <ThemedText variant="secondary">{absence.cover ? `Covered by ${absence.cover}` : 'No cover set'}</ThemedText>
                    </View>
                  </View>

                  {absence.notes ? (
                    <View style={[styles.notesCard, { backgroundColor: colors.surfaceVariant }]}>
                      <CircleAlert size={14} color={colors.secondaryText} />
                      <ThemedText variant="secondary" style={styles.notesText}>{absence.notes}</ThemedText>
                    </View>
                  ) : null}

                  <View style={styles.actionRow}>
                    {isLocked ? (
                      <ThemedText variant="secondary">Locked public holiday</ThemedText>
                    ) : (
                      <>
                        <View style={styles.approvalRow}>
                          <TouchableOpacity
                            testID={`approve-${absence.id}`}
                            style={[styles.actionButton, { backgroundColor: absenceColors.approved }]}
                            onPress={() => handleStatusUpdate(absence, 'Approved')}
                          >
                            <ThemedText style={styles.actionButtonText}>Approve</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`reject-${absence.id}`}
                            style={[styles.actionButton, { backgroundColor: absenceColors.rejected }]}
                            onPress={() => handleStatusUpdate(absence, 'Rejected')}
                          >
                            <ThemedText style={styles.actionButtonText}>Reject</ThemedText>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.secondaryActions}>
                          <TouchableOpacity
                            testID={`edit-${absence.id}`}
                            style={[styles.secondaryButton, { borderColor: colors.border }]}
                            onPress={() => router.push({ pathname: '/calendar/absence-form' as never, params: { id: absence.id } })}
                          >
                            <ThemedText>Edit</ThemedText>
                          </TouchableOpacity>
                          <TouchableOpacity
                            testID={`delete-${absence.id}`}
                            style={[styles.iconButton, { borderColor: colors.border }]}
                            onPress={() => handleDelete(absence)}
                          >
                            <Trash2 size={16} color={absenceColors.rejected} />
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                </View>
              );
            })
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
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  sessionSections: {
    gap: 12,
    marginBottom: 4,
  },
  sessionSection: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden' as const,
  },
  sessionHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionHeaderText: {
    fontSize: 14,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  sessionEmpty: {
    padding: 14,
  },
  sessionNameList: {
    padding: 12,
    gap: 8,
  },
  sessionNamePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  typeDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionName: {
    fontSize: 14,
    fontWeight: '700' as const,
    flex: 1,
  },
  sessionType: {
    fontSize: 12,
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  contentLarge: {
    alignItems: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  filterChipTextActive: {
    color: 'white',
  },
  listWrap: {
    width: '100%',
    maxWidth: 980,
    gap: 12,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
  },
  emptyCopy: {
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 8,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontWeight: '700' as const,
  },
  absenceCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    gap: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitleWrap: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
  },
  typeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 5,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    lineHeight: 22,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700' as const,
  },
  metaRow: {
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notesCard: {
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  notesText: {
    flex: 1,
    lineHeight: 20,
  },
  actionRow: {
    gap: 12,
  },
  approvalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '700' as const,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  iconButton: {
    borderWidth: 1,
    borderRadius: 14,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
