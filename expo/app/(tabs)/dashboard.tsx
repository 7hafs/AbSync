import React, { useMemo, useState, useCallback } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Sunrise,
  Sunset,
  Calendar,
  Users,
  UserCheck,
  UserX,
  TrendingUp,
  AlertTriangle,
  PlusCircle,
  UserPlus,
  Upload,
  FileText,
  Bell,
  ChevronRight,
  User,
  Building2,
} from 'lucide-react-native';
import { useColorScheme } from 'react-native';
import ThemedText from '@/components/ThemedText';
import ThemedView from '@/components/ThemedView';
import SyncIndicator from '@/components/SyncIndicator';
import Colors, { absenceColors, dotColors } from '@/constants/colors';
import { useSupabaseAuth } from '@/hooks/useSupabaseAuth';
import useThemeStore from '@/store/useThemeStore';
import { loadAllFromSupabase } from '@/lib/syncService';
import useAbsenceStore from '@/store/useAbsenceStore';
import useStaffStore from '@/store/useStaffStore';
import { AbsenceType } from '@/types';
import {
  toDateString,
  todayDateString,
  getMondayOfWeek,
  addDays,
  getWeekDatesFromDate,
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

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DashboardScreen() {
  const router = useRouter();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? 'dark' : 'light';
  const colors = Colors[colorScheme || 'light'];
  const { width } = useWindowDimensions();

  const { absences, replaceAbsences } = useAbsenceStore();
  const { staff, replaceStaff } = useStaffStore();
  const { profile } = useSupabaseAuth();

  // ── Pull-to-refresh ───────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await loadAllFromSupabase();
      if (data.staff.length > 0) replaceStaff(data.staff);
      if (data.absences.length > 0) replaceAbsences(data.absences);
    } catch (err) {
      console.warn('[Dashboard] Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  }, [replaceAbsences, replaceStaff]);

  // ── Focus refresh ─────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      onRefresh();
    }, [onRefresh])
  );

  const todayIso = todayDateString();

  // Today's absences (non-rejected, non-public-holiday)
  const todayAbsences = useMemo(
    () =>
      absences.filter(
        (a) => a.date === todayIso && a.type !== 'Public Holiday' && a.status !== 'Rejected',
      ),
    [absences, todayIso],
  );

  const todayAmCount = todayAbsences.filter((a) => a.duration === 'AM').length;
  const todayPmCount = todayAbsences.filter((a) => a.duration === 'PM').length;
  const todayFullCount = todayAbsences.filter((a) => a.duration === 'Full').length;
  const todayTotalStaff = new Set(todayAbsences.map((a) => a.staffId)).size;

  // Active staff count
  const activeStaffCount = staff.filter((s) => s.active).length;
  const inactiveStaffCount = staff.filter((s) => !s.active).length;
  const totalStaffCount = staff.length;

  // This week absences (Mon-Sun)
  const weekStats = useMemo(() => {
    const monday = getMondayOfWeek(new Date());
    const weekDates = getWeekDatesFromDate(new Date());
    return weekDates.map((d, i) => {
      const dateStr = toDateString(d);
      const dayAbsences = absences.filter(
        (a) =>
          a.date === dateStr && a.type !== 'Public Holiday' && a.status !== 'Rejected',
      );
      return {
        day: DAY_LABELS[i],
        date: dateStr,
        count: new Set(dayAbsences.map((a) => a.staffId)).size,
        isToday: dateStr === todayIso,
      };
    });
  }, [absences, todayIso]);

  const weekTotal = weekStats.reduce((sum, d) => sum + d.count, 0);
  const maxBarCount = Math.max(...weekStats.map((d) => d.count), 1);

  // Alerts: days in the next 14 days with high absence count (>= 3 staff)
  const alerts = useMemo(() => {
    const today = new Date();
    const twoWeeksOut = addDays(today, 14);
    const todayStr = toDateString(today);
    const endStr = toDateString(twoWeeksOut);

    const dateMap = new Map<string, { count: number; names: string[]; types: AbsenceType[] }>();
    absences
      .filter(
        (a) =>
          a.date >= todayStr &&
          a.date <= endStr &&
          a.type !== 'Public Holiday' &&
          a.status !== 'Rejected',
      )
      .forEach((a) => {
        const entry = dateMap.get(a.date) || { count: 0, names: [], types: [] };
        if (!entry.names.includes(a.name)) {
          entry.names.push(a.name);
          entry.count++;
        }
        entry.types.push(a.type);
        dateMap.set(a.date, entry);
      });

    return Array.from(dateMap.entries())
      .filter(([, entry]) => entry.count >= 3)
      .map(([date, entry]) => {
        const d = new Date(date + 'T12:00:00');
        const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
        const dayMonth = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        const mainType = entry.types.sort(
          (a, b) => entry.types.filter((t) => t === b).length - entry.types.filter((t) => t === a).length,
        )[0];
        return {
          date,
          count: entry.count,
          label: `${weekday} ${dayMonth}`,
          type: mainType,
          names: entry.names,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3);
  }, [absences]);

  // Time-based greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const displayName = useMemo(() => {
    const fullName = profile?.name?.trim();
    if (fullName) return fullName.split(' ')[0];
    // Fallback to email prefix when name is missing
    const emailAddr = profile?.email?.trim();
    if (emailAddr) {
      const atIndex = emailAddr.indexOf('@');
      if (atIndex > 0) {
        const prefix = emailAddr.substring(0, atIndex);
        return prefix.charAt(0).toUpperCase() + prefix.slice(1);
      }
    }
    return null;
  }, [profile?.name, profile?.email]);

  const greetingText = displayName ? `${greeting}, ${displayName} 👋` : 'Welcome back 👋';

  // Today's date display
  const todayDateDisplay = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  const handleAddAbsence = () => {
    router.push('/calendar/absence-form' as never);
  };

  const handleAddStaff = () => {
    router.push('/staff/staff-form' as never);
  };

  const handleImportStaff = () => {
    router.push('/staff/bulk-import' as never);
  };

  const handleReports = () => {
    router.push('/(tabs)/reports' as never);
  };

  const handleTotalStaff = () => {
    router.push('/(tabs)/staff' as never);
  };

  const handleActiveStaff = () => {
    router.push({ pathname: '/(tabs)/staff' as never, params: { filter: 'active' } });
  };

  const handleInactiveStaff = () => {
    router.push({ pathname: '/(tabs)/staff' as never, params: { filter: 'inactive' } });
  };

  return (
    <ThemedView style={styles.container}>
      {/* Sync Status Bar */}
      <SyncIndicator />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <ThemedText style={styles.headerTitle} weight="bold">
            {greetingText}
          </ThemedText>
          <ThemedText variant="secondary" style={styles.headerDate}>
            {todayDateDisplay}
          </ThemedText>
          {/* Workspace indicator */}
          <TouchableOpacity
            style={[
              styles.workspacePill,
              {
                backgroundColor:
                  profile?.workspaceMode === 'organisation'
                    ? 'rgba(99, 102, 241, 0.1)'
                    : 'rgba(15, 118, 110, 0.1)',
                borderColor:
                  profile?.workspaceMode === 'organisation'
                    ? 'rgba(99, 102, 241, 0.25)'
                    : 'rgba(15, 118, 110, 0.25)',
              },
            ]}
            onPress={() => router.push('/settings/workspace' as never)}
            activeOpacity={0.7}
          >
            {profile?.workspaceMode === 'organisation' ? (
              <>
                <View style={[styles.workspaceDot, { backgroundColor: '#6366F1' }]} />
                <ThemedText style={[styles.workspacePillText, { color: '#4F46E5' }]} numberOfLines={1}>
                  Organisation Workspace
                </ThemedText>
              </>
            ) : (
              <>
                <View style={[styles.workspaceDot, { backgroundColor: colors.primary }]} />
                <ThemedText style={[styles.workspacePillText, { color: colors.primary }]} numberOfLines={1}>
                  Personal Workspace
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
          {!profile?.workspaceMode && (
            <ThemedText variant="secondary" size="small" style={{ marginTop: 2 }}>
              Tap to set up your workspace
            </ThemedText>
          )}
        </View>
        <TouchableOpacity
          style={[styles.notifyBtn, { backgroundColor: colors.surfaceVariant }]}
          activeOpacity={0.7}
        >
          <Bell size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {/* Section 1: Today's Absences */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle} weight="semibold">
            Today's Absences
          </ThemedText>

          {/* Three stat cards */}
          <View style={styles.statRow}>
            {/* AM Card */}
            <View style={[styles.statCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <View style={[styles.statIconWrap, { backgroundColor: '#DCFCE7' }]}>
                <Sunrise size={20} color="#16A34A" />
              </View>
              <ThemedText style={[styles.statValue, { color: '#16A34A' }]}>
                {todayAmCount}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: '#15803D' }]}>AM</ThemedText>
            </View>

            {/* PM Card */}
            <View style={[styles.statCard, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
              <View style={[styles.statIconWrap, { backgroundColor: '#EDE9FE' }]}>
                <Sunset size={20} color="#7C3AED" />
              </View>
              <ThemedText style={[styles.statValue, { color: '#7C3AED' }]}>
                {todayPmCount}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: '#6D28D9' }]}>PM</ThemedText>
            </View>

            {/* Full Day Card */}
            <View style={[styles.statCard, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
              <View style={[styles.statIconWrap, { backgroundColor: '#FFEDD5' }]}>
                <Calendar size={20} color="#EA580C" />
              </View>
              <ThemedText style={[styles.statValue, { color: '#EA580C' }]}>
                {todayFullCount}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: '#C2410C' }]}>Full Day</ThemedText>
            </View>
          </View>

          {/* Total Staff Absent */}
          <View style={[styles.totalRow, { backgroundColor: colors.surfaceVariant }]}>
            <View style={styles.totalLeft}>
              <Users size={18} color={colors.text} />
              <ThemedText style={styles.totalLabel}>Total Staff Absent</ThemedText>
            </View>
            <View style={styles.totalRight}>
              <ThemedText style={[styles.totalValue, { color: colors.primary }]}>
                {todayTotalStaff}
              </ThemedText>
              <ThemedText variant="secondary" style={styles.totalSubtext}>
                of {activeStaffCount}
              </ThemedText>
            </View>
          </View>
        </View>

        {/* Section 2: Staff Overview */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle} weight="semibold">
            Staff Overview
          </ThemedText>

          <View style={styles.statRow}>
            {/* Total Staff Card */}
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
              activeOpacity={0.7}
              onPress={handleTotalStaff}
            >
              <View style={[styles.statIconWrap, { backgroundColor: '#DBEAFE' }]}>
                <Users size={20} color="#2563EB" />
              </View>
              <ThemedText style={[styles.statValue, { color: '#2563EB' }]}>
                {totalStaffCount}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: '#1D4ED8' }]}>Total Staff</ThemedText>
            </TouchableOpacity>

            {/* Active Staff Card */}
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
              activeOpacity={0.7}
              onPress={handleActiveStaff}
            >
              <View style={[styles.statIconWrap, { backgroundColor: '#DCFCE7' }]}>
                <UserCheck size={20} color="#16A34A" />
              </View>
              <ThemedText style={[styles.statValue, { color: '#16A34A' }]}>
                {activeStaffCount}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: '#15803D' }]}>Active</ThemedText>
            </TouchableOpacity>

            {/* Inactive Staff Card */}
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' }]}
              activeOpacity={0.7}
              onPress={handleInactiveStaff}
            >
              <View style={[styles.statIconWrap, { backgroundColor: '#F3F4F6' }]}>
                <UserX size={20} color="#6B7280" />
              </View>
              <ThemedText style={[styles.statValue, { color: '#6B7280' }]}>
                {inactiveStaffCount}
              </ThemedText>
              <ThemedText style={[styles.statLabel, { color: '#4B5563' }]}>Inactive</ThemedText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 3: Secondary Info */}
        <View style={styles.secondaryRow}>
          {/* This Week Card */}
          <View style={[styles.halfCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.halfCardHeader}>
              <TrendingUp size={16} color={colors.primary} />
              <ThemedText style={styles.halfCardTitle} weight="semibold">This Week</ThemedText>
            </View>
            <ThemedText style={styles.weekTotalNum}>{weekTotal}</ThemedText>
            <ThemedText variant="secondary" style={styles.weekTotalLabel}>
              total absences
            </ThemedText>

            {/* Mini bar chart */}
            <View style={styles.barChart}>
              {weekStats.map((day) => {
                const barHeight = day.count > 0 ? Math.max((day.count / maxBarCount) * 48, 8) : 4;
                return (
                  <View key={day.day} style={styles.barCol}>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: barHeight,
                          backgroundColor: day.isToday
                            ? colors.primary
                            : day.count > 0
                              ? `${colors.primary}60`
                              : colors.border,
                          borderRadius: 4,
                        },
                      ]}
                    />
                    <ThemedText
                      variant="secondary"
                      style={[styles.barLabel, day.isToday && { color: colors.primary, fontWeight: '700' as const }]}
                    >
                      {day.day}
                    </ThemedText>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Alerts Card */}
          <View style={[styles.halfCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.halfCardHeader}>
              <AlertTriangle size={16} color={dotColors.amber} />
              <ThemedText style={styles.halfCardTitle} weight="semibold">Alerts</ThemedText>
            </View>

            {alerts.length === 0 ? (
              <View style={styles.alertsEmpty}>
                <ThemedText variant="secondary" style={styles.alertsEmptyText}>
                  No staffing warnings
                </ThemedText>
              </View>
            ) : (
              <View style={styles.alertsList}>
                {alerts.map((alert) => (
                  <TouchableOpacity
                    key={alert.date}
                    style={[styles.alertItem, { backgroundColor: '#FFFBEB' }]}
                    activeOpacity={0.7}
                    onPress={() =>
                      router.push({
                        pathname: '/calendar/day-absences' as never,
                        params: { date: alert.date },
                      })
                    }
                  >
                    <View style={styles.alertLeft}>
                      <View style={[styles.alertDot, { backgroundColor: getTypeColor(alert.type) }]} />
                      <View style={styles.alertInfo}>
                        <ThemedText style={styles.alertDate} weight="semibold" numberOfLines={1}>
                          {alert.label}
                        </ThemedText>
                        <ThemedText variant="secondary" style={styles.alertDesc} numberOfLines={1}>
                          {alert.count} staff absent
                        </ThemedText>
                      </View>
                    </View>
                    <ChevronRight size={14} color={colors.secondaryText} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Section 4: Quick Actions */}
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle} weight="semibold">
            Quick Actions
          </ThemedText>

          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={handleAddAbsence}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#DCFCE7' }]}>
                <PlusCircle size={22} color="#16A34A" />
              </View>
              <ThemedText style={styles.actionLabel} weight="semibold">New Absence</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={handleAddStaff}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#EDE9FE' }]}>
                <UserPlus size={22} color="#7C3AED" />
              </View>
              <ThemedText style={styles.actionLabel} weight="semibold">New Staff</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={handleImportStaff}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
                <Upload size={22} color="#D97706" />
              </View>
              <ThemedText style={styles.actionLabel} weight="semibold">Import Staff</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              activeOpacity={0.7}
              onPress={handleReports}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#FEE2E2' }]}>
                <FileText size={22} color="#DC2626" />
              </View>
              <ThemedText style={styles.actionLabel} weight="semibold">Reports</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerLeft: { gap: 2 },
  headerTitle: { fontSize: 26, letterSpacing: -0.5 },
  headerDate: { fontSize: 13 },
  workspacePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  workspaceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  workspacePillText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  notifyBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },

  content: { padding: 20, paddingBottom: 100, gap: 24 },

  // Section
  section: { gap: 14 },
  sectionTitle: { fontSize: 17, letterSpacing: -0.2 },

  // Stat cards
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 6,
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -1 },
  statLabel: { fontSize: 12, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.5 },

  // Total row
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  totalLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  totalLabel: { fontSize: 15, fontWeight: '600' as const },
  totalRight: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  totalValue: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.5 },
  totalSubtext: { fontSize: 13 },

  // Secondary row
  secondaryRow: { flexDirection: 'row', gap: 12 },
  halfCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  halfCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  halfCardTitle: { fontSize: 14 },

  // This Week
  weekTotalNum: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -1 },
  weekTotalLabel: { fontSize: 11, marginTop: -4 },

  // Bar chart
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 64,
    paddingTop: 4,
  },
  barCol: { alignItems: 'center', gap: 4, flex: 1 },
  bar: { width: 6 },
  barLabel: { fontSize: 10, fontWeight: '600' as const },

  // Alerts
  alertsEmpty: { paddingVertical: 8 },
  alertsEmptyText: { fontSize: 12, fontStyle: 'italic' as const },
  alertsList: { gap: 6 },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  alertLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  alertDot: { width: 8, height: 8, borderRadius: 4 },
  alertInfo: { flex: 1, gap: 1 },
  alertDate: { fontSize: 12 },
  alertDesc: { fontSize: 10 },

  // Quick Actions
  actionsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 10,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 11, textAlign: 'center' },
});
