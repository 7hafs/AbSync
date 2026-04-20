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
import { CalendarDays, ChevronLeft, ChevronRight, Flag, Plus, TriangleAlert, Users } from 'lucide-react-native';
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

  const { user } = useAuthStore();
  const canEdit = user?.accessLevel !== 'viewer';
  const { absences, maxAbsencesPerDay } = useAbsenceStore();

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

  return (
    <ThemedView style={styles.container} useGradient>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingHorizontal: isDesktop ? 32 : 16 }]}> 
        <View>
          <ThemedText style={[styles.title, { fontSize: isDesktop ? 30 : isTablet ? 26 : 22 }]}>Team calendar</ThemedText>
          <ThemedText variant="secondary">Track requests, public holidays, and daily team cover.</ThemedText>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            testID="calendar-prev-month"
            style={[styles.headerIconButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => setCurrentDate(new Date(year, month - 1, 1))}
          >
            <ChevronLeft size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={[styles.monthBadge, { backgroundColor: colors.surfaceVariant }]}>
            <ThemedText style={styles.monthBadgeText}>
              {currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </ThemedText>
          </View>
          <TouchableOpacity
            testID="calendar-next-month"
            style={[styles.headerIconButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={() => setCurrentDate(new Date(year, month + 1, 1))}
          >
            <ChevronRight size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}>
        <View style={[styles.overviewRow, isDesktop && styles.overviewRowDesktop]}>
          <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Users size={18} color={colors.primary} />
            <ThemedText style={styles.overviewValue}>{absences.filter((absence) => absence.date === todayIso && absence.type !== 'Public Holiday' && absence.status !== 'Rejected').length}</ThemedText>
            <ThemedText variant="secondary">Away today</ThemedText>
          </View>
          <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TriangleAlert size={18} color={absenceColors.appointment} />
            <ThemedText style={styles.overviewValue}>{maxAbsencesPerDay}</ThemedText>
            <ThemedText variant="secondary">Daily limit</ThemedText>
          </View>
          <View style={[styles.overviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <CalendarDays size={18} color={absenceColors.publicHoliday} />
            <ThemedText style={styles.overviewValue}>{absences.filter((absence) => absence.type === 'Public Holiday' && new Date(absence.date).getMonth() === month).length}</ThemedText>
            <ThemedText variant="secondary">Public holidays</ThemedText>
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
              const workingAbsences = dayAbsences.filter((absence) => absence.type !== 'Public Holiday' && absence.status !== 'Rejected');
              const amAbsences = dayAbsences.filter((absence) => absence.duration === 'AM' || absence.duration === 'Full');
              const pmAbsences = dayAbsences.filter((absence) => absence.duration === 'PM' || absence.duration === 'Full');
              const isToday = date === todayIso;
              const clash = workingAbsences.length >= maxAbsencesPerDay;
              const overLimit = workingAbsences.length > maxAbsencesPerDay;
              const publicHoliday = dayAbsences.find((absence) => absence.type === 'Public Holiday');
              const hasAbsences = workingAbsences.length > 0;
              const flagColor = overLimit
                ? absenceColors.rejected
                : clash
                ? absenceColors.appointment
                : absenceColors.approved;
              const cellMinHeight = isDesktop ? 150 : isTablet ? 124 : 96;
              const maxEvents = isDesktop ? 3 : isTablet ? 2 : 2;
              const uniqueTypes = Array.from(new Set(dayAbsences.map((a) => a.type)));

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
                    {hasAbsences ? (
                      <Flag size={12} color={flagColor} fill={flagColor} />
                    ) : null}
                  </View>

                  {publicHoliday ? (
                    <View style={styles.holidayBlock}>
                      <ThemedText style={[styles.holidayLabel, { color: absenceColors.publicHoliday }]} numberOfLines={2}>
                        {publicHoliday.name}
                      </ThemedText>
                    </View>
                  ) : (
                    <View style={styles.eventsWrap}>
                      {dayAbsences.slice(0, maxEvents).map((absence) => (
                        <View
                          key={absence.id}
                          style={[styles.eventBar, { backgroundColor: getTypeColor(absence.type) }]}
                        >
                          <ThemedText numberOfLines={1} style={styles.eventText}>
                            {absence.duration !== 'Full' ? `${absence.duration} ` : ''}{absence.name}
                          </ThemedText>
                        </View>
                      ))}
                      {dayAbsences.length > maxEvents ? (
                        <ThemedText variant="secondary" style={styles.moreText}>
                          +{dayAbsences.length - maxEvents} more
                        </ThemedText>
                      ) : dayAbsences.length === 0 ? null : null}
                      {dayAbsences.length === 0 && uniqueTypes.length === 0 ? null : null}
                    </View>
                  )}
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
    paddingTop: 14,
    paddingBottom: 16,
    gap: 14,
  },
  title: {
    fontWeight: '800' as const,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthBadge: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  monthBadgeText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  content: {
    padding: 16,
    paddingBottom: 96,
    gap: 16,
  },
  contentDesktop: {
    alignItems: 'center',
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  overviewRowDesktop: {
    width: '100%',
    maxWidth: 1320,
  },
  overviewCard: {
    flex: 1,
    minWidth: 180,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  overviewValue: {
    fontSize: 26,
    fontWeight: '800' as const,
  },
  calendarCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 28,
    padding: 10,
    alignSelf: 'center',
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  weekCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekText: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1,
    textTransform: 'uppercase' as const,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCard: {
    width: `${100 / 7}%`,
    padding: 6,
    gap: 4,
  },
  emptyDay: {
    opacity: 0,
  },
  dayTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  dayNumberWrap: {
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    fontSize: 15,
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
    fontSize: 11,
    fontWeight: '700' as const,
  },
  eventsWrap: {
    gap: 3,
  },
  eventBar: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  eventText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700' as const,
  },
  moreText: {
    fontSize: 10,
    paddingLeft: 4,
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
