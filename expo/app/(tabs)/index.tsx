import React, { useMemo, useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Users,
  LayoutGrid,
  Columns,
  ListStart,
} from 'lucide-react-native';
import { useColorScheme } from 'react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import Colors, { absenceColors } from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';
import useCalendarStore from '@/store/useCalendarStore';
import WeeklyAbsenceView from '@/components/calendar/WeeklyAbsenceView';
import DayView from '@/components/calendar/DayView';
import { Absence, AbsenceType } from '@/types';
import {
  toDateString,
  todayDateString,
  formatDateUK,
  formatWeekRange,
  getISOWeekNumber,
  getMondayOfWeek,
  addDays,
} from '@/utils/dateUtils';

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

type CalendarViewMode = 'month' | 'week' | 'day';

export default function CalendarScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;
  const isTablet = width >= 768;

  const { absences } = useAbsenceStore();
  const { staff } = useStaffStore();
  const { calendarView, setCalendarView } = useCalendarStore();

  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>(calendarView || 'week');

  const handleViewChange = useCallback(
    (mode: CalendarViewMode) => {
      setViewMode(mode);
      setCalendarView(mode);
    },
    [setCalendarView],
  );

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthGrid = useMemo(() => getMonthGrid(currentDate), [currentDate]);
  const todayIso = todayDateString();
  const tomorrowIso = toDateString(addDays(new Date(), 1));
  const mondayOfWeek = getMondayOfWeek(currentDate);

  const getAbsencesForDate = (date: string) =>
    absences.filter((absence) => absence.date === date);

  // Week summary stats
  const weekStats = useMemo(() => {
    let amCount = 0;
    let pmCount = 0;
    let fullCount = 0;
    const seenStaff = new Set<string>();

    for (let i = 0; i < 7; i++) {
      const d = new Date(mondayOfWeek);
      d.setDate(d.getDate() + i);
      const ds = toDateString(d);
      const dayAbs = absences.filter(
        (a) => a.date === ds && a.type !== 'Public Holiday' && a.status !== 'Rejected',
      );
      for (const a of dayAbs) {
        seenStaff.add(a.staffId);
        if (a.duration === 'AM') amCount++;
        else if (a.duration === 'PM') pmCount++;
        else if (a.duration === 'Full') fullCount++;
      }
    }

    return { amCount, pmCount, fullCount, totalCount: seenStaff.size };
  }, [absences, mondayOfWeek]);

  // Dashboard stats
  const activeStaffCount = staff.filter((s) => s.active).length;
  const absentTodayCount = new Set(
    absences
      .filter((a) => a.date === todayIso && a.type !== 'Public Holiday' && a.status !== 'Rejected')
      .map((a) => a.staffId),
  ).size;
  const absentTomorrowCount = new Set(
    absences
      .filter((a) => a.date === tomorrowIso && a.type !== 'Public Holiday' && a.status !== 'Rejected')
      .map((a) => a.staffId),
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
            a.status !== 'Rejected',
        )
        .map((a) => a.staffId),
    ).size;
  })();

  const handleOpenDay = (date: string) => {
    router.push({ pathname: '/calendar/day-absences' as never, params: { date } });
  };

  const handleAdd = (date: string, duration: 'AM' | 'PM') => {
    router.push({
      pathname: '/calendar/absence-form' as never,
      params: { date, session: duration },
    });
  };

  const handlePrevPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'week') {
      const newDate = new Date(mondayOfWeek);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 1);
      setCurrentDate(newDate);
    }
  };

  const handleNextPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'week') {
      const newDate = new Date(mondayOfWeek);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    } else {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 1);
      setCurrentDate(newDate);
    }
  };

  const headerTitle = (() => {
    if (viewMode === 'month') {
      return currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    }
    if (viewMode === 'week') {
      return formatWeekRange(mondayOfWeek);
    }
    return currentDate.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  })();

  const weekNumber = viewMode === 'week' ? getISOWeekNumber(currentDate) : null;

  const viewIcons: Record<CalendarViewMode, { icon: React.ReactNode; label: string }> = {
    month: { icon: <LayoutGrid size={13} />, label: 'Month' },
    week: { icon: <Columns size={13} />, label: 'Week' },
    day: { icon: <ListStart size={13} />, label: 'Day' },
  };

  const VIEW_OPTIONS: CalendarViewMode[] = ['month', 'week', 'day'];

  return (
    <ThemedView style={styles.container} useGradient>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.card, borderBottomColor: colors.border, paddingHorizontal: isDesktop ? 32 : 12 },
        ]}
      >
        <View style={styles.headerLeft}>
          <TouchableOpacity
            testID="calendar-prev"
            style={[styles.headerIconButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={handlePrevPeriod}
          >
            <ChevronLeft size={18} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <ThemedText style={[styles.title, { fontSize: isDesktop ? 22 : isTablet ? 20 : 17 }]}>
              {headerTitle}
            </ThemedText>
            {weekNumber && (
              <ThemedText variant="secondary" style={styles.weekNumber}>
                Week {weekNumber}
              </ThemedText>
            )}
          </View>
          <TouchableOpacity
            testID="calendar-next"
            style={[styles.headerIconButton, { backgroundColor: colors.surfaceVariant }]}
            onPress={handleNextPeriod}
          >
            <ChevronRight size={18} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Segmented control */}
        <View style={[styles.viewSwitcher, { backgroundColor: colors.surfaceVariant }]}>
          {VIEW_OPTIONS.map((mode) => {
            const isActive = mode === viewMode;
            return (
              <TouchableOpacity
                key={mode}
                testID={`view-mode-${mode}`}
                style={[styles.viewSwitcherBtn, isActive && { backgroundColor: colors.primary }]}
                onPress={() => handleViewChange(mode)}
              >
                {React.cloneElement(viewIcons[mode].icon as React.ReactElement, {
                  color: isActive ? 'white' : colors.secondaryText,
                })}
                <ThemedText
                  style={[styles.viewSwitcherText, isActive && { color: 'white' }]}
                >
                  {viewIcons[mode].label}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
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
            <View style={[styles.dashboardIcon, { backgroundColor: '#FEE2E2' }]}>
              <Users size={18} color="#DC2626" />
            </View>
            <ThemedText style={styles.dashboardValue}>{absentTodayCount}</ThemedText>
            <ThemedText variant="secondary" style={styles.dashboardLabel}>Absent Today</ThemedText>
          </View>
          <View style={[styles.dashboardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dashboardIcon, { backgroundColor: '#FEF3C7' }]}>
              <Users size={18} color="#D97706" />
            </View>
            <ThemedText style={styles.dashboardValue}>{absentTomorrowCount}</ThemedText>
            <ThemedText variant="secondary" style={styles.dashboardLabel}>Absent Tomorrow</ThemedText>
          </View>
          <View style={[styles.dashboardCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.dashboardIcon, { backgroundColor: '#D1FAE5' }]}>
              <CalendarDays size={18} color="#059669" />
            </View>
            <ThemedText style={styles.dashboardValue}>{upcomingWeekCount}</ThemedText>
            <ThemedText variant="secondary" style={styles.dashboardLabel}>This Week</ThemedText>
          </View>
        </View>

        {/* Week summary cards (only in week view) */}
        {viewMode === 'week' && (
          <View style={styles.weekSummaryRow}>
            <View style={[styles.weekSummaryCard, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
              <ThemedText style={[styles.weekSummaryVal, { color: '#16A34A' }]}>{weekStats.amCount}</ThemedText>
              <ThemedText variant="secondary" style={styles.weekSummaryLabel}>AM Absences</ThemedText>
            </View>
            <View style={[styles.weekSummaryCard, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
              <ThemedText style={[styles.weekSummaryVal, { color: '#2563EB' }]}>{weekStats.pmCount}</ThemedText>
              <ThemedText variant="secondary" style={styles.weekSummaryLabel}>PM Absences</ThemedText>
            </View>
            <View style={[styles.weekSummaryCard, { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' }]}>
              <ThemedText style={[styles.weekSummaryVal, { color: '#EA580C' }]}>{weekStats.fullCount}</ThemedText>
              <ThemedText variant="secondary" style={styles.weekSummaryLabel}>Full Day</ThemedText>
            </View>
            <View style={[styles.weekSummaryCard, { backgroundColor: '#F5F3FF', borderColor: '#EDE9FE' }]}>
              <ThemedText style={[styles.weekSummaryVal, { color: '#6D28D9' }]}>{weekStats.totalCount}</ThemedText>
              <ThemedText variant="secondary" style={styles.weekSummaryLabel}>Total Staff</ThemedText>
            </View>
          </View>
        )}

        {/* Calendar View */}
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
                const amAbsences = dayAbsences.filter(
                  (a) => a.type !== 'Public Holiday' && a.status !== 'Rejected' && (a.duration === 'AM' || a.duration === 'Full'),
                );
                const pmAbsences = dayAbsences.filter(
                  (a) => a.type !== 'Public Holiday' && a.status !== 'Rejected' && (a.duration === 'PM' || a.duration === 'Full'),
                );
                const isToday = date === todayIso;
                const publicHoliday = dayAbsences.find((a) => a.type === 'Public Holiday');
                const staffOffCount = new Set(
                  dayAbsences.filter((a) => a.type !== 'Public Holiday' && a.status !== 'Rejected').map((a) => a.name),
                ).size;
                const cellMinHeight = isDesktop ? 150 : isTablet ? 130 : 86;
                const maxEventsPerSession = isDesktop ? 3 : isTablet ? 2 : 1;

                return (
                  <TouchableOpacity
                    key={date}
                    testID={`calendar-day-${date}`}
                    activeOpacity={0.7}
                    style={[
                      styles.dayCard,
                      { backgroundColor: publicHoliday ? `${absenceColors.publicHoliday}26` : 'transparent', minHeight: cellMinHeight },
                    ]}
                    onPress={() => handleOpenDay(date)}
                  >
                    <View style={styles.dayTopRow}>
                      <View
                        style={[styles.dayNumberWrap, isToday && { backgroundColor: colors.primary }]}
                      >
                        <ThemedText style={[styles.dayNumber, isToday && styles.dayNumberToday]}>
                          {day}
                        </ThemedText>
                      </View>
                    </View>
                    {publicHoliday ? (
                      <ThemedText style={[styles.holidayLabel, { color: absenceColors.publicHoliday }]} numberOfLines={1}>
                        {publicHoliday.name}
                      </ThemedText>
                    ) : null}
                    <View style={styles.sessionsWrap}>
                      <View style={[styles.sessionBlock, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                        <ThemedText style={[styles.sessionLabel, { color: '#059669' }]}>AM</ThemedText>
                        {amAbsences.slice(0, maxEventsPerSession).map((a) => (
                          <View key={a.id} style={[styles.eventBar, { backgroundColor: `${getTypeColor(a.type)}33`, borderLeftColor: getTypeColor(a.type) }]}>
                            <ThemedText numberOfLines={1} style={[styles.eventText, { color: getTypeColor(a.type) }]}>{a.name}</ThemedText>
                          </View>
                        ))}
                        {amAbsences.length > maxEventsPerSession && (
                          <ThemedText variant="secondary" style={styles.moreText}>+{amAbsences.length - maxEventsPerSession}</ThemedText>
                        )}
                      </View>
                      <View style={[styles.sessionBlock, { backgroundColor: 'rgba(99, 102, 241, 0.12)' }]}>
                        <ThemedText style={[styles.sessionLabel, { color: '#4F46E5' }]}>PM</ThemedText>
                        {pmAbsences.slice(0, maxEventsPerSession).map((a) => (
                          <View key={a.id} style={[styles.eventBar, { backgroundColor: `${getTypeColor(a.type)}33`, borderLeftColor: getTypeColor(a.type) }]}>
                            <ThemedText numberOfLines={1} style={[styles.eventText, { color: getTypeColor(a.type) }]}>{a.name}</ThemedText>
                          </View>
                        ))}
                        {pmAbsences.length > maxEventsPerSession && (
                          <ThemedText variant="secondary" style={styles.moreText}>+{pmAbsences.length - maxEventsPerSession}</ThemedText>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : viewMode === 'week' ? (
          <View style={[styles.viewCard, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1320 : 980 }]}>
            <WeeklyAbsenceView
              currentDate={currentDate}
              absences={absences}
              onSelectDate={handleOpenDay}
              onAddAbsence={handleAdd}
            />
          </View>
        ) : (
          <View style={[styles.viewCard, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1320 : 980 }]}>
            <DayView
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
          {(() => {
            const tomorrow = addDays(new Date(), 1);
            const thirtyDaysOut = addDays(new Date(), 30);
            const upcoming = absences
              .filter(
                (a) =>
                  a.date >= toDateString(tomorrow) &&
                  a.date <= toDateString(thirtyDaysOut) &&
                  a.type !== 'Public Holiday' &&
                  a.status !== 'Rejected',
              )
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 8);

            if (upcoming.length === 0) {
              return (
                <View style={styles.upcomingEmpty}>
                  <ThemedText variant="secondary" style={styles.upcomingEmptyText}>
                    No upcoming absences in the next 30 days.
                  </ThemedText>
                </View>
              );
            }
            return (
              <View style={styles.upcomingList}>
                {upcoming.map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.upcomingRow}
                    activeOpacity={0.6}
                    onPress={() => handleOpenDay(a.date)}
                  >
                    <View style={[styles.upcomingTypeDot, { backgroundColor: getTypeColor(a.type) }]} />
                    <ThemedText style={styles.upcomingName} numberOfLines={1}>{a.name}</ThemedText>
                    <View style={styles.upcomingDateBadge}>
                      <Clock size={10} color={colors.secondaryText} />
                      <ThemedText variant="secondary" style={styles.upcomingDateText}>
                        {formatDateUK(a.date)}
                      </ThemedText>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            );
          })()}
        </View>
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        testID="calendar-fab"
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push('/calendar/absence-form' as never)}
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    flex: 1,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontWeight: '800' as const,
    textAlign: 'center' as const,
  },
  weekNumber: {
    fontSize: 11,
    marginTop: 1,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewSwitcher: {
    flexDirection: 'row' as const,
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  viewSwitcherBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 17,
  },
  viewSwitcherText: {
    fontSize: 11,
    fontWeight: '700' as const,
  },
  content: {
    padding: 10,
    paddingBottom: 96,
    gap: 10,
  },
  contentDesktop: { alignItems: 'center' as const },
  dashboardRow: {
    flexDirection: 'row' as const,
    gap: 8,
    width: '100%',
    maxWidth: 1320,
  },
  dashboardCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  dashboardIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardValue: { fontSize: 22, fontWeight: '800' as const },
  dashboardLabel: { fontSize: 10, textAlign: 'center' as const },
  weekSummaryRow: {
    flexDirection: 'row' as const,
    gap: 8,
    width: '100%',
    maxWidth: 1320,
  },
  weekSummaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  weekSummaryVal: { fontSize: 20, fontWeight: '800' as const },
  weekSummaryLabel: { fontSize: 10, textAlign: 'center' as const },
  calendarCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 4,
    alignSelf: 'center' as const,
  },
  viewCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    alignSelf: 'center' as const,
  },
  weekHeader: { flexDirection: 'row' as const, marginBottom: 2 },
  weekCell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 4 },
  weekText: { fontSize: 10, fontWeight: '700' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
  dayCard: { width: `${100 / 7}%`, padding: 2, gap: 1 },
  emptyDay: { opacity: 0 },
  dayTopRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 1,
  },
  dayNumberWrap: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: { fontSize: 10, fontWeight: '700' as const },
  dayNumberToday: { color: 'white', fontWeight: '800' as const },
  holidayLabel: { fontSize: 8, fontWeight: '700' as const },
  sessionsWrap: { flex: 1, gap: 2 },
  sessionBlock: {
    flex: 1,
    paddingVertical: 2,
    paddingHorizontal: 3,
    gap: 2,
    borderRadius: 4,
  },
  sessionLabel: { fontSize: 7, fontWeight: '800' as const, letterSpacing: 0.3 },
  eventBar: {
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderLeftWidth: 2,
  },
  eventText: { fontSize: 8, fontWeight: '700' as const },
  moreText: { fontSize: 8, paddingLeft: 2 },
  upcomingCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    gap: 12,
    alignSelf: 'center' as const,
  },
  upcomingHeader: { flexDirection: 'row' as const, alignItems: 'center', gap: 10 },
  upcomingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingTitle: { fontSize: 16, fontWeight: '800' as const, flex: 1 },
  upcomingList: { gap: 4 },
  upcomingRow: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  upcomingTypeDot: { width: 10, height: 10, borderRadius: 5 },
  upcomingName: { flex: 1, fontSize: 14, fontWeight: '600' as const },
  upcomingDateBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  upcomingDateText: { fontSize: 11, fontWeight: '600' as const },
  upcomingEmpty: { paddingVertical: 8 },
  upcomingEmptyText: { fontSize: 13, fontStyle: 'italic' as const },
  fab: {
    position: 'absolute' as const,
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
});
