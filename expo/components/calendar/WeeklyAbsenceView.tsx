import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import ThemedText from '@/components/ThemedText';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { absenceColors } from '@/constants/colors';
import { Absence, AbsenceType } from '@/types';
import {
  toDateString,
  todayDateString,
  getWeekDatesFromDate,
} from '@/utils/dateUtils';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Type colours ─────────────────────────────────────────────────────────────

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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

// ── Section colours ──────────────────────────────────────────────────────────

const SECTION_CONFIG = {
  am: { color: '#16A34A', label: 'AM' } as const,
  pm: { color: '#6366F1', label: 'PM' } as const,
  full: { color: '#EA580C', label: 'Full Day' } as const,
};

// ── Staff list item ──────────────────────────────────────────────────────────

interface StaffListItemProps {
  name: string;
  type: AbsenceType;
  accentColor: string;
  onPress: () => void;
}

const StaffListItem = React.memo(function StaffListItem({
  name,
  type,
  accentColor,
  onPress,
}: StaffListItemProps) {
  return (
    <TouchableOpacity
      style={styles.staffItem}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.staffLeftStripe, { backgroundColor: accentColor }]} />
      <View style={[styles.staffAvatar, { backgroundColor: getTypeColor(type) }]}>
        <ThemedText style={styles.staffAvatarText}>
          {getInitials(name)}
        </ThemedText>
      </View>
      <ThemedText style={styles.staffName} numberOfLines={1}>
        {name}
      </ThemedText>
    </TouchableOpacity>
  );
});

// ── Accordion day card ───────────────────────────────────────────────────────

interface AccordionDayProps {
  date: Date;
  dateStr: string;
  dayIndex: number;
  isToday: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  amList: Array<{ id: string; name: string; type: AbsenceType }>;
  pmList: Array<{ id: string; name: string; type: AbsenceType }>;
  fullDayList: Array<{ id: string; name: string; type: AbsenceType }>;
  amCountTotal: number;
  pmCountTotal: number;
  fullDayCount: number;
  onPressStaff: (id: string) => void;
}

function AccordionDay({
  date,
  dayIndex,
  isToday,
  isExpanded,
  onToggle,
  amList,
  pmList,
  fullDayList,
  amCountTotal,
  pmCountTotal,
  fullDayCount,
  onPressStaff,
}: AccordionDayProps) {
  const dayNum = date.getDate();
  const dayLabel = DAY_LABELS[dayIndex];
  const Chevron = isExpanded ? ChevronUp : ChevronDown;
  const totalAbsences = amCountTotal + pmCountTotal + fullDayCount;

  return (
    <View style={[styles.accordion, isToday && styles.accordionToday]}>
      {/* Header tap target */}
      <TouchableOpacity
        style={styles.accordionHeader}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={styles.accordionHeaderLeft}>
          <ThemedText
            style={[styles.dayLabel, isToday && styles.dayLabelToday]}
            weight="bold"
          >
            {dayLabel}
          </ThemedText>
          <ThemedText style={[styles.dayDate, isToday && styles.dayDateToday]}>
            {String(dayNum).padStart(2, '0')}
          </ThemedText>
          {isToday && (
            <View style={styles.todayTag}>
              <ThemedText style={styles.todayTagText}>Today</ThemedText>
            </View>
          )}
        </View>
        <View style={styles.accordionHeaderRight}>
          <View style={styles.inlineCounts}>
            <ThemedText style={[styles.inlineCount, { color: SECTION_CONFIG.am.color }]}>
              AM {amCountTotal}
            </ThemedText>
            <ThemedText style={styles.inlineDot}>·</ThemedText>
            <ThemedText style={[styles.inlineCount, { color: SECTION_CONFIG.pm.color }]}>
              PM {pmCountTotal}
            </ThemedText>
            <ThemedText style={styles.inlineDot}>·</ThemedText>
            <ThemedText style={[styles.inlineCount, { color: SECTION_CONFIG.full.color }]}>
              Full {fullDayCount}
            </ThemedText>
          </View>
          <Chevron
            size={18}
            color={isToday ? '#0F766E' : '#94A3B8'}
            strokeWidth={2}
          />
        </View>
      </TouchableOpacity>

      {/* Expanded sections */}
      {isExpanded && totalAbsences > 0 && (
        <View style={styles.accordionBody}>
          {amList.length > 0 && (
            <View style={styles.expandedSection}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionDot, { backgroundColor: SECTION_CONFIG.am.color }]} />
                <ThemedText style={[styles.sectionTitle, { color: SECTION_CONFIG.am.color }]}>
                  AM — {amList.length} {amList.length === 1 ? 'absence' : 'absences'}
                </ThemedText>
              </View>
              {amList.map((s) => (
                <StaffListItem
                  key={s.id}
                  name={s.name}
                  type={s.type}
                  accentColor={SECTION_CONFIG.am.color}
                  onPress={() => onPressStaff(s.id)}
                />
              ))}
            </View>
          )}

          {pmList.length > 0 && (
            <View style={styles.expandedSection}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionDot, { backgroundColor: SECTION_CONFIG.pm.color }]} />
                <ThemedText style={[styles.sectionTitle, { color: SECTION_CONFIG.pm.color }]}>
                  PM — {pmList.length} {pmList.length === 1 ? 'absence' : 'absences'}
                </ThemedText>
              </View>
              {pmList.map((s) => (
                <StaffListItem
                  key={s.id}
                  name={s.name}
                  type={s.type}
                  accentColor={SECTION_CONFIG.pm.color}
                  onPress={() => onPressStaff(s.id)}
                />
              ))}
            </View>
          )}

          {fullDayList.length > 0 && (
            <View style={styles.expandedSection}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionDot, { backgroundColor: SECTION_CONFIG.full.color }]} />
                <ThemedText style={[styles.sectionTitle, { color: SECTION_CONFIG.full.color }]}>
                  Full Day — {fullDayList.length} {fullDayList.length === 1 ? 'absence' : 'absences'}
                </ThemedText>
              </View>
              {fullDayList.map((s) => (
                <StaffListItem
                  key={s.id}
                  name={s.name}
                  type={s.type}
                  accentColor={SECTION_CONFIG.full.color}
                  onPress={() => onPressStaff(s.id)}
                />
              ))}
            </View>
          )}

          {/* Empty sections — show subtle message */}
          {amList.length === 0 && (
            <View style={styles.emptySection}>
              <ThemedText variant="secondary" style={styles.emptyText}>
                No AM absences
              </ThemedText>
            </View>
          )}
          {pmList.length === 0 && (
            <View style={styles.emptySection}>
              <ThemedText variant="secondary" style={styles.emptyText}>
                No PM absences
              </ThemedText>
            </View>
          )}
          {fullDayList.length === 0 && (
            <View style={styles.emptySection}>
              <ThemedText variant="secondary" style={styles.emptyText}>
                No full-day absences
              </ThemedText>
            </View>
          )}
        </View>
      )}

      {/* Expanded but empty */}
      {isExpanded && totalAbsences === 0 && (
        <View style={styles.accordionBody}>
          <View style={styles.emptySection}>
            <ThemedText variant="secondary" style={styles.emptyText}>
              No absences for this day
            </ThemedText>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Summary cards ────────────────────────────────────────────────────────────

interface SummaryCardsProps {
  amCount: number;
  pmCount: number;
  fullDayCount: number;
  totalStaffCount: number;
}

function SummaryCards({ amCount, pmCount, fullDayCount, totalStaffCount }: SummaryCardsProps) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryCard}>
        <ThemedText style={[styles.summaryValue, { color: SECTION_CONFIG.am.color }]}>
          {amCount}
        </ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>AM</ThemedText>
      </View>
      <View style={styles.summaryCard}>
        <ThemedText style={[styles.summaryValue, { color: SECTION_CONFIG.pm.color }]}>
          {pmCount}
        </ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>PM</ThemedText>
      </View>
      <View style={styles.summaryCard}>
        <ThemedText style={[styles.summaryValue, { color: SECTION_CONFIG.full.color }]}>
          {fullDayCount}
        </ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>Full Day</ThemedText>
      </View>
      <View style={styles.summaryCard}>
        <ThemedText style={[styles.summaryValue, { color: '#6D28D9' }]}>
          {totalStaffCount}
        </ThemedText>
        <ThemedText variant="secondary" style={styles.summaryLabel}>People</ThemedText>
      </View>
    </View>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface WeeklyAbsenceViewProps {
  currentDate: Date;
  absences: Absence[];
  onSelectDate: (date: string) => void;
  onAddAbsence: (date: string, session: 'AM' | 'PM') => void;
}

export default function WeeklyAbsenceView({
  currentDate,
  absences,
  onSelectDate,
}: WeeklyAbsenceViewProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const weekDates = useMemo(
    () => getWeekDatesFromDate(currentDate),
    [currentDate],
  );
  const todayStr = todayDateString();

  const dayData = useMemo(() => {
    return weekDates.map((date, idx) => {
      const dateStr = toDateString(date);
      const dayAbsences = absences.filter(
        (a) =>
          a.date === dateStr &&
          a.type !== 'Public Holiday' &&
          a.status !== 'Rejected',
      );

      const amList = dayAbsences
        .filter((a) => a.duration === 'AM')
        .map((a) => ({ id: a.id, name: a.name, type: a.type }));

      const pmList = dayAbsences
        .filter((a) => a.duration === 'PM')
        .map((a) => ({ id: a.id, name: a.name, type: a.type }));

      const fullDayList = dayAbsences
        .filter((a) => a.duration === 'Full')
        .map((a) => ({ id: a.id, name: a.name, type: a.type }));

      const amCountTotal = amList.length + fullDayList.length;
      const pmCountTotal = pmList.length + fullDayList.length;
      const fullDayCount = fullDayList.length;
      const isToday = dateStr === todayStr;

      return {
        date,
        dateStr,
        idx,
        amList,
        pmList,
        fullDayList,
        amCountTotal,
        pmCountTotal,
        fullDayCount,
        isToday,
      };
    });
  }, [weekDates, absences, todayStr]);

  const summaryData = useMemo(() => {
    let am = 0;
    let pm = 0;
    let fullDay = 0;
    const seenStaff = new Set<string>();

    for (const d of dayData) {
      const dayAbsences = absences.filter(
        (a) =>
          a.date === d.dateStr &&
          a.type !== 'Public Holiday' &&
          a.status !== 'Rejected',
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

  const handleToggle = useCallback((dateStr: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedDay((prev) => (prev === dateStr ? null : dateStr));
  }, []);

  const handlePressStaff = useCallback(
    (id: string) => {
      const ab = absences.find((a) => a.id === id);
      if (ab) onSelectDate(ab.date);
    },
    [absences, onSelectDate],
  );

  return (
    <View style={styles.container}>
      <SummaryCards {...summaryData} />

      {dayData.map((d) => (
        <AccordionDay
          key={d.dateStr}
          date={d.date}
          dateStr={d.dateStr}
          dayIndex={d.idx}
          isToday={d.isToday}
          isExpanded={expandedDay === d.dateStr}
          onToggle={() => handleToggle(d.dateStr)}
          amList={d.amList}
          pmList={d.pmList}
          fullDayList={d.fullDayList}
          amCountTotal={d.amCountTotal}
          pmCountTotal={d.pmCountTotal}
          fullDayCount={d.fullDayCount}
          onPressStaff={handlePressStaff}
        />
      ))}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 14,
  },

  // ── Summary row ──
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800' as const,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },

  // ── Accordion (each day card) ──
  accordion: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  accordionToday: {
    borderColor: '#0F766E',
    borderWidth: 2,
    backgroundColor: '#F0FDFA',
  },

  // ── Accordion header ──
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  accordionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayLabel: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: '#1E293B',
  },
  dayLabelToday: {
    color: '#0F766E',
  },
  dayDate: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: '#64748B',
  },
  dayDateToday: {
    color: '#0F766E',
    fontWeight: '800' as const,
  },
  todayTag: {
    backgroundColor: '#0F766E',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  todayTagText: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#FFFFFF',
  },
  accordionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineCounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineCount: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  inlineDot: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#CBD5E1',
  },

  // ── Accordion body ──
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 4,
  },

  // ── Expanded sections ──
  expandedSection: {
    marginBottom: 4,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },

  // ── Staff list item ──
  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingLeft: 12,
    borderRadius: 10,
  },
  staffLeftStripe: {
    position: 'absolute' as const,
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
  },
  staffAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#FFFFFF',
  },
  staffName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#1E293B',
  },

  // ── Empty state ──
  emptySection: {
    paddingVertical: 6,
    paddingLeft: 16,
  },
  emptyText: {
    fontSize: 12,
    fontStyle: 'italic' as const,
  },
});
