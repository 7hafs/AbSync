import React, { useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, Text } from "react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useAbsenceStore from "@/store/useAbsenceStore";
import useStaffStore from "@/store/useStaffStore";
import Colors from "@/constants/colors";
import { useColorScheme } from "react-native";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Calendar } from "lucide-react-native";
import useThemeStore from "@/store/useThemeStore";
import { absenceColors } from "@/constants/colors";

export default function ReportsScreen() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { absences } = useAbsenceStore();
  const { staff, getActiveStaff } = useStaffStore();

  const now = new Date();
  const [selectedDate, setSelectedDate] = useState(now);
  const currentMonth = selectedDate.getMonth();
  const currentYear = selectedDate.getFullYear();

  const thisMonthAbsences = absences.filter((a) => {
    const date = new Date(a.date);
    return (
      date.getMonth() === currentMonth &&
      date.getFullYear() === currentYear &&
      a.status !== "Cancelled"
    );
  });

  const sicknessCount = thisMonthAbsences.filter((a) => a.type === "Sickness").length;
  const holidayCount = thisMonthAbsences.filter((a) => a.type === "Holiday").length;
  const otherCount = thisMonthAbsences.filter((a) => a.type === "Other").length;

  const staffAbsenceCounts = staff.map((s) => ({
    staff: s,
    count: thisMonthAbsences.filter((a) => a.staffId === s.id).length,
  }));

  const topAbsentees = staffAbsenceCounts
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const getPreviousMonth = () => {
    const prev = new Date(selectedDate);
    prev.setMonth(prev.getMonth() - 1);
    setSelectedDate(prev);
  };

  const getNextMonth = () => {
    const next = new Date(selectedDate);
    next.setMonth(next.getMonth() + 1);
    setSelectedDate(next);
  };

  const goToCurrentMonth = () => {
    setSelectedDate(new Date());
  };

  const isCurrentMonth = currentMonth === now.getMonth() && currentYear === now.getFullYear();

  const getPreviousMonthAbsences = () => {
    const prev = new Date(selectedDate);
    prev.setMonth(prev.getMonth() - 1);
    return absences.filter((a) => {
      const date = new Date(a.date);
      return (
        date.getMonth() === prev.getMonth() &&
        date.getFullYear() === prev.getFullYear() &&
        a.status !== "Cancelled"
      );
    }).length;
  };

  const previousMonthCount = getPreviousMonthAbsences();
  const changeFromLastMonth = thisMonthAbsences.length - previousMonthCount;
  const percentChange = previousMonthCount > 0 ? ((changeFromLastMonth / previousMonthCount) * 100).toFixed(1) : 0;

  const activeStaff = getActiveStaff();
  const averageAbsencesPerStaff = activeStaff.length > 0 ? (thisMonthAbsences.length / activeStaff.length).toFixed(1) : 0;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const workingDays = daysInMonth - Math.floor(daysInMonth / 7) * 2;
  const absenceRate = workingDays > 0 ? ((thisMonthAbsences.length / (workingDays * activeStaff.length)) * 100).toFixed(1) : 0;

  return (
    <ThemedView style={styles.container} useGradient>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.header, { backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={getPreviousMonth} style={styles.monthButton}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          
          <View style={styles.headerCenter}>
            <ThemedText style={styles.monthTitle}>
              <Text>
                {selectedDate.toLocaleString("default", { month: "long", year: "numeric" })}
              </Text>
            </ThemedText>
            {!isCurrentMonth && (
              <TouchableOpacity onPress={goToCurrentMonth} style={[styles.todayButton, { backgroundColor: colors.primary }]}>
                <Calendar size={14} color="white" />
                <Text style={styles.todayButtonText}>Today</Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={getNextMonth} style={styles.monthButton}>
            <ChevronRight size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <View style={[styles.statsGrid]}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={styles.statCardLabel}>
              <Text>Total Absences</Text>
            </ThemedText>
            <ThemedText style={styles.statCardNumber}>
              <Text>{thisMonthAbsences.length}</Text>
            </ThemedText>
            {changeFromLastMonth !== 0 && (
              <View style={styles.changeContainer}>
                {changeFromLastMonth > 0 ? (
                  <TrendingUp size={16} color="#FF5722" />
                ) : (
                  <TrendingDown size={16} color="#4CAF50" />
                )}
                <Text style={[styles.changeText, { color: changeFromLastMonth > 0 ? "#FF5722" : "#4CAF50" }]}>
                  {Math.abs(changeFromLastMonth)} ({percentChange}%)
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={styles.statCardLabel}>
              <Text>Active Staff</Text>
            </ThemedText>
            <ThemedText style={styles.statCardNumber}>
              <Text>{activeStaff.length}</Text>
            </ThemedText>
            <Text style={[styles.subText, { color: colors.secondaryText }]}>
              {averageAbsencesPerStaff} avg absences
            </Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={styles.statCardLabel}>
              <Text>Absence Rate</Text>
            </ThemedText>
            <ThemedText style={styles.statCardNumber}>
              <Text>{absenceRate}%</Text>
            </ThemedText>
            <Text style={[styles.subText, { color: colors.secondaryText }]}>
              of working days
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ThemedText style={styles.cardTitle}>
            <Text>Breakdown by Type</Text>
          </ThemedText>
          <View style={styles.typeBreakdown}>
            <View style={[styles.typeCard, { backgroundColor: absenceColors.holiday }]}>
              <Text style={styles.typeLabel}>Holiday</Text>
              <Text style={styles.typeCount}>{holidayCount}</Text>
            </View>
            <View style={[styles.typeCard, { backgroundColor: absenceColors.sickness }]}>
              <Text style={styles.typeLabel}>Sickness</Text>
              <Text style={styles.typeCount}>{sicknessCount}</Text>
            </View>
            <View style={[styles.typeCard, { backgroundColor: absenceColors.other }]}>
              <Text style={styles.typeLabel}>Other</Text>
              <Text style={styles.typeCount}>{otherCount}</Text>
            </View>
          </View>
        </View>

        {topAbsentees.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ThemedText style={styles.cardTitle}>
              <Text>Top Absences This Month</Text>
            </ThemedText>
            {topAbsentees.map((item, index) => (
              <View key={item.staff.id} style={styles.topAbsenteeRow}>
                <View style={styles.rankContainer}>
                  <View style={[
                    styles.rankBadge, 
                    { backgroundColor: index === 0 ? "#FFD700" : index === 1 ? "#C0C0C0" : index === 2 ? "#CD7F32" : colors.surface }
                  ]}>
                    <Text style={[styles.rankText, { color: index < 3 ? "#333" : colors.text }]}>
                      {index + 1}
                    </Text>
                  </View>
                </View>
                <View style={styles.absenteeInfo}>
                  <ThemedText style={styles.absenceeName}>
                    <Text>{item.staff.name}</Text>
                  </ThemedText>
                  {item.staff.department && (
                    <Text style={[styles.absenceeDept, { color: colors.secondaryText }]}>
                      {item.staff.department}
                    </Text>
                  )}
                </View>
                <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.countBadgeText}>{item.count}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {topAbsentees.length === 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.emptyState}>
              <Calendar size={48} color={colors.secondaryText} />
              <ThemedText style={[styles.emptyText, { color: colors.secondaryText }]}>
                <Text>No absences recorded this month</Text>
              </ThemedText>
            </View>
          </View>
        )}
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
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  monthButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: "700" as const,
  },
  todayButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todayButtonText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600" as const,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: "30%",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  statCardLabel: {
    fontSize: 13,
    marginBottom: 8,
    opacity: 0.7,
  },
  statCardNumber: {
    fontSize: 32,
    fontWeight: "700" as const,
    marginBottom: 4,
  },
  changeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
  subText: {
    fontSize: 11,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600" as const,
    marginBottom: 12,
  },
  typeBreakdown: {
    flexDirection: "row",
    gap: 12,
  },
  typeCard: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  typeLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: "#333",
    marginBottom: 8,
  },
  typeCount: {
    fontSize: 24,
    fontWeight: "700" as const,
    color: "#333",
  },
  topAbsenteeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  rankContainer: {
    width: 40,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: {
    fontSize: 14,
    fontWeight: "700" as const,
  },
  absenteeInfo: {
    flex: 1,
  },
  absenceeName: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  absenceeDept: {
    fontSize: 13,
    marginTop: 2,
  },
  countBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  countBadgeText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },
});
