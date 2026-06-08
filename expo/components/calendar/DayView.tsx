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
import { Absence, AbsenceType } from '@/types';
import {
  toDateString,
  todayDateString,
  formatDateUKLong,
  fromDateString,
} from '@/utils/dateUtils';

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

interface DayViewProps {
  currentDate: Date;
  absences: Absence[];
  onSelectDate: (date: string) => void;
  onAddAbsence: (date: string, session: 'AM' | 'PM') => void;
}

interface StaffEntry {
  id: string;
  name: string;
  type: AbsenceType;
  duration: 'AM' | 'PM' | 'Full';
  status: string;
}

export default function DayView({
  currentDate,
  absences,
  onSelectDate,
  onAddAbsence,
}: DayViewProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= 640;
  const dateStr = toDateString(currentDate);
  const todayStr = todayDateString();
  const isToday = dateStr === todayStr;

  const dayAbsences = useMemo(() => {
    return absences
      .filter((a) => a.date === dateStr)
      .filter((a) => a.type !== 'Public Holiday' && a.status !== 'Rejected');
  }, [absences, dateStr]);

  const amList = useMemo(
    () =>
      dayAbsences
        .filter((a) => a.duration === 'AM' || a.duration === 'Full')
        .map((a) => ({ id: a.id, name: a.name, type: a.type, duration: a.duration as 'AM' | 'Full', status: a.status })),
    [dayAbsences],
  );

  const pmList = useMemo(
    () =>
      dayAbsences
        .filter((a) => a.duration === 'PM' || a.duration === 'Full')
        .map((a) => ({ id: a.id, name: a.name, type: a.type, duration: a.duration as 'PM' | 'Full', status: a.status })),
    [dayAbsences],
  );

  const renderSection = (title: string, list: StaffEntry[], color: string, bgColor: string) => (
    <View style={[styles.section, { backgroundColor: bgColor, borderColor: `${color}22` }]}>
      <View style={[styles.sectionHeader, { backgroundColor: `${color}18` }]}>
        <ThemedText style={[styles.sectionTitle, { color }]}>{title}</ThemedText>
        <View style={[styles.sectionCount, { backgroundColor: `${color}22` }]}>
          <ThemedText style={[styles.sectionCountText, { color }]}>{list.length}</ThemedText>
        </View>
      </View>
      {list.length === 0 ? (
        <View style={styles.sectionEmpty}>
          <ThemedText variant="secondary" style={styles.emptyText}>
            No {title.toLowerCase()} absences
          </ThemedText>
        </View>
      ) : (
        <View style={styles.sectionList}>
          {list.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.staffCard}
              onPress={() => onSelectDate(dateStr)}
              activeOpacity={0.6}
            >
              <View style={[styles.avatar, { backgroundColor: `${getTypeColor(item.type)}22` }]}>
                <ThemedText style={[styles.avatarText, { color: getTypeColor(item.type) }]}>
                  {getInitials(item.name)}
                </ThemedText>
              </View>
              <View style={styles.staffInfo}>
                <ThemedText style={styles.staffName}>{item.name}</ThemedText>
                <ThemedText variant="secondary" style={styles.staffType}>
                  {item.type}{item.duration !== 'Full' ? ` (${item.duration})` : ''}
                </ThemedText>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${getTypeColor(item.type)}18` }]}>
                <ThemedText style={[styles.statusBadgeText, { color: getTypeColor(item.type) }]}>
                  {item.status}
                </ThemedText>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Day header */}
      <View style={[styles.dayHeader, isToday && styles.dayHeaderToday]}>
        <ThemedText style={styles.dateFull}>{formatDateUKLong(dateStr)}</ThemedText>
        <ThemedText variant="secondary" style={styles.entriesCount}>
          {dayAbsences.length} {dayAbsences.length === 1 ? 'absence' : 'absences'}
        </ThemedText>
      </View>

      {/* Quick stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: '#F0FDF4' }]}>
          <ThemedText style={[styles.statValue, { color: '#16A34A' }]}>{amList.length}</ThemedText>
          <ThemedText variant="secondary" style={styles.statLabel}>AM</ThemedText>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
          <ThemedText style={[styles.statValue, { color: '#2563EB' }]}>{pmList.length}</ThemedText>
          <ThemedText variant="secondary" style={styles.statLabel}>PM</ThemedText>
        </View>
        <TouchableOpacity
          style={[styles.statCard, styles.addCard, { borderColor: '#0F766E' }]}
          onPress={() => onAddAbsence(dateStr, 'AM')}
          activeOpacity={0.7}
        >
          <ThemedText style={[styles.addIcon, { color: '#0F766E' }]}>+</ThemedText>
          <ThemedText variant="secondary" style={styles.addLabel}>Add</ThemedText>
        </TouchableOpacity>
      </View>

      {/* AM/PM sections */}
      <View style={[styles.sectionsWrap, isWide && styles.sectionsWide]}>
        {renderSection('AM · Morning', amList, '#F59E0B', 'rgba(255, 184, 77, 0.06)')}
        {renderSection('PM · Afternoon', pmList, '#3B82F6', 'rgba(59, 130, 246, 0.06)')}
      </View>

      {dayAbsences.length === 0 && (
        <View style={styles.emptyState}>
          <ThemedText variant="secondary" style={styles.emptyText}>
            No absences recorded for this day. Tap the "+ Add" button above to create one.
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  dayHeader: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayHeaderToday: {},
  dateFull: {
    fontSize: 18,
    fontWeight: '800' as const,
  },
  entriesCount: {
    fontSize: 13,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800' as const,
  },
  statLabel: {
    fontSize: 10,
  },
  addCard: {
    backgroundColor: '#F0FDFA',
    borderWidth: 2,
    borderStyle: 'dashed' as const,
    justifyContent: 'center',
  },
  addIcon: {
    fontSize: 22,
    fontWeight: '700' as const,
  },
  addLabel: {
    fontSize: 10,
  },
  sectionsWrap: {
    gap: 12,
  },
  sectionsWide: {
    flexDirection: 'row',
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden' as const,
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  sectionCount: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  sectionEmpty: {
    padding: 14,
  },
  sectionList: {
    padding: 12,
    gap: 8,
  },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  staffInfo: {
    flex: 1,
  },
  staffName: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
  staffType: {
    fontSize: 11,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
