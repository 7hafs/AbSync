import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
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
    case 'Sickness': return 'SL';
    case 'Training': return 'TR';
    case 'Unpaid Leave': return 'UL';
    case 'Other': return 'OT';
    case 'Public Holiday': return 'PH';
    default: return '?';
  }
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardsProps {
  amCount: number;
  pmCount: number;
  fullDayCount: number;
  totalStaffCount: number;
}

function SummaryCards({ amCount, pmCount, fullDayCount, totalStaffCount }: SummaryCardsProps) {
  return (
    <View style={styles.summaryRow}>
      <View style={[styles.summaryCard, { backgroundColor: '#F0FDF4' }]}>
        <ThemedText style={[styles.summaryValue, { color: '#16A34A' }]}>{amCount}</ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>AM</ThemedText>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: '#EFF6FF' }]}>
        <ThemedText style={[styles.summaryValue, { color: '#2563EB' }]}>{pmCount}</ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>PM</ThemedText>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: '#FFF7ED' }]}>
        <ThemedText style={[styles.summaryValue, { color: '#EA580C' }]}>{fullDayCount}</ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>Full</ThemedText>
      </View>
      <View style={[styles.summaryCard, { backgroundColor: '#F5F3FF' }]}>
        <ThemedText style={[styles.summaryValue, { color: '#6D28D9' }]}>{totalStaffCount}</ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>People</ThemedText>
      </View>
    </View>
  );
}

interface DayColumnProps {
  date: Date;
  dateStr: string;
  dayIndex: number;
  isToday: boolean;
  isWeekend: boolean;
  amList: Array<{ id: string; name: string; type: AbsenceType }>;
  pmList: Array<{ id: string; name: string; type: AbsenceType }>;
  onPressDay: () => void;
  onPressStaff: (absenceId: string) => void;
}

function DayColumn({
  date,
  dateStr,
  dayIndex,
  isToday,
  isWeekend,
  amList,
  pmList,
  onPressDay,
  onPressStaff,
}: DayColumnProps) {
  const dayNum = date.getDate();
  const dayLabel = DAY_LABELS[dayIndex];

  const renderMiniStaff = (
    list: Array<{ id: string; name: string; type: AbsenceType }>,
    sectionColor: string,
  ) => {
    if (list.length === 0) {
      return (
        <View style={styles.miniEmpty}>
          <ThemedText variant="secondary" style={styles.miniEmptyText}>—</ThemedText>
        </View>
      );
    }
    return (
      <View style={styles.miniList}>
        {list.slice(0, 3).map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.miniStaffRow, { backgroundColor: `${getTypeColor(item.type)}12` }]}
            onPress={() => onPressStaff(item.id)}
            activeOpacity={0.6}
          >
            <View style={[styles.miniDot, { backgroundColor: getTypeColor(item.type) }]} />
            <ThemedText style={styles.miniName} numberOfLines={1}>{item.name}</ThemedText>
          </TouchableOpacity>
        ))}
        {list.length > 3 && (
          <ThemedText variant="secondary" style={styles.miniMore}>+{list.length - 3}</ThemedText>
        )}
      </View>
    );
  };

  return (
    <TouchableOpacity
      style={[
        styles.dayColumn,
        isToday && styles.dayColumnToday,
        isWeekend && styles.dayColumnWeekend,
      ]}
      onPress={onPressDay}
      activeOpacity={0.7}
    >
      {/* Day header */}
      <View style={[styles.dayHeader, isToday && styles.dayHeaderToday]}>
        <ThemedText style={[styles.dayLabel, isWeekend && styles.dayLabelWeekend]}>
          {dayLabel}
        </ThemedText>
        <View style={[styles.dayNumWrap, isToday && styles.dayNumWrapToday]}>
          <ThemedText style={[styles.dayNum, isToday && styles.dayNumToday]}>
            {dayNum}
          </ThemedText>
        </View>
      </View>

      {/* AM Section */}
      <View style={styles.sessionBlock}>
        <View style={styles.sessionLabelRow}>
          <View style={[styles.sessionBadge, { backgroundColor: '#DCFCE7' }]}>
            <ThemedText style={[styles.sessionBadgeText, { color: '#16A34A' }]}>AM</ThemedText>
          </View>
          {amList.length > 0 && (
            <ThemedText style={[styles.sessionCount, { color: '#16A34A' }]}>{amList.length}</ThemedText>
          )}
        </View>
        {renderMiniStaff(amList, '#16A34A')}
      </View>

      {/* Divider */}
      <View style={styles.sessionDivider} />

      {/* PM Section */}
      <View style={styles.sessionBlock}>
        <View style={styles.sessionLabelRow}>
          <View style={[styles.sessionBadge, { backgroundColor: '#DBEAFE' }]}>
            <ThemedText style={[styles.sessionBadgeText, { color: '#2563EB' }]}>PM</ThemedText>
          </View>
          {pmList.length > 0 && (
            <ThemedText style={[styles.sessionCount, { color: '#2563EB' }]}>{pmList.length}</ThemedText>
          )}
        </View>
        {renderMiniStaff(pmList, '#2563EB')}
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
    return { amCount: am, pmCount: pm, fullDayCount: fullDay, totalStaffCount: seenStaff.size };
  }, [dayData, absences]);

  return (
    <View style={styles.container}>
      <SummaryCards {...summaryData} />

      {/* 7-column grid — always visible */}
      <View style={styles.weekGrid}>
        {dayData.map((d) => (
          <DayColumn
            key={d.dateStr}
            date={d.date}
            dateStr={d.dateStr}
            dayIndex={d.idx}
            isToday={d.isToday}
            isWeekend={d.isWeekend}
            amList={d.amList}
            pmList={d.pmList}
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
    gap: 10,
  },
  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    gap: 6,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800' as const,
  },
  summaryLabel: {
    fontSize: 10,
    textAlign: 'center' as const,
  },
  // Week grid — 7 columns
  weekGrid: {
    flexDirection: 'row',
    gap: 4,
  },
  dayColumn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
    paddingHorizontal: 4,
    gap: 4,
    minWidth: 40,
  },
  dayColumnToday: {
    borderColor: '#0F766E',
    borderWidth: 1.5,
    backgroundColor: '#F0FDFA',
  },
  dayColumnWeekend: {
    backgroundColor: '#F8FAFC',
  },
  // Day header
  dayHeader: {
    alignItems: 'center',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.08)',
    gap: 2,
  },
  dayHeaderToday: {
    borderBottomColor: '#0F766E33',
  },
  dayLabel: {
    fontSize: 9,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    color: '#475569',
  },
  dayLabelWeekend: {
    color: '#94A3B8',
  },
  dayNumWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
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
    color: '#334155',
  },
  dayNumToday: {
    color: 'white',
    fontWeight: '800' as const,
  },
  // Session blocks
  sessionBlock: {
    gap: 2,
  },
  sessionDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.06)',
  },
  sessionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sessionBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  sessionBadgeText: {
    fontSize: 7,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  sessionCount: {
    fontSize: 8,
    fontWeight: '700' as const,
  },
  // Mini staff list
  miniList: {
    gap: 2,
  },
  miniEmpty: {
    paddingVertical: 6,
    alignItems: 'center' as const,
  },
  miniEmptyText: {
    fontSize: 9,
  },
  miniStaffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 3,
    borderRadius: 6,
  },
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  miniName: {
    fontSize: 9,
    fontWeight: '600' as const,
    flex: 1,
  },
  miniMore: {
    fontSize: 8,
    paddingLeft: 12,
  },
});
