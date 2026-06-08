import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import { absenceColors, dotColors } from '@/constants/colors';
import { Absence, AbsenceType } from '@/types';
import { toDateString, getWeekDates, fromDateString, todayDateString } from '@/utils/dateUtils';

function getTypeColor(type: AbsenceType) {
  switch (type) {
    case 'Holiday': return absenceColors.holiday;
    case 'Sickness': return absenceColors.sickness;
    case 'Training': return absenceColors.training;
    case 'Unpaid Leave': return absenceColors.unpaidLeave;
    case 'Other': return absenceColors.other;
    case 'Public Holiday': return absenceColors.publicHoliday;
    default: return absenceColors.pending;
  }
}

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
  const isSmallPhone = width < 380;
  const isTablet = width >= 768;

  const weekDates = useMemo(() => getWeekDates(new Date(currentDate)), [currentDate]);
  const todayStr = todayDateString();

  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getAbsencesForDate = (date: string) =>
    absences.filter((a) => a.date === date);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      {/* Day column headers */}
      <View style={styles.weekRow}>
        <View style={styles.timeGutter} />
        {weekDates.map((date, idx) => {
          const dateStr = toDateString(date);
          const isToday = dateStr === todayStr;
          return (
            <TouchableOpacity
              key={dateStr}
              style={[styles.dayHeader, isToday && styles.dayHeaderToday]}
              onPress={() => onSelectDate(dateStr)}
              activeOpacity={0.7}
            >
              <ThemedText style={[styles.dayLabel, isToday && styles.dayLabelToday]}>
                {dayLabels[idx]}
              </ThemedText>
              <View style={[styles.dayNumWrap, isToday && styles.dayNumWrapToday]}>
                <ThemedText style={[styles.dayNum, isToday && styles.dayNumToday]}>
                  {date.getDate()}
                </ThemedText>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* AM / PM rows per day */}
      <View style={styles.weekBody}>
        {/* AM Row */}
        <View style={styles.sessionRow}>
          <View style={styles.timeGutter}>
            <ThemedText style={styles.sessionLabel}>AM</ThemedText>
          </View>
          {weekDates.map((date) => {
            const dateStr = toDateString(date);
            const dayAbsences = getAbsencesForDate(dateStr);
            const amList = dayAbsences.filter(
              (a) => a.type !== 'Public Holiday' && a.status !== 'Rejected' && (a.duration === 'AM' || a.duration === 'Full')
            );
            const holiday = dayAbsences.find((a) => a.type === 'Public Holiday');

            return (
              <TouchableOpacity
                key={`am-${dateStr}`}
                style={styles.dayCell}
                onPress={() => onAddAbsence(dateStr, 'AM')}
                activeOpacity={0.6}
              >
                {holiday ? (
                  <View style={[styles.holidayPill, { backgroundColor: `${absenceColors.publicHoliday}22` }]}>
                    <ThemedText style={[styles.holidayText, { color: absenceColors.publicHoliday }]} numberOfLines={1}>
                      {holiday.name}
                    </ThemedText>
                  </View>
                ) : amList.length > 0 ? (
                  amList.slice(0, isTablet ? 5 : isSmallPhone ? 2 : 3).map((a) => (
                    <View
                      key={a.id}
                      style={[styles.namePill, { backgroundColor: `${getTypeColor(a.type)}22`, borderLeftColor: getTypeColor(a.type) }]}
                    >
                      <ThemedText style={[styles.namePillText, { color: getTypeColor(a.type) }]} numberOfLines={1}>
                        {a.name}
                      </ThemedText>
                    </View>
                  ))
                ) : null}
                {(amList.length > (isTablet ? 5 : isSmallPhone ? 2 : 3)) && (
                  <ThemedText variant="secondary" style={styles.moreLabel}>
                    +{amList.length - (isTablet ? 5 : isSmallPhone ? 2 : 3)} more
                  </ThemedText>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* PM Row */}
        <View style={styles.sessionRow}>
          <View style={styles.timeGutter}>
            <ThemedText style={styles.sessionLabel}>PM</ThemedText>
          </View>
          {weekDates.map((date) => {
            const dateStr = toDateString(date);
            const dayAbsences = getAbsencesForDate(dateStr);
            const pmList = dayAbsences.filter(
              (a) => a.type !== 'Public Holiday' && a.status !== 'Rejected' && (a.duration === 'PM' || a.duration === 'Full')
            );
            const holiday = dayAbsences.find((a) => a.type === 'Public Holiday');

            return (
              <TouchableOpacity
                key={`pm-${dateStr}`}
                style={styles.dayCell}
                onPress={() => onAddAbsence(dateStr, 'PM')}
                activeOpacity={0.6}
              >
                {!holiday && pmList.length > 0 ? (
                  pmList.slice(0, isTablet ? 5 : isSmallPhone ? 2 : 3).map((a) => (
                    <View
                      key={a.id}
                      style={[styles.namePill, { backgroundColor: `${getTypeColor(a.type)}22`, borderLeftColor: getTypeColor(a.type) }]}
                    >
                      <ThemedText style={[styles.namePillText, { color: getTypeColor(a.type) }]} numberOfLines={1}>
                        {a.name}
                      </ThemedText>
                    </View>
                  ))
                ) : null}
                {(pmList.length > (isTablet ? 5 : isSmallPhone ? 2 : 3)) && (
                  <ThemedText variant="secondary" style={styles.moreLabel}>
                    +{pmList.length - (isTablet ? 5 : isSmallPhone ? 2 : 3)} more
                  </ThemedText>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 20,
  },
  weekRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
  },
  timeGutter: {
    width: 36,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  dayHeaderToday: {
    backgroundColor: 'rgba(15, 118, 110, 0.08)',
    borderRadius: 10,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
  },
  dayLabelToday: {
    color: '#0F766E',
  },
  dayNumWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumWrapToday: {
    backgroundColor: '#0F766E',
  },
  dayNum: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  dayNumToday: {
    color: 'white',
    fontWeight: '800' as const,
  },
  weekBody: {
    gap: 2,
  },
  sessionRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.08)',
    minHeight: 64,
  },
  sessionLabel: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.5,
    paddingTop: 6,
  },
  dayCell: {
    flex: 1,
    padding: 3,
    gap: 2,
  },
  namePill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderLeftWidth: 3,
  },
  namePillText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  holidayPill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flex: 1,
    justifyContent: 'center',
  },
  holidayText: {
    fontSize: 10,
    fontWeight: '700' as const,
  },
  moreLabel: {
    fontSize: 9,
    paddingLeft: 4,
  },
});
