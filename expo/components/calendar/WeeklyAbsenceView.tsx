import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import ThemedText from '@/components/ThemedText';
import { absenceColors } from '@/constants/colors';
import { Absence, AbsenceType, AbsenceDuration } from '@/types';
import {
  toDateString,
  todayDateString,
  getWeekDatesFromDate,
} from '@/utils/dateUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<AbsenceType, string> = {
  Holiday: absenceColors.holiday,
  Sickness: absenceColors.sickness,
  Training: absenceColors.training,
  'Unpaid Leave': absenceColors.unpaidLeave,
  Other: absenceColors.other,
  'Public Holiday': absenceColors.publicHoliday,
};

function getTypeColor(type: AbsenceType): string {
  return TYPE_COLORS[type] ?? absenceColors.pending;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getTypeBadge(type: AbsenceType): string {
  switch (type) {
    case 'Holiday': return 'AL';
    case 'Sickness': return 'S';
    case 'Training': return 'T';
    case 'Unpaid Leave': return 'UL';
    case 'Other': return 'O';
    case 'Public Holiday': return 'PH';
    default: return '?';
  }
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

// ── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardsProps {
  amCount: number;
  pmCount: number;
  fullDayCount: number;
  totalCount: number;
}

function SummaryCards({ amCount, pmCount, fullDayCount, totalCount }: SummaryCardsProps) {
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryCard, { backgroundColor: '#F0FDF4' }]}>
        <ThemedText style={[styles.summaryValue, { color: '#16A34A' }]}>{amCount}</ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>AM Absences</ThemedText>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: '#EFF6FF' }]}>
        <ThemedText style={[styles.summaryValue, { color: '#2563EB' }]}>{pmCount}</ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>PM Absences</ThemedText>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: '#FFF7ED' }]}>
        <ThemedText style={[styles.summaryValue, { color: '#EA580C' }]}>{fullDayCount}</ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>Full Day</ThemedText>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: '#F5F3FF' }]}>
        <ThemedText style={[styles.summaryValue, { color: '#6D28D9' }]}>{totalCount}</ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>Total</ThemedText>
      </View>
    </View>
  );
}

interface DayCardProps {
  date: Date;
  dateStr: string;
  dayIndex: number;
  isToday: boolean;
  isWeekend: boolean;
  amList: Array<{ id: string; name: string; type: AbsenceType }>;
  pmList: Array<{ id: string; name: string; type: AbsenceType }>;
  isCompact: boolean;
  onPressDay: () => void;
  onPressStaff: (absenceId: string) => void;
}

function DayCard({
  date,
  dateStr,
  dayIndex,
  isToday,
  isWeekend,
  amList,
  pmList,
  isCompact,
  onPressDay,
  onPressStaff,
}: DayCardProps) {
  const maxVisible = isCompact ? 1 : 3;
  
  const renderStaffList = (
    list: Array<{ id: string; name: string; type: AbsenceType }>,
  ) => {
    if (list.length === 0) {
      return <ThemedText variant="secondary" style={styles.noAbsences}>—</ThemedText>;
    }
    return (
      <View style={styles.staffList}>
        {list.slice(0, maxVisible).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.staffRow}
            onPress={() => onPressStaff(item.id)}
            activeOpacity={0.6}
          >
            <View style={[styles.avatar, { backgroundColor: `${getTypeColor(item.type)}22` }]}>
              <ThemedText style={[styles.avatarText, { color: getTypeColor(item.type) }]}>
                {getInitials(item.name)}
              </ThemedText>
            </View>
            <ThemedText style={styles.staffName} numberOfLines={1}>{item.name}</ThemedText>
            <View style={[styles.typeBadge, { backgroundColor: `${getTypeColor(item.type)}18` }]}>
              <ThemedText style={[styles.typeBadgeText, { color: getTypeColor(item.type) }]}>
                {getTypeBadge(item.type)}
              </ThemedText>
            </View>
          </TouchableOpacity>
        ))}
        {list.length > maxVisible && (
          <ThemedText variant="secondary" style={styles.moreLabel}>
            +{list.length - maxVisible} more
          </ThemedText>
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.dayCard,
        isToday && styles.dayCardToday,
        isWeekend && styles.dayCardWeekend,
      ]}
      onPress={onPressDay}
      activeOpacity={0.7}
    >
      {/* Day header */}
      <View style={styles.dayCardHeader}>
        <ThemedText style={[styles.dayLabel, isWeekend && styles.dayLabelWeekend]}>
          {isCompact ? DAY_LABELS[dayIndex] : DAY_LABELS_FULL[dayIndex]}
        </ThemedText>
        <View style={[styles.dayNumWrap, isToday && styles.dayNumWrapToday]}>
          <ThemedText style={[styles.dayNum, isToday && styles.dayNumToday]}>
            {date.getDate()}
          </ThemedText>
        </View>
      </View>

      {/* AM Section */}
      <View style={[styles.sessionBlock, styles.amBlock]}>
        <View style={styles.sessionHeaderRow}>
          <ThemedText style={styles.sessionLabelAM}>AM</ThemedText>
          {amList.length > 0 && (
            <View style={[styles.sessionCountBadge, { backgroundColor: '#DCFCE7' }]}>
              <ThemedText style={[styles.sessionCount, { color: '#16A34A' }]}>{amList.length}</ThemedText>
            </View>
          )}
        </View>
        {renderStaffList(amList)}
      </View>

      {/* PM Section */}
      <View style={[styles.sessionBlock, styles.pmBlock]}>
        <View style={styles.sessionHeaderRow}>
          <ThemedText style={styles.sessionLabelPM}>PM</ThemedText>
          {pmList.length > 0 && (
            <View style={[styles.sessionCountBadge, { backgroundColor: '#DBEAFE' }]}>
              <ThemedText style={[styles.sessionCount, { color: '#2563EB' }]}>{pmList.length}</ThemedText>
            </View>
          )}
        </View>
        {renderStaffList(pmList)}
      </View>
    </TouchableOpacity>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface WeeklyCalendarViewProps {
  currentDate: Date;
  absences: Absence[];
  onSelectDate: (date: string) => void;
  onAddAbsence: (date: string, session: 'AM' | 'PM') => void;
}

export default function WeeklyCalendarView({
  currentDate,
  absences,
  onSelectDate,
  onAddAbsence,
}: WeeklyCalendarViewProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 640;
  const isSmall = width < 420;

  const weekDates = useMemo(() => getWeekDatesFromDate(currentDate), [currentDate]);
  const todayStr = todayDateString();

  const dayData = useMemo(() => {
    return weekDates.map((date, idx) => {
      const dateStr = toDateString(date);
      const dayAbsences = absences.filter(
        (a) => a.date === dateStr && a.type !== 'Public Holiday' && a.status !== 'Rejected',
      );

      const amList = dayAbsences
        .filter((a) => a.duration === 'AM' || a.duration === 'Full')
        .map((a) => ({ id: a.id, name: a.name, type: a.type }));

      const pmList = dayAbsences
        .filter((a) => a.duration === 'PM' || a.duration === 'Full')
        .map((a) => ({ id: a.id, name: a.name, type: a.type }));

      const isToday = dateStr === todayStr;
      const isWeekend = idx >= 5;

      return { date, dateStr, idx, amList, pmList, isToday, isWeekend };
    });
  }, [weekDates, absences, todayStr]);

  const summaryData = useMemo(() => {
    let am = 0;
    let pm = 0;
    let fullDay = 0;
    const seenStaff = new Set<string>();

    for (const d of dayData) {
      const dayAbsences = absences.filter(
        (a) => a.date === d.dateStr && a.type !== 'Public Holiday' && a.status !== 'Rejected',
      );
      for (const a of dayAbsences) {
        seenStaff.add(a.staffId);
        if (a.duration === 'AM') am++;
        else if (a.duration === 'PM') pm++;
        else if (a.duration === 'Full') fullDay++;
      }
    }
    // Total = unique staff absences this week
    const total = seenStaff.size;

    return { amCount: am, pmCount: pm, fullDayCount: fullDay, totalCount: total };
  }, [dayData, absences]);

  if (isSmall) {
    // Mobile: horizontal scroll
    return (
      <View style={styles.container}>
        <SummaryCards {...summaryData} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
          <View style={styles.dayCardsRow}>
            {dayData.map((d) => (
              <View key={d.dateStr} style={styles.dayCardWrapper}>
                <DayCard
                  date={d.date}
                  dateStr={d.dateStr}
                  dayIndex={d.idx}
                  isToday={d.isToday}
                  isWeekend={d.isWeekend}
                  amList={d.amList}
                  pmList={d.pmList}
                  isCompact={true}
                  onPressDay={() => onSelectDate(d.dateStr)}
                  onPressStaff={(id) => {
                    const ab = absences.find((a) => a.id === id);
                    if (ab) onSelectDate(ab.date);
                  }}
                />
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  // Tablet/Desktop: full grid
  return (
    <View style={styles.container}>
      <SummaryCards {...summaryData} />
      <View style={styles.dayCardsGrid}>
        {dayData.map((d) => (
          <DayCard
            key={d.dateStr}
            date={d.date}
            dateStr={d.dateStr}
            dayIndex={d.idx}
            isToday={d.isToday}
            isWeekend={d.isWeekend}
            amList={d.amList}
            pmList={d.pmList}
            isCompact={isCompact}
            onPressDay={() => onSelectDate(d.dateStr)}
            onPressStaff={(id) => {
              const ab = absences.find((a) => a.id === id);
              if (ab) onSelectDate(ab.date);
            }}
          />
        ))}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800' as const,
  },
  summaryLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  // Day cards
  horizontalScroll: {
    flexGrow: 0,
  },
  dayCardsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 16,
  },
  dayCardWrapper: {
    width: 160,
  },
  dayCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
  },
  dayCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  dayCardToday: {
    borderColor: '#0F766E',
    borderWidth: 2,
    backgroundColor: '#F0FDFA',
  },
  dayCardWeekend: {
    backgroundColor: '#F8FAFC',
  },
  // Day card header
  dayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.1)',
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    color: '#475569',
  },
  dayLabelWeekend: {
    color: '#94A3B8',
  },
  dayNumWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 118, 110, 0.06)',
  },
  dayNumWrapToday: {
    backgroundColor: '#0F766E',
  },
  dayNum: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  dayNumToday: {
    color: 'white',
    fontWeight: '800' as const,
  },
  // Session blocks
  sessionBlock: {
    gap: 4,
    minHeight: 30,
  },
  amBlock: {},
  pmBlock: {},
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionLabelAM: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
    color: '#16A34A',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  sessionLabelPM: {
    fontSize: 9,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
    color: '#2563EB',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden' as const,
  },
  sessionCountBadge: {
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  sessionCount: {
    fontSize: 9,
    fontWeight: '700' as const,
  },
  // Staff list
  staffList: {
    gap: 3,
  },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 8,
    fontWeight: '800' as const,
  },
  staffName: {
    fontSize: 10,
    fontWeight: '600' as const,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 8,
    fontWeight: '800' as const,
    letterSpacing: 0.2,
  },
  noAbsences: {
    fontSize: 10,
    paddingVertical: 2,
  },
  moreLabel: {
    fontSize: 9,
    paddingLeft: 26,
  },
});
