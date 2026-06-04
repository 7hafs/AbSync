import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useColorScheme } from 'react-native';
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, Stethoscope, SunMedium } from 'lucide-react-native';
import ThemedView from '@/components/ThemedView';
import ThemedText from '@/components/ThemedText';
import Colors, { absenceColors } from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';
import { Absence } from '@/types';
import { fromDateString } from '@/utils/dateUtils';

function getDaysValue(absence: Absence) {
  return absence.duration === 'Full' ? 1 : 0.5;
}

export default function ReportsScreen() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1100;

  const { absences } = useAbsenceStore();
  const { staff } = useStaffStore();
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  const month = selectedMonth.getMonth();
  const year = selectedMonth.getFullYear();

  const filteredAbsences = useMemo(() => {
    return absences.filter((absence) => {
      const parsedDate = fromDateString(absence.date);
      return (
        parsedDate.getMonth() === month &&
        parsedDate.getFullYear() === year &&
        absence.type !== 'Public Holiday' &&
        absence.status !== 'Rejected'
      );
    });
  }, [absences, month, year]);

  const employeeRows = useMemo(() => {
    return staff
      .filter((member) => member.active)
      .map((member) => {
        const employeeAbsences = filteredAbsences.filter((absence) => absence.staffId === member.id);
        const holidayDays = employeeAbsences
          .filter((absence) => absence.type === 'Holiday')
          .reduce((sum, absence) => sum + getDaysValue(absence), 0);
        const sickDays = employeeAbsences
          .filter((absence) => absence.type === 'Sick Leave')
          .reduce((sum, absence) => sum + getDaysValue(absence), 0);
        const totalDays = employeeAbsences.reduce((sum, absence) => sum + getDaysValue(absence), 0);

        return {
          id: member.id,
          name: member.name,
          holidays: holidayDays,
          sick: sickDays,
          total: totalDays,
        };
      })
      .sort((left, right) => right.total - left.total || left.name.localeCompare(right.name));
  }, [filteredAbsences, staff]);

  const monthlyTotalDays = filteredAbsences.reduce((sum, absence) => sum + getDaysValue(absence), 0);
  const monthlySickDays = filteredAbsences
    .filter((absence) => absence.type === 'Sick Leave')
    .reduce((sum, absence) => sum + getDaysValue(absence), 0);
  const employeesWithAbsence = employeeRows.filter((row) => row.total > 0).length;

  return (
    <ThemedView style={styles.container} useGradient>
      <ScrollView contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1180 : 920 }]}> 
          <View style={styles.headerRow}>
            <View>
              <ThemedText style={styles.title}>Reports dashboard</ThemedText>
              <ThemedText variant="secondary">Monthly absence summaries for a small team.</ThemedText>
            </View>
            <View style={styles.monthControlRow}>
              <TouchableOpacity
                testID="reports-prev-month"
                style={[styles.iconButton, { backgroundColor: colors.surfaceVariant }]}
                onPress={() => setSelectedMonth(new Date(year, month - 1, 1))}
              >
                <ChevronLeft size={18} color={colors.text} />
              </TouchableOpacity>
              <View style={[styles.monthChip, { backgroundColor: colors.surfaceVariant }]}> 
                <ThemedText style={styles.monthChipText}>
                  {selectedMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </ThemedText>
              </View>
              <TouchableOpacity
                testID="reports-next-month"
                style={[styles.iconButton, { backgroundColor: colors.surfaceVariant }]}
                onPress={() => setSelectedMonth(new Date(year, month + 1, 1))}
              >
                <ChevronRight size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: colors.surfaceVariant }]}> 
              <BarChart3 size={18} color={colors.primary} />
              <ThemedText style={styles.statValue}>{monthlyTotalDays.toFixed(1)}</ThemedText>
              <ThemedText variant="secondary">Total days off</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surfaceVariant }]}> 
              <Stethoscope size={18} color={absenceColors.sickLeave} />
              <ThemedText style={styles.statValue}>{monthlySickDays.toFixed(1)}</ThemedText>
              <ThemedText variant="secondary">Sick days</ThemedText>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surfaceVariant }]}> 
              <SunMedium size={18} color={absenceColors.holiday} />
              <ThemedText style={styles.statValue}>{employeesWithAbsence}</ThemedText>
              <ThemedText variant="secondary">Employees affected</ThemedText>
            </View>
          </View>

          <View style={[styles.tableCard, { borderColor: colors.border, backgroundColor: colors.surface }]}> 
            <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}> 
              <ThemedText style={[styles.headerCell, styles.nameCell]}>Name</ThemedText>
              <ThemedText style={styles.headerCell}>Holidays</ThemedText>
              <ThemedText style={styles.headerCell}>Sick</ThemedText>
              <ThemedText style={styles.headerCell}>Total Days</ThemedText>
            </View>

            {employeeRows.map((row) => (
              <View key={row.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}> 
                <View style={styles.nameCell}>
                  <ThemedText style={styles.employeeName}>{row.name}</ThemedText>
                </View>
                <ThemedText style={styles.tableCell}>{row.holidays.toFixed(1)}</ThemedText>
                <ThemedText style={styles.tableCell}>{row.sick.toFixed(1)}</ThemedText>
                <ThemedText style={styles.tableCell}>{row.total.toFixed(1)}</ThemedText>
              </View>
            ))}
          </View>

          <View style={styles.bottomRow}>
            <View style={[styles.insightCard, { backgroundColor: colors.surfaceVariant }]}> 
              <CalendarDays size={18} color={colors.primary} />
              <ThemedText style={styles.insightTitle}>Days off per month</ThemedText>
              <ThemedText variant="secondary">{selectedMonth.toLocaleDateString('en-GB', { month: 'long' })}: {monthlyTotalDays.toFixed(1)} days</ThemedText>
            </View>
            <View style={[styles.insightCard, { backgroundColor: colors.surfaceVariant }]}> 
              <BarChart3 size={18} color={colors.primary} />
              <ThemedText style={styles.insightTitle}>Top employee</ThemedText>
              <ThemedText variant="secondary">{employeeRows[0]?.name ?? 'No absences recorded'}{employeeRows[0] ? ` • ${employeeRows[0].total.toFixed(1)} days` : ''}</ThemedText>
            </View>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  contentDesktop: {
    alignItems: 'center',
  },
  panel: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 28,
    padding: 18,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 28,
    fontWeight: '800' as const,
  },
  monthControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  monthChipText: {
    fontWeight: '700' as const,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 180,
    borderRadius: 22,
    padding: 18,
    gap: 8,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800' as const,
  },
  tableCard: {
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  headerCell: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800' as const,
    textAlign: 'center',
  },
  nameCell: {
    flex: 2,
    justifyContent: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  tableCell: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '600' as const,
  },
  bottomRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  insightCard: {
    flex: 1,
    minWidth: 220,
    borderRadius: 22,
    padding: 18,
    gap: 8,
  },
  insightTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
  },
});
