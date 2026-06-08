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
import { Calendar, CalendarDays, ChevronLeft, ChevronRight, Clock, Flag, Plus, TrendingUp, Users, UserX, LayoutGrid, Columns } from 'lucide-react-native';
import { useColorScheme } from 'react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import Colors, { absenceColors, dotColors } from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';
import WeeklyAbsenceView from '@/components/calendar/WeeklyAbsenceView';

import { Absence, AbsenceType } from '@/types';
import { toDateString, fromDateString, todayDateString, formatDateUKLong, formatDateUK, addDays } from '@/utils/dateUtils';

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

  return `${absence.type} \u2013 ${absence.name}${absence.duration === 'Full' ? '' : ` (${absence.duration})`}`;
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

type CalendarViewMode = 'month' | 'week';

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

  const canEdit = true;
  const { absences } = useAbsenceStore();
  const { staff } = useStaffStore();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [summaryVisible, setSummaryVisible] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthGrid = useMemo(() => getMonthGrid(currentDate), [currentDate]);

  const getAbsencesForDate = (date: string) => absences.filter((absence) => absence.date === date);
  const todayIso = todayDateString();
  const tomorrowIso = toDateString(addDays(new Date(), 1));

  // Dashboard stats
  const activeStaffCount = staff.filter((s) => s.active).length;
  const absentTodayCount = new Set(
    absences
      .filter((a) => a.date === todayIso && a.type !== 'Public Holiday' && a.status !== 'Rejected')
      .map((a) => a.staffId)
  ).size;
  const absentTomorrowCount = new Set(
    absences
      .filter((a) => a.date === tomorrowIso && a.type !== 'Public Holiday' && a.status !== 'Rejected')
      .map((a) => a.staffId)
  ).size;
  const upcomingWeekCount = (() => {
    const today = new Date();
    const weekEnd = addDays(today, 7);
    const todayStr = toDateString(today);
    const weekEndStr = toDateString(weekEnd);
    return new Set(
      absences
        .filter(
          (a) =>
            a.date >= todayStr &&
            a.date <= weekEndStr &&
            a.type !== 'Public Holiday' &&
            a.status !== 'Rejected'
        )
        .map((a) => a.staffId)
    ).size;
  })();

  // Who's Off Today
  const whosOffToday = useMemo(() => {
    const todayAbsences = absences.filter(
      (a) => a.date === todayIso && a.type !== 'Public Holiday' && a.status !== 'Rejected'
    );
    const seen = new Set<string>();
    const unique: Array<{ name: string; type: AbsenceType }> = [];
    for (const a of todayAbsences) {
      if (!seen.has(a.name)) {
        seen.add(a.name);
        unique.push({ name: a.name, type: a.type });
      }
    }
    return unique;
  }, [absences, todayIso]);

  // Upcoming Absences (next 30 days, excluding today)
  const upcomingAbsences = useMemo(() => {
    const tomorrow = addDays(new Date(), 1);
    const thirtyDaysOut = addDays(new Date(), 30);
    const tomorrowStr = toDateString(tomorrow);
    const thirtyDaysStr = toDateString(thirtyDaysOut);

    return absences
      .filter(
        (a) =>
          a.date >= tomorrowStr &&
          a.date <= thirtyDaysStr &&
          a.type !== 'Public Holiday' &&
          a.status !== 'Rejected'
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [absences]);

  const formatDateShort = (dateString: string): string => {
    return formatDateUK(dateString);
  };

  const getDotColor = (count: number) => {
    if (count === 0) return undefined;
    if (count <= 2) return dotColors.green;
    if (count <= 5) return dotColors.amber;
    return dotColors.red;
  };

  const handleOpenDay = (date: string) => {
    router.push({ pathname: '/calendar/day-absences' as never, params: { date } });
  };

  const handleAdd = (date: string, duration: 'AM' | 'PM') => {
    if (!canEdit) return;
    router.push({ pathname: '/calendar/absence-form' as never, params: { date, session: duration } });
  };
  void handleAdd;

  const handlePrevPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  const handleNextPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    }
  };

  const headerTitle = viewMode === 'month'
    ? currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    : (() => {
        const weekStart = new Date(currentDate);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(weekStart.setDate(diff));
        const sunday = new Date(monday);
        sunday.setDate(sunday.getDate() + 6);
        return `${formatDateUK(toDateString(monday))} – ${formatDateUK(toDateString(sunday))}`;
      })();

  return (
    <ThemedView style={styles.container} useGradient>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingHorizontal: isDesktop ? 32 : 12 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            testID="calendar-prev-month"
            style={[styles.headerIconButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={handlePrevPeriod}
          >
            <ChevronLeft size={18} color={colors.text} />
          </TouchableOpacity>
          <ThemedText style={[styles.title, { fontSize: isDesktop ? 22 : isTablet ? 20 : 17 }]}>
            {headerTitle}
          </ThemedText>
          <TouchableOpacity
            testID="calendar-next-month"
            style={[styles.headerIconButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={handleNextPeriod}
          >
            <ChevronRight size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* View mode switcher */}
        <View style={[styles.viewSwitcher, { backgroundColor: colors.surfaceVariant }]}>
          <TouchableOpacity
            testID="view-mode-month"
            style={[styles.viewSwitcherBtn, viewMode === 'month' && { backgroundColor: colors.primary }]}
            onPress={() => setViewMode('month')}
          >
            <LayoutGrid size={14} color={viewMode === 'month' ? 'white' : colors.secondaryText} />
            <ThemedText style={[styles.viewSwitcherText, viewMode === 'month' && { color: 'white' }]}>Month</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            testID="view-mode-week"
            style={[styles.viewSwitcherBtn, viewMode === 'week' && { backgroundColor: colors.primary }]}
            onPress={() => setViewMode('week')}
          >
            <Columns size={14} color={viewMode === 'week' ? 'white' : colors.secondaryText} />
            <ThemedText style={[styles.viewSwitcherText, viewMode === 'week' && { color: 'white' }]}>Week</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}>
        {/* Dashboard stats */}
        <View style={styles.dashboardRow}>
          <View style={[styles.dashboardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dashboardIcon, { backgroundColor: `${colors.primary}18` }]}>
              <Users size={18} color={colors.primary} />
            </View>
            <ThemedText style={styles.dashboardValue}>{activeStaffCount}</ThemedText>
            <ThemedText variant="secondary" style={styles.dashboardLabel}>Total Employees</ThemedText>
          </View>
          <View style={[styles.dashboardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dashboardIcon, { backgroundColor: `${dotColors.red}18` }]}>
              <Users size={18} color={dotColors.red} />
            </View>
            <ThemedText style={styles.dashboardValue}>{absentTodayCount}</ThemedText>
            <ThemedText variant="secondary" style={styles.dashboardLabel}>Absent Today</ThemedText>
          </View>
          <View style={[styles.dashboardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dashboardIcon, { backgroundColor: `${dotColors.amber}18` }]}>
              <Users size={18} color={dotColors.amber} />
            </View>
            <ThemedText style={styles.dashboardValue}>{absentTomorrowCount}</ThemedText>
            <ThemedText variant="secondary" style={styles.dashboardLabel}>Absent Tomorrow</ThemedText>
          </View>
          <View style={[styles.dashboardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dashboardIcon, { backgroundColor: `${dotColors.green}18` }]}>
              <TrendingUp size={18} color={dotColors.green} />
            </View>
            <ThemedText style={styles.dashboardValue}>{upcomingWeekCount}</ThemedText>
            <ThemedText variant="secondary" style={styles.dashboardLabel}>This Week</ThemedText>
          </View>
        </View>

        {/* Who's Off Today Widget */}
        {whosOffToday.length > 0 ? (
          <View style={[styles.whosOffCard, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1320 : 980 }]}>
            <View style={styles.whosOffHeader}>
              <View style={[styles.whosOffIconWrap, { backgroundColor: `${dotColors.red}18` }]}>
                <UserX size={18} color={dotColors.red} />
              </View>
              <View style={styles.whosOffTitleWrap}>
                <ThemedText style={styles.whosOffTitle}>
                  Off Today ({whosOffToday.length})
                </ThemedText>
              </View>
            </View>
            <View style={styles.whosOffNames}>
              {whosOffToday.map((person) => (
                <View key={person.name} style={styles.whosOffNameRow}>
                  <View style={[styles.whosOffDot, { backgroundColor: getTypeColor(person.type) }]} />
                  <ThemedText style={styles.whosOffNameText}>{person.name}</ThemedText>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <View style={[styles.whosOffCard, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1320 : 980 }]}>
            <View style={styles.whosOffHeader}>
              <View style={[styles.whosOffIconWrap, { backgroundColor: `${dotColors.green}18` }]}>
                <UserX size={18} color={dotColors.green} />
              </View>
              <View style={styles.whosOffTitleWrap}>
                <ThemedText style={styles.whosOffTitle}>Off Today (0)</ThemedText>
              </View>
            </View>
            <ThemedText variant="secondary" style={styles.whosOffEmpty}>
              Everyone's in today
            </ThemedText>
          </View>
        )}

        {/* Calendar — Month or Week View */}
        {viewMode === 'month' ? (
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
                const dotColor = getDotColor(staffOffCount);
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
                            key={`session-${absence.id}`}
                            style={[styles.eventBar, { backgroundColor: `${typeColor}33`, borderLeftColor: typeColor }]}
                          >
                            <ThemedText numberOfLines={1} style={[styles.eventText, { color: typeColor }]}>
                              {absence.name}
                            </ThemedText>
                          </View>
                        );
                      })}
                      {list.length > maxEventsPerSession ? (
                        <ThemedText key={`more-${list.length}`} variant="secondary" style={styles.moreText}>
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
                      <View style={styles.dayTopLeft}>
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
                        {dotColor && !publicHoliday ? (
                          <View style={[styles.dotIndicator, { backgroundColor: dotColor }]} />
                        ) : null}
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
        ) : (
          <View style={[styles.weekViewCard, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1320 : 980 }]}>
            <WeeklyAbsenceView
              currentDate={currentDate}
              absences={absences}
              onSelectDate={handleOpenDay}
              onAddAbsence={handleAdd}
            />
          </View>
        )}

        {/* Upcoming Absences */}
        <View style={[styles.upcomingCard, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1320 : 980 }]}>
          <View style={styles.upcomingHeader}>
            <View style={[styles.upcomingIconWrap, { backgroundColor: `${colors.primary}18` }]}>
              <Calendar size={18} color={colors.primary} />
            </View>
            <ThemedText style={styles.upcomingTitle}>Upcoming Absences</ThemedText>
          </View>
          {upcomingAbsences.length > 0 ? (
            <View style={styles.upcomingList}>
              {upcomingAbsences.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.upcomingRow}
                  activeOpacity={0.6}
                  onPress={() => handleOpenDay(a.date)}
                >
                  <View style={[styles.upcomingTypeDot, { backgroundColor: getTypeColor(a.type) }]} />
                  <ThemedText style={styles.upcomingName} numberOfLines={1}>
                    {a.name}
                  </ThemedText>
                  <View style={styles.upcomingDateBadge}>
                    <Clock size={10} color={colors.secondaryText} />
                    <ThemedText variant="secondary" style={styles.upcomingDateText}>
                      {formatDateShort(a.date)}
                    </ThemedText>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.upcomingEmpty}>
              <ThemedText variant="secondary" style={styles.upcomingEmptyText}>
                No upcoming absences in the next 30 days.
              </ThemedText>
            </View>
          )}
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
            <ThemedText variant="secondary">{selectedDate ? formatDateUKLong(selectedDate) : ''}</ThemedText>
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
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
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
  viewSwitcher: {
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  viewSwitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 17,
  },
  viewSwitcherText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  content: {
    padding: 10,
    paddingBottom: 96,
    gap: 10,
  },
  contentDesktop: {
    alignItems: 'center',
  },
  dashboardRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    maxWidth: 1320,
  },
  dashboardCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
  },
  dashboardIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardValue: {
    fontSize: 24,
    fontWeight: '800' as const,
  },
  dashboardLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  dotIndicator: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  dayTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  calendarCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 4,
    alignSelf: 'center',
    flex: 1,
  },
  weekViewCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
    alignSelf: 'center',
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
  whosOffCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    alignSelf: 'center',
  },
  whosOffHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  whosOffIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whosOffTitleWrap: {
    flex: 1,
  },
  whosOffTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
  },
  whosOffNames: {
    gap: 8,
  },
  whosOffNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  whosOffDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  whosOffNameText: {
    fontSize: 14,
    fontWeight: '600' as const,
    flex: 1,
  },
  whosOffEmpty: {
    fontSize: 13,
    fontStyle: 'italic' as const,
  },
  upcomingCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    alignSelf: 'center',
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upcomingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    flex: 1,
  },
  upcomingList: {
    gap: 4,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  upcomingTypeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  upcomingName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  upcomingDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  upcomingDateText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  upcomingEmpty: {
    paddingVertical: 8,
  },
  upcomingEmptyText: {
    fontSize: 13,
    fontStyle: 'italic' as const,
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
