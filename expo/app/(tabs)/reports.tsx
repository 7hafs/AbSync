import React, { useMemo, useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useColorScheme } from 'react-native';
import {
  BarChart3,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  SunMedium,
  TrendingUp,
  TrendingDown,
  Users,
  Activity,
  FileDown,
  Download,
  Building2,
  Percent,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import ThemedView from '@/components/ThemedView';
import ThemedText from '@/components/ThemedText';
import Colors, { absenceColors } from '@/constants/colors';
import useThemeStore from '@/store/useThemeStore';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';
import { Absence, StaffMember } from '@/types';
import { fromDateString, formatDateUK, getMonthName } from '@/utils/dateUtils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDaysValue(absence: Absence): number {
  return absence.duration === 'Full' ? 1 : 0.5;
}

interface EmployeeReport {
  id: string;
  name: string;
  department: string;
  holidays: number;
  sick: number;
  training: number;
  unpaid: number;
  other: number;
  total: number;
  sicknessInstances: number;
  bradfordFactor: number;
  absencePct: number;
}

interface DepartmentReport {
  name: string;
  staffCount: number;
  totalDays: number;
  sickDays: number;
  absenceRate: number;
}

interface MonthlyTrend {
  month: string;
  label: string;
  totalDays: number;
  sickDays: number;
  holidayDays: number;
  staffCount: number;
}

// ── Bradford Factor: S² × D ─────────────────────────────────────────────────

function computeBradfordFactor(employeeAbsences: Absence[]): {
  instances: number;
  factor: number;
} {
  const sickAbsences = employeeAbsences.filter((a) => a.type === 'Sickness');
  const instances = sickAbsences.length;
  const totalDays = sickAbsences.reduce((sum, a) => sum + getDaysValue(a), 0);
  const factor = instances * instances * totalDays;
  return { instances, factor: Math.round(factor * 10) / 10 };
}

// ── CSV Export ───────────────────────────────────────────────────────────────

function escapeCsv(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function exportReportCSV(
  employees: EmployeeReport[],
  trends: MonthlyTrend[],
  depts: DepartmentReport[],
  selectedMonth: Date,
): Promise<void> {
  try {
    const lines: string[] = [];

    // Header
    lines.push('AbSync — Absence Report');
    lines.push(`Month: ${selectedMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`);
    lines.push('');

    // Employee breakdown
    lines.push('EMPLOYEE BREAKDOWN');
    lines.push('Name,Department,Holidays,Sick,Training,Unpaid,Other,Total Days,Bradford Factor,Absence %');
    for (const e of employees) {
      lines.push(
        [
          escapeCsv(e.name),
          escapeCsv(e.department),
          e.holidays.toFixed(1),
          e.sick.toFixed(1),
          e.training.toFixed(1),
          e.unpaid.toFixed(1),
          e.other.toFixed(1),
          e.total.toFixed(1),
          e.bradfordFactor.toFixed(1),
          `${e.absencePct.toFixed(1)}%`,
        ].join(','),
      );
    }

    lines.push('');

    // Department breakdown
    lines.push('DEPARTMENT BREAKDOWN');
    lines.push('Department,Staff Count,Total Days,Sick Days,Absence Rate');
    for (const d of depts) {
      lines.push(
        [
          escapeCsv(d.name),
          d.staffCount,
          d.totalDays.toFixed(1),
          d.sickDays.toFixed(1),
          `${d.absenceRate.toFixed(1)}%`,
        ].join(','),
      );
    }

    lines.push('');

    // Monthly trends
    lines.push('12-MONTH TRENDS');
    lines.push('Month,Total Days,Sick Days,Holiday Days,Staff Count');
    for (const t of trends) {
      lines.push(
        [escapeCsv(t.label), t.totalDays.toFixed(1), t.sickDays.toFixed(1), t.holidayDays.toFixed(1), t.staffCount].join(','),
      );
    }

    const csv = lines.join('\n');
    const fileName = `absync-report-${selectedMonth.toISOString().split('T')[0]}.csv`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(filePath, {
        mimeType: 'text/csv',
        dialogTitle: 'Export Absence Report',
      });
    } else {
      Alert.alert('Report saved', `CSV saved to ${filePath}`);
    }
  } catch (err) {
    console.error('[Reports] Export error:', err);
    Alert.alert('Export failed', 'Could not export the report. Please try again.');
  }
}

// ── Component ────────────────────────────────────────────────────────────────

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
  const [exporting, setExporting] = useState(false);

  const month = selectedMonth.getMonth();
  const year = selectedMonth.getFullYear();

  // ── Monthly employee report ──────────────────────────────────────────────

  const employeeRows: EmployeeReport[] = useMemo(() => {
    const monthAbsences = absences.filter((a) => {
      const d = fromDateString(a.date);
      return (
        d.getMonth() === month &&
        d.getFullYear() === year &&
        a.type !== 'Public Holiday' &&
        a.status !== 'Rejected'
      );
    });

    const workingDaysInMonth = (() => {
      let count = 0;
      const d = new Date(year, month, 1);
      while (d.getMonth() === month) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) count++;
        d.setDate(d.getDate() + 1);
      }
      return count;
    })();

    return staff
      .filter((m) => m.active)
      .map((member) => {
        const empAbsences = monthAbsences.filter((a) => a.staffId === member.id);
        const holidayDays = empAbsences
          .filter((a) => a.type === 'Holiday')
          .reduce((sum, a) => sum + getDaysValue(a), 0);
        const sickDays = empAbsences
          .filter((a) => a.type === 'Sickness')
          .reduce((sum, a) => sum + getDaysValue(a), 0);
        const trainingDays = empAbsences
          .filter((a) => a.type === 'Training')
          .reduce((sum, a) => sum + getDaysValue(a), 0);
        const unpaidDays = empAbsences
          .filter((a) => a.type === 'Unpaid Leave')
          .reduce((sum, a) => sum + getDaysValue(a), 0);
        const otherDays = empAbsences
          .filter((a) => a.type === 'Other')
          .reduce((sum, a) => sum + getDaysValue(a), 0);
        const totalDays = holidayDays + sickDays + trainingDays + unpaidDays + otherDays;
        const { instances, factor } = computeBradfordFactor(empAbsences);
        const absencePct = workingDaysInMonth > 0 ? (totalDays / workingDaysInMonth) * 100 : 0;

        return {
          id: member.id,
          name: member.name,
          department: member.department ?? 'Unassigned',
          holidays: holidayDays,
          sick: sickDays,
          training: trainingDays,
          unpaid: unpaidDays,
          other: otherDays,
          total: totalDays,
          sicknessInstances: instances,
          bradfordFactor: factor,
          absencePct: Math.round(absencePct * 10) / 10,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [absences, staff, month, year]);

  // ── Department report ─────────────────────────────────────────────────────

  const deptRows: DepartmentReport[] = useMemo(() => {
    const deptMap = new Map<string, { staff: StaffMember[]; absences: Absence[] }>();

    for (const m of staff.filter((s) => s.active)) {
      const dept = m.department ?? 'Unassigned';
      if (!deptMap.has(dept)) deptMap.set(dept, { staff: [], absences: [] });
      deptMap.get(dept)!.staff.push(m);
    }

    const monthAbsences = absences.filter((a) => {
      const d = fromDateString(a.date);
      return (
        d.getMonth() === month &&
        d.getFullYear() === year &&
        a.type !== 'Public Holiday' &&
        a.status !== 'Rejected'
      );
    });

    for (const [dept, entry] of deptMap) {
      const staffIds = new Set(entry.staff.map((s) => s.id));
      entry.absences = monthAbsences.filter((a) => a.staffId && staffIds.has(a.staffId));
    }

    return Array.from(deptMap.entries())
      .map(([name, entry]) => {
        const totalDays = entry.absences.reduce((sum, a) => sum + getDaysValue(a), 0);
        const sickDays = entry.absences
          .filter((a) => a.type === 'Sickness')
          .reduce((sum, a) => sum + getDaysValue(a), 0);
        const workingDays = (() => {
          let count = 0;
          const d = new Date(year, month, 1);
          while (d.getMonth() === month) {
            const day = d.getDay();
            if (day !== 0 && day !== 6) count++;
            d.setDate(d.getDate() + 1);
          }
          return count;
        })();
        const maxPossible = entry.staff.length * workingDays;
        const absenceRate = maxPossible > 0 ? (totalDays / maxPossible) * 100 : 0;

        return {
          name,
          staffCount: entry.staff.length,
          totalDays,
          sickDays,
          absenceRate: Math.round(absenceRate * 10) / 10,
        };
      })
      .sort((a, b) => b.totalDays - a.totalDays);
  }, [absences, staff, month, year]);

  // ── 12-month trends ───────────────────────────────────────────────────────

  const monthlyTrends: MonthlyTrend[] = useMemo(() => {
    const trends: MonthlyTrend[] = [];
    const activeStaff = staff.filter((s) => s.active);

    for (let i = 11; i >= 0; i--) {
      const trendDate = new Date(year, month - i, 1);
      const trendMonth = trendDate.getMonth();
      const trendYear = trendDate.getFullYear();

      const monthAbsences = absences.filter((a) => {
        const d = fromDateString(a.date);
        return (
          d.getMonth() === trendMonth &&
          d.getFullYear() === trendYear &&
          a.type !== 'Public Holiday' &&
          a.status !== 'Rejected'
        );
      });

      trends.push({
        month: `${trendYear}-${String(trendMonth + 1).padStart(2, '0')}`,
        label: getMonthName(trendMonth).slice(0, 3),
        totalDays: monthAbsences.reduce((sum, a) => sum + getDaysValue(a), 0),
        sickDays: monthAbsences
          .filter((a) => a.type === 'Sickness')
          .reduce((sum, a) => sum + getDaysValue(a), 0),
        holidayDays: monthAbsences
          .filter((a) => a.type === 'Holiday')
          .reduce((sum, a) => sum + getDaysValue(a), 0),
        staffCount: activeStaff.length,
      });
    }

    return trends;
  }, [absences, staff, month, year]);

  // ── Summary stats ─────────────────────────────────────────────────────────

  const monthlyTotalDays = employeeRows.reduce((sum, e) => sum + e.total, 0);
  const monthlySickDays = employeeRows.reduce((sum, e) => sum + e.sick, 0);
  const employeesWithAbsence = employeeRows.filter((e) => e.total > 0).length;
  const totalStaff = employeeRows.length;
  const overallAbsenceRate = totalStaff > 0 ? (monthlyTotalDays / (totalStaff * 20)) * 100 : 0;

  const prevMonthTrend = monthlyTrends.length >= 2
    ? monthlyTrends[monthlyTrends.length - 1].totalDays - monthlyTrends[monthlyTrends.length - 2].totalDays
    : 0;

  const maxTrendDays = Math.max(...monthlyTrends.map((t) => t.totalDays), 1);

  // ── Export handler ────────────────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExporting(true);
    await exportReportCSV(employeeRows, monthlyTrends, deptRows, selectedMonth);
    setExporting(false);
  }, [employeeRows, monthlyTrends, deptRows, selectedMonth]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container} useGradient>
      <ScrollView
        contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.panel,
            { backgroundColor: colors.card, borderColor: colors.border, maxWidth: isDesktop ? 1180 : undefined },
          ]}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={styles.headerRow}>
            <View>
              <ThemedText style={styles.title}>Reports</ThemedText>
              <ThemedText variant="secondary" style={styles.subtitle}>
                Absence analytics & trends
              </ThemedText>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={[styles.exportBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                onPress={handleExport}
                disabled={exporting}
                activeOpacity={0.7}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <FileDown size={16} color={colors.primary} />
                    <ThemedText style={[styles.exportBtnText, { color: colors.primary }]}>
                      Export CSV
                    </ThemedText>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Month selector ──────────────────────────────────────────── */}
          <View style={styles.monthControlRow}>
            <TouchableOpacity
              testID="reports-prev-month"
              style={[styles.iconButton, { backgroundColor: colors.surfaceVariant }]}
              onPress={() => setSelectedMonth(new Date(year, month - 1, 1))}
            >
              <ChevronLeft size={18} color={colors.text} />
            </TouchableOpacity>
            <View style={[styles.monthChip, { backgroundColor: colors.surfaceVariant }]}>
              <CalendarDays size={16} color={colors.primary} style={{ marginRight: 8 }} />
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

          {/* ── KPI cards ───────────────────────────────────────────────── */}
          <View style={styles.kpiRow}>
            <View style={[styles.kpiCard, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.kpiIconWrap}>
                <CalendarDays size={18} color={colors.primary} />
              </View>
              <ThemedText style={styles.kpiValue}>{monthlyTotalDays.toFixed(1)}</ThemedText>
              <ThemedText variant="secondary" style={styles.kpiLabel}>Total days off</ThemedText>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.kpiIconWrap}>
                <Stethoscope size={18} color={absenceColors.sickness} />
              </View>
              <ThemedText style={[styles.kpiValue, { color: absenceColors.sickness }]}>
                {monthlySickDays.toFixed(1)}
              </ThemedText>
              <ThemedText variant="secondary" style={styles.kpiLabel}>Sick days</ThemedText>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.kpiIconWrap}>
                <Users size={18} color="#7C3AED" />
              </View>
              <ThemedText style={[styles.kpiValue, { color: '#7C3AED' }]}>
                {employeesWithAbsence}
              </ThemedText>
              <ThemedText variant="secondary" style={styles.kpiLabel}>Staff absent</ThemedText>
            </View>
            <View style={[styles.kpiCard, { backgroundColor: colors.surfaceVariant }]}>
              <View style={styles.kpiIconWrap}>
                <Percent size={18} color="#EA580C" />
              </View>
              <ThemedText style={[styles.kpiValue, { color: '#EA580C' }]}>
                {overallAbsenceRate.toFixed(1)}%
              </ThemedText>
              <ThemedText variant="secondary" style={styles.kpiLabel}>Absence rate</ThemedText>
            </View>
          </View>

          {/* ── 12-Month trend chart ────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={16} color={colors.text} />
              <ThemedText style={styles.sectionTitle}>12-Month Trend</ThemedText>
              {prevMonthTrend !== 0 && (
                <View style={[styles.trendBadge, {
                  backgroundColor: prevMonthTrend < 0 ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                }]}>
                  {prevMonthTrend < 0 ? (
                    <TrendingDown size={12} color="#16A34A" />
                  ) : (
                    <TrendingUp size={12} color="#DC2626" />
                  )}
                  <ThemedText style={{
                    fontSize: 11,
                    fontWeight: '700' as const,
                    color: prevMonthTrend < 0 ? '#16A34A' : '#DC2626',
                  }}>
                    {prevMonthTrend > 0 ? '+' : ''}{prevMonthTrend.toFixed(1)} vs prev
                  </ThemedText>
                </View>
              )}
            </View>

            <View style={[styles.trendChart, { backgroundColor: colors.surface }]}>
              {/* Y-axis labels */}
              <View style={styles.trendYAxis}>
                <ThemedText variant="secondary" style={styles.trendYLabel}>
                  {maxTrendDays.toFixed(0)}
                </ThemedText>
                <ThemedText variant="secondary" style={styles.trendYLabel}>
                  {(maxTrendDays / 2).toFixed(0)}
                </ThemedText>
                <ThemedText variant="secondary" style={styles.trendYLabel}>0</ThemedText>
              </View>

              {/* Bars */}
              <View style={styles.trendBars}>
                {monthlyTrends.map((t, i) => {
                  const barHeight = t.totalDays > 0
                    ? Math.max((t.totalDays / maxTrendDays) * 120, 8)
                    : 3;
                  const isCurrent = i === monthlyTrends.length - 1;
                  return (
                    <View key={t.month} style={styles.trendBarCol}>
                      <View style={styles.trendBarWrap}>
                        <View
                          style={[
                            styles.trendBar,
                            {
                              height: barHeight,
                              backgroundColor: isCurrent
                                ? colors.primary
                                : `${colors.primary}55`,
                              borderRadius: 4,
                            },
                          ]}
                        />
                      </View>
                      <ThemedText
                        variant="secondary"
                        style={[
                          styles.trendBarLabel,
                          isCurrent && { color: colors.primary, fontWeight: '800' as const },
                        ]}
                      >
                        {t.label}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* ── Employee breakdown table ─────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Users size={16} color={colors.text} />
              <ThemedText style={styles.sectionTitle}>Employee Breakdown</ThemedText>
              <ThemedText variant="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                ({employeeRows.length} active staff)
              </ThemedText>
            </View>

            <View style={[styles.tableCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
                <ThemedText style={[styles.headerCell, styles.nameCol]}>Name</ThemedText>
                <ThemedText style={styles.headerCell}>Holiday</ThemedText>
                <ThemedText style={styles.headerCell}>Sick</ThemedText>
                <ThemedText style={styles.headerCell}>Other</ThemedText>
                <ThemedText style={styles.headerCell}>Total</ThemedText>
                <ThemedText style={[styles.headerCell, styles.bradfordCol]}>Bradford</ThemedText>
                <ThemedText style={styles.headerCell}>Rate</ThemedText>
              </View>

              {employeeRows.slice(0, 20).map((row) => (
                <View key={row.id} style={[styles.tableRow, { borderBottomColor: colors.border }]}>
                  <View style={styles.nameCol}>
                    <ThemedText style={styles.employeeName} numberOfLines={1}>{row.name}</ThemedText>
                    <ThemedText variant="secondary" style={styles.employeeDept} numberOfLines={1}>
                      {row.department}
                    </ThemedText>
                  </View>
                  <ThemedText style={[styles.tableCell, { color: absenceColors.holiday }]}>
                    {row.holidays.toFixed(1)}
                  </ThemedText>
                  <ThemedText style={[styles.tableCell, { color: absenceColors.sickness }]}>
                    {row.sick.toFixed(1)}
                  </ThemedText>
                  <ThemedText style={styles.tableCell}>
                    {(row.training + row.unpaid + row.other).toFixed(1)}
                  </ThemedText>
                  <ThemedText style={[styles.tableCell, { fontWeight: '800' as const }]}>
                    {row.total.toFixed(1)}
                  </ThemedText>
                  <ThemedText
                    style={[
                      styles.tableCell,
                      styles.bradfordCol,
                      {
                        color: row.bradfordFactor > 50
                          ? '#DC2626'
                          : row.bradfordFactor > 20
                            ? '#F59E0B'
                            : '#16A34A',
                      },
                    ]}
                  >
                    {row.bradfordFactor.toFixed(0)}
                  </ThemedText>
                  <ThemedText style={styles.tableCell}>{row.absencePct}%</ThemedText>
                </View>
              ))}

              {employeeRows.length > 20 && (
                <View style={[styles.tableFooter, { borderTopColor: colors.border }]}>
                  <ThemedText variant="secondary" style={{ fontSize: 12 }}>
                    +{employeeRows.length - 20} more employees (export CSV for full list)
                  </ThemedText>
                </View>
              )}

              {employeeRows.length === 0 && (
                <View style={styles.tableFooter}>
                  <ThemedText variant="secondary">No absences recorded this month.</ThemedText>
                </View>
              )}
            </View>
          </View>

          {/* ── Department breakdown ─────────────────────────────────────── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Building2 size={16} color={colors.text} />
              <ThemedText style={styles.sectionTitle}>Department Breakdown</ThemedText>
            </View>

            <View style={styles.deptGrid}>
              {deptRows.map((dept) => (
                <View
                  key={dept.name}
                  style={[styles.deptCard, { backgroundColor: colors.surfaceVariant }]}
                >
                  <ThemedText style={styles.deptName} weight="semibold" numberOfLines={1}>
                    {dept.name}
                  </ThemedText>
                  <View style={styles.deptStats}>
                    <View style={styles.deptStat}>
                      <ThemedText style={styles.deptStatValue}>{dept.staffCount}</ThemedText>
                      <ThemedText variant="secondary" style={styles.deptStatLabel}>Staff</ThemedText>
                    </View>
                    <View style={styles.deptStat}>
                      <ThemedText style={[styles.deptStatValue, { color: absenceColors.sickness }]}>
                        {dept.sickDays.toFixed(1)}
                      </ThemedText>
                      <ThemedText variant="secondary" style={styles.deptStatLabel}>Sick Days</ThemedText>
                    </View>
                    <View style={styles.deptStat}>
                      <ThemedText style={[styles.deptStatValue, { color: '#EA580C' }]}>
                        {dept.absenceRate}%
                      </ThemedText>
                      <ThemedText variant="secondary" style={styles.deptStatLabel}>Rate</ThemedText>
                    </View>
                  </View>

                  {/* Mini bar: absence rate visual */}
                  <View style={[styles.deptBar, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.deptBarFill,
                        {
                          width: `${Math.min(dept.absenceRate, 100)}%`,
                          backgroundColor: dept.absenceRate > 10
                            ? '#DC2626'
                            : dept.absenceRate > 5
                              ? '#F59E0B'
                              : '#16A34A',
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
              {deptRows.length === 0 && (
                <ThemedText variant="secondary">No department data available.</ThemedText>
              )}
            </View>
          </View>

          {/* ── Bradford Factor legend ───────────────────────────────────── */}
          <View style={[styles.legendCard, { backgroundColor: colors.surfaceVariant }]}>
            <Activity size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.legendTitle} weight="semibold">
                Bradford Factor Guide
              </ThemedText>
              <ThemedText variant="secondary" style={styles.legendText}>
                <ThemedText style={{ color: '#16A34A', fontWeight: '700' as const }}>0–20</ThemedText>
                {' '}Low concern •{' '}
                <ThemedText style={{ color: '#F59E0B', fontWeight: '700' as const }}>21–50</ThemedText>
                {' '}Monitor •{' '}
                <ThemedText style={{ color: '#DC2626', fontWeight: '700' as const }}>50+</ThemedText>
                {' '}Review needed
              </ThemedText>
              <ThemedText variant="secondary" style={styles.legendFormula}>
                Formula: (Sickness instances)² × Total sick days
              </ThemedText>
            </View>
          </View>

          {/* ── Quick summary ────────────────────────────────────────────── */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryCard, { backgroundColor: colors.surfaceVariant }]}>
              <SunMedium size={16} color={absenceColors.holiday} />
              <ThemedText style={styles.summaryLabel}>
                {employeeRows.filter((e) => e.holidays > 0).length} staff on holiday
              </ThemedText>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.surfaceVariant }]}>
              <Stethoscope size={16} color={absenceColors.sickness} />
              <ThemedText style={styles.summaryLabel}>
                {employeeRows.filter((e) => e.sick > 0).length} staff off sick
              </ThemedText>
            </View>
            <View style={[styles.summaryCard, { backgroundColor: colors.surfaceVariant }]}>
              <BarChart3 size={16} color={colors.primary} />
              <ThemedText style={styles.summaryLabel}>
                {employeeRows.filter((e) => e.bradfordFactor > 50).length} staff need review
              </ThemedText>
            </View>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  contentDesktop: { alignItems: 'center' },
  panel: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 28,
    padding: 20,
    gap: 22,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerRight: { flexDirection: 'row', gap: 8 },
  title: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 2 },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  exportBtnText: { fontSize: 13, fontWeight: '700' as const },

  // Month selector
  monthControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  monthChipText: { fontWeight: '700' as const, fontSize: 15 },

  // KPI cards
  kpiRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  kpiCard: {
    flex: 1,
    minWidth: 130,
    borderRadius: 22,
    padding: 16,
    gap: 4,
  },
  kpiIconWrap: { marginBottom: 4 },
  kpiValue: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
  kpiLabel: { fontSize: 11, fontWeight: '600' as const },

  // Sections
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' as const },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  // Trend chart
  trendChart: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 14,
    paddingBottom: 10,
  },
  trendYAxis: {
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingRight: 8,
    height: 140,
  },
  trendYLabel: { fontSize: 10 },
  trendBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 140,
  },
  trendBarCol: { alignItems: 'center', flex: 1, gap: 4 },
  trendBarWrap: { height: 120, justifyContent: 'flex-end' },
  trendBar: { width: 8 },
  trendBarLabel: { fontSize: 9, fontWeight: '600' as const },

  // Table
  tableCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  headerCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800' as const,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  nameCol: { flex: 1.8, justifyContent: 'center' },
  bradfordCol: { flex: 1.3 },
  employeeName: { fontSize: 13, fontWeight: '700' as const },
  employeeDept: { fontSize: 10 },
  tableCell: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' as const },
  tableFooter: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },

  // Department grid
  deptGrid: { gap: 10 },
  deptCard: { borderRadius: 18, padding: 16, gap: 10 },
  deptName: { fontSize: 15 },
  deptStats: { flexDirection: 'row', gap: 16 },
  deptStat: { gap: 1 },
  deptStatValue: { fontSize: 18, fontWeight: '800' as const },
  deptStatLabel: { fontSize: 10, fontWeight: '600' as const },
  deptBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  deptBarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // Legend
  legendCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    padding: 14,
  },
  legendTitle: { fontSize: 14, marginBottom: 4 },
  legendText: { fontSize: 12 },
  legendFormula: { fontSize: 11, marginTop: 4, fontStyle: 'italic' as const },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    padding: 14,
  },
  summaryLabel: { fontSize: 12, fontWeight: '600' as const, flex: 1 },
});
