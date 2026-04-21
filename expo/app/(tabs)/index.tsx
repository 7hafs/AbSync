import React, { useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronLeft, ChevronRight, Flag, Plus, Users } from 'lucide-react-native';
import { useColorScheme } from 'react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import Colors, { absenceColors } from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useAbsenceStore from '@/store/useAbsenceStore';
import useAuthStore from '@/store/useAuthStore';
import { Absence, AbsenceType } from '@/types';

function getTypeColor(type: AbsenceType) {
  switch (type) {
    case 'Holiday':
      return absenceColors.holiday;
    case 'Sick Leave':
      return absenceColors.sickLeave;
    case 'Appointment':
      return absenceColors.appointment;
    case 'Training':
      return absenceColors.training;
    case 'Public Holiday':
      return absenceColors.publicHoliday;
    default:
      return absenceColors.pending;
  }
}

function getStatusColor(status: Absence['status']) {
  switch (status) {
    case 'Approved':
      return absenceColors.approved;
    case 'Rejected':
      return absenceColors.rejected;
    default:
      return absenceColors.pending;
  }
}

function formatEventTitle(absence: Absence) {
  if (absence.type === 'Public Holiday') {
    return absence.name;
  }

  return `${absence.type} – ${absence.name}${absence.duration === 'Full' ? '' : ` (${absence.duration})`}`;
}

function getMonthGrid(baseDate: Date): Array<number | null> {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const grid: Array<number | null> = [];

  for (let index = 0; index < firstDay; index += 1) {
    grid.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    grid.push(day);
  }

  return grid;
}

export default function CalendarScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const isDesktop = width >= 1100;
  const isSmallPhone = width < 380;

  const { user } = useAuthStore();
  const canEdit = user?.accessLevel !== 'viewer';
  const { absences } = useAbsenceStore();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState<boolean>(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthGrid = useMemo(() => getMonthGrid(currentDate), [currentDate]);

  const getAbsencesForDate = (date: string) => absences.filter((absence) => absence.date === date);
  const todayIso = new Date().toISOString().split('T')[0];

  const handleOpenDay = (date: string) => {
    router.push({ pathname: '/calendar/day-absences' as never, params: { date } });
  };

  const handleAdd = (date: string, duration: 'AM' | 'PM') => {
    if (!canEdit) {
      return;
    }

    router.push({ pathname: '/calendar/absence-form' as never, params: { date, session: duration } });
  };
  void handleAdd;

  return (
    <ThemedView style={styles.container} useGradient>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingHorizontal: isDesktop ? 32 : 12 }]}>
        <TouchableOpacity
          testID="calendar-prev-month"
          style={[styles.headerIconButton, { backgroundColor: colors.surfaceVariant }]}
          onPress={() => setCurrentDate(new Date(year, month - 1, 1))}
        >
          <ChevronLeft size={18} color={colors.text} />
        </TouchableOpacity>
        <ThemedText style={[styles.title, { fontSize: isDesktop ? 22 : isTablet ? 20 : 17 }]}>
          {currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </ThemedText>
        <TouchableOpacity
          testID="calendar-next-month"
          style={[styles.headerIconButton, { backgroundColor: colors.surfaceVariant }]}
          onPress={() => setCurrentDate(new Date(year, month + 1, 1))}
        >
          <ChevronRight size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}>
        <View style={[styles.summaryTable, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryCell}>
            <Users size={14} color={colors.primary} />
            <ThemedText style={styles.summaryValue}>{absences.filter((absence) => absence.date === todayIso && absence.type !== 'Public Holiday' && absence.status !== 'Rejected').length}</ThemedText>
            <ThemedText variant="secondary" style={styles.summaryLabel}>Away today</ThemedText>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryCell}>
            <Users size={14} color={absenceColors.appointment} />
            <ThemedText style={styles.summaryValue}>{absences.filter((absence) => new Date(absence.date).getMonth() === month && absence.type !== 'Public Holiday' && absence.status !== 'Rejected').length}</ThemedText>
            <ThemedText variant="secondary" style={styles.summaryLabel}>This month</ThemedText>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryCell}>
            <CalendarDays size={14} color={absenceColors.publicHoliday} />
            <ThemedText style={styles.summaryValue}>{absences.filter((absence) => absence.type === 'Public Holiday' && new Date(absence.date).getMonth() === month).length}</ThemedText>
            <ThemedText variant="secondary" style={styles.summaryLabel}>Holidays</ThemedText>
          </View>
        </View>

        <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1320 : 980 }]}> 
          <View style={styles.weekHeader}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <View key={label} style={styles.weekCell}>
                <ThemedText variant="secondary" style={styles.weekText}>{label}</ThemedText>
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {monthGrid.map((day, index) => {
              if (day === null) {
                return <View key={`empty-${index}`} style={[styles.dayCard, styles.emptyDay]} />;
              }

              const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayAbsences = getAbsencesForDate(date);
              const amAbsences = dayAbsences.filter((absence) => absence.type !== 'Public Holiday' && absence.status !== 'Rejected' && (absence.duration === 'AM' || absence.duration === 'Full'));
              const pmAbsences = dayAbsences.filter((absence) => absence.type !== 'Public Holiday' && absence.status !== 'Rejected' && (absence.duration === 'PM' || absence.duration === 'Full'));
              const isToday = date === todayIso;
              const publicHoliday = dayAbsences.find((absence) => absence.type === 'Public Holiday');
              const staffOffCount = new Set(
                dayAbsences
                  .filter((absence) => absence.type !== 'Public Holiday' && absence.status !== 'Rejected')
                  .map((absence) => absence.name)
              ).size;
              const isShortStaffed = staffOffCount >= 2;
              const cellMinHeight = isDesktop ? 150 : isTablet ? 130 : isSmallPhone ? 86 : 100;
              const maxEventsPerSession = isDesktop ? 3 : isTablet ? 2 : 1;

              const renderSessionPills = (list: Absence[]) => {
                if (list.length === 0) {
                  return null;
                }
                return (
                  <View style={styles.sessionPills}>
                    {list.slice(0, maxEventsPerSession).map((absence) => {
                      const typeColor = getTypeColor(absence.type);
                      return (
                        <View
                          key={absence.id}
                          style={[styles.eventBar, { backgroundColor: `${typeColor}33`, borderLeftColor: typeColor }]}
                        >
                          <ThemedText numberOfLines={1} style={[styles.eventText, { color: typeColor }]}>
                            {absence.name}
                          </ThemedText>
                        </View>
                      );
                    })}
                    {list.length > maxEventsPerSession ? (
                      <ThemedText variant="secondary" style={styles.moreText}>
                        +{list.length - maxEventsPerSession}
                      </ThemedText>
                    ) : null}
                  </View>
                );
              };

              return (
                <TouchableOpacity
                  key={date}
                  testID={`calendar-day-${date}`}
                  activeOpacity={0.7}
                  style={[
                    styles.dayCard,
                    {
                      backgroundColor: publicHoliday ? `${absenceColors.publicHoliday}26` : 'transparent',
                      minHeight: cellMinHeight,
                    },
                  ]}
                  onPress={() => handleOpenDay(date)}
                >
                  <View style={styles.dayTopRow}>
                    <View
                      style={[
                        styles.dayNumberWrap,
                        isToday && { backgroundColor: colors.primary },
                      ]}
                    >
                      <ThemedText
                        style={[
                          styles.dayNumber,
                          isToday && styles.dayNumberToday,
                          publicHoliday && !isToday && styles.dayNumberOnHoliday,
                        ]}
                      >
                        {day}
                      </ThemedText>
                    </View>
                    {isShortStaffed ? (
                      <View style={styles.flagBadge} testID={`calendar-flag-${date}`}>
                        <Flag size={9} color="#FFFFFF" fill="#FFFFFF" />
                        <ThemedText style={styles.flagText}>{staffOffCount}</ThemedText>
                      </View>
                    ) : null}
                  </View>

                  {publicHoliday ? (
                    <View style={styles.holidayBlock}>
                      <ThemedText style={[styles.holidayLabel, { color: absenceColors.publicHoliday }]} numberOfLines={1}>
                        {publicHoliday.name}
                      </ThemedText>
                    </View>
                  ) : null}
                  <View style={styles.sessionsWrap}>
                    <View style={[styles.sessionBlock, styles.amBlock, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                      <ThemedText style={[styles.sessionLabel, { color: '#059669' }]}>AM</ThemedText>
                      {renderSessionPills(amAbsences)}
                    </View>
                    <View style={[styles.sessionBlock, styles.pmBlock, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                      <ThemedText style={[styles.sessionLabel, { color: '#4F46E5' }]}>PM</ThemedText>
                      {renderSessionPills(pmAbsences)}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <TouchableOpacity
        testID="calendar-fab"
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/calendar/absence-form' as never)}
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>

      <Modal visible={summaryVisible} transparent animationType="fade" onRequestClose={() => setSummaryVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}> 
            <ThemedText style={styles.modalTitle}>Day summary</ThemedText>
            <ThemedText variant="secondary">{selectedDate ? new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}</ThemedText>
            <ScrollView style={styles.modalScroll}>
              {(selectedDate ? getAbsencesForDate(selectedDate) : []).map((absence) => (
                <View key={absence.id} style={[styles.modalItem, { backgroundColor: colors.surfaceVariant }]}> 
                  <View style={styles.modalItemTop}>
                    <View style={[styles.typeMarker, { backgroundColor: getTypeColor(absence.type) }]} />
                    <ThemedText style={styles.modalItemTitle}>{formatEventTitle(absence)}</ThemedText>
                  </View>
                  <ThemedText variant="secondary">Status: {absence.status}</ThemedText>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              testID="summary-view-day"
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (selectedDate) {
                  setSummaryVisible(false);
                  handleOpenDay(selectedDate);
                }
              }}
            >
              <ThemedText style={styles.modalButtonText}>Open full day</ThemedText>
            </TouchableOpacity>
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
  header: {
    borderBottomWidth: 1,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontWeight: '800' as const,
    textAlign: 'center',
    flex: 1,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 10,
    paddingBottom: 96,
    gap: 10,
  },
  contentDesktop: {
    alignItems: 'center',
  },
  summaryTable: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    width: '100%',
    maxWidth: 1320,
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  summaryLabel: {
    fontSize: 11,
  },
  summaryDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: 4,
  },
  calendarCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 4,
    alignSelf: 'center',
    flex: 1,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  weekCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 4,
  },
  weekText: {
    fontSize: 10,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCard: {
    width: `${100 / 7}%`,
    padding: 2,
    gap: 1,
  },
  emptyDay: {
    opacity: 0,
  },
  dayTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
    gap: 2,
  },
  dayNumberWrap: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  dayNumberToday: {
    color: 'white',
    fontWeight: '800' as const,
  },
  dayNumberOnHoliday: {
    color: absenceColors.publicHoliday,
  },
  holidayBlock: {
    flex: 1,
    paddingTop: 2,
  },
  holidayLabel: {
    fontSize: 8,
    fontWeight: '700' as const,
  },
  eventsWrap: {
    gap: 2,
  },
  sessionsWrap: {
    flex: 1,
    gap: 2,
  },
  sessionBlock: {
    flex: 1,
    borderBottomWidth: 0,
    paddingVertical: 2,
    paddingHorizontal: 3,
    gap: 2,
    borderRadius: 4,
  },
  amBlock: {
  },
  pmBlock: {
  },
  sessionLabel: {
    fontSize: 7,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  sessionPills: {
    gap: 2,
  },
  eventBar: {
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderLeftWidth: 2,
  },
  eventText: {
    fontSize: 8,
    fontWeight: '700' as const,
  },
  moreText: {
    fontSize: 8,
    paddingLeft: 2,
  },
  flagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    backgroundColor: '#DC2626',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 6,
  },
  flagText: {
    fontSize: 8,
    fontWeight: '800' as const,
    color: '#FFFFFF',
  },
  fab: {
    position: 'absolute',
    right: 22,
    bottom: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    gap: 12,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  modalScroll: {
    maxHeight: 320,
  },
  modalItem: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    gap: 4,
  },
  modalItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modalItemTitle: {
    flex: 1,
    fontWeight: '700' as const,
  },
  modalButton: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: '700' as const,
  },
});
