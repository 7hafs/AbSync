import React from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams, Stack } from "expo-router";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import useAbsenceStore from "@/store/useAbsenceStore";
import useStaffStore from "@/store/useStaffStore";
import Colors, { absenceColors } from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import { Absence } from "@/types";
import { Plus, Calendar, Clock, User, FileText, Trash2, ChevronLeft, ChevronRight } from "lucide-react-native";

export default function DayAbsencesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { absences, deleteAbsence } = useAbsenceStore();
  const { getStaffById } = useStaffStore();

  const date = typeof params.date === "string" ? params.date : new Date().toISOString().split('T')[0];

  const dayAbsences = absences.filter(
    (a) => a.date === date && a.status !== 'Cancelled'
  ).sort((a, b) => {
    const sessionOrder = { 'AM': 0, 'PM': 1, 'Full Day': 2 };
    return sessionOrder[a.session] - sessionOrder[b.session];
  });

  const amAbsences = dayAbsences.filter(a => a.session === 'AM' || a.session === 'Full Day');
  const pmAbsences = dayAbsences.filter(a => a.session === 'PM' || a.session === 'Full Day');
  
  const hasConflict = dayAbsences.length > 2;
  const amConflict = amAbsences.length > 2;
  const pmConflict = pmAbsences.length > 2;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('default', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const changeDay = (direction: number) => {
    const currentDate = new Date(date);
    currentDate.setDate(currentDate.getDate() + direction);
    const newDate = currentDate.toISOString().split('T')[0];
    router.replace({
      pathname: "/calendar/day-absences" as any,
      params: { date: newDate },
    });
  };

  const handleAddAbsence = () => {
    router.push({
      pathname: "/calendar/absence-form" as any,
      params: { date },
    });
  };

  const handleEditAbsence = (absence: Absence) => {
    router.push({
      pathname: "/calendar/absence-form" as any,
      params: { id: absence.id, date: absence.date },
    });
  };

  const handleDeleteAbsence = (absence: Absence) => {
    Alert.alert(
      "Delete Absence",
      `Remove ${getStaffById(absence.staffId)?.name}'s absence?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteAbsence(absence.id),
        },
      ]
    );
  };

  const getAbsenceColor = (type: string) => {
    switch (type) {
      case 'Holiday':
        return absenceColors.holiday;
      case 'Sickness':
        return absenceColors.sickness;
      default:
        return absenceColors.other;
    }
  };

  const renderAbsenceCard = (absence: Absence) => {
    const staff = getStaffById(absence.staffId);
    if (!staff) return null;

    return (
      <TouchableOpacity
        key={absence.id}
        style={[
          styles.absenceCard,
          { 
            backgroundColor: colors.surface, 
            borderColor: colors.border,
            borderLeftColor: getAbsenceColor(absence.type),
          }
        ]}
        onPress={() => handleEditAbsence(absence)}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.staffInfo}>
              <User size={16} color={colors.text} />
              <ThemedText style={styles.staffName}>{staff.name}</ThemedText>
            </View>
            <View style={[styles.sessionBadge, { backgroundColor: colors.primary + '20' }]}>
              <Clock size={12} color={colors.primary} />
              <ThemedText style={[styles.sessionText, { color: colors.primary }]}>
                {absence.session}
              </ThemedText>
            </View>
          </View>

          <View style={styles.cardDetails}>
            <View style={styles.detailRow}>
              <Calendar size={14} color={colors.secondaryText} />
              <ThemedText style={[styles.detailText, { color: colors.secondaryText }]}>
                {absence.type}
              </ThemedText>
            </View>

            {staff.department && (
              <View style={styles.detailRow}>
                <FileText size={14} color={colors.secondaryText} />
                <ThemedText style={[styles.detailText, { color: colors.secondaryText }]}>
                  {staff.department}
                </ThemedText>
              </View>
            )}
          </View>

          {absence.note && (
            <View style={[styles.noteContainer, { backgroundColor: colors.background }]}>
              <ThemedText style={[styles.noteText, { color: colors.secondaryText }]}>
                {absence.note}
              </ThemedText>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteAbsence(absence)}
        >
          <Trash2 size={18} color="#FF3B30" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: "Absences",
        }}
      />

      <View style={[
        styles.header, 
        { 
          backgroundColor: hasConflict ? "#FF5722" : colors.card, 
          borderBottomColor: colors.border 
        }
      ]}>
        {hasConflict && (
          <View style={styles.conflictWarning}>
            <ThemedText style={styles.conflictWarningText}>
              ⚠️ High Absence Alert: {dayAbsences.length} staff members absent
            </ThemedText>
          </View>
        )}
        <View style={styles.dateHeader}>
          <TouchableOpacity 
            style={[styles.navButton, { backgroundColor: colors.surface }]} 
            onPress={() => changeDay(-1)}
          >
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <ThemedText style={styles.dateTitle}>{formatDate(date)}</ThemedText>
          <TouchableOpacity 
            style={[styles.navButton, { backgroundColor: colors.surface }]} 
            onPress={() => changeDay(1)}
          >
            <ChevronRight size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={[styles.statsRow, hasConflict && { marginTop: 8 }]}>
          <View style={styles.stat}>
            <ThemedText style={[
              styles.statNumber, 
              { color: hasConflict ? "white" : (amConflict ? "#FF5722" : colors.primary) }
            ]}>
              {amAbsences.length}
            </ThemedText>
            <ThemedText style={[
              styles.statLabel, 
              { color: hasConflict ? "rgba(255,255,255,0.8)" : colors.secondaryText }
            ]}>
              AM {amConflict && !hasConflict ? "⚠️" : ""}
            </ThemedText>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <ThemedText style={[
              styles.statNumber, 
              { color: hasConflict ? "white" : (pmConflict ? "#FF5722" : colors.primary) }
            ]}>
              {pmAbsences.length}
            </ThemedText>
            <ThemedText style={[
              styles.statLabel, 
              { color: hasConflict ? "rgba(255,255,255,0.8)" : colors.secondaryText }
            ]}>
              PM {pmConflict && !hasConflict ? "⚠️" : ""}
            </ThemedText>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <ThemedText style={[
              styles.statNumber, 
              { color: hasConflict ? "white" : colors.primary }
            ]}>
              {dayAbsences.length}
            </ThemedText>
            <ThemedText style={[
              styles.statLabel, 
              { color: hasConflict ? "rgba(255,255,255,0.8)" : colors.secondaryText }
            ]}>
              Total
            </ThemedText>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {dayAbsences.length === 0 ? (
          <View style={styles.emptyState}>
            <Calendar size={64} color={colors.secondaryText} />
            <ThemedText style={[styles.emptyText, { color: colors.secondaryText }]}>
              No absences recorded for this day
            </ThemedText>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={handleAddAbsence}
            >
              <Plus size={20} color="white" />
              <ThemedText style={styles.addButtonText}>Add Absence</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {amAbsences.length > 0 && (
              <View style={styles.section}>
                <View style={[styles.sectionHeader, { backgroundColor: absenceColors.amSlot }]}>
                  <ThemedText style={styles.sectionTitle}>
                    Morning ({amAbsences.length})
                  </ThemedText>
                </View>
                {amAbsences.map(renderAbsenceCard)}
              </View>
            )}

            {pmAbsences.length > 0 && (
              <View style={styles.section}>
                <View style={[styles.sectionHeader, { backgroundColor: absenceColors.pmSlot }]}>
                  <ThemedText style={styles.sectionTitle}>
                    Afternoon ({pmAbsences.length})
                  </ThemedText>
                </View>
                {pmAbsences.map(renderAbsenceCard)}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {dayAbsences.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={handleAddAbsence}
        >
          <Plus size={24} color="white" />
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
  },
  conflictWarning: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
  },
  conflictWarningText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600" as const,
    textAlign: "center",
  },
  dateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 12,
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  dateTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700" as const,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  stat: {
    alignItems: "center",
    flex: 1,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700" as const,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  absenceCard: {
    flexDirection: "row",
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  staffInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  staffName: {
    fontSize: 16,
    fontWeight: "600" as const,
  },
  sessionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sessionText: {
    fontSize: 12,
    fontWeight: "600" as const,
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  detailText: {
    fontSize: 14,
  },
  noteContainer: {
    marginTop: 12,
    padding: 8,
    borderRadius: 6,
  },
  noteText: {
    fontSize: 13,
    fontStyle: "italic" as const,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  addButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600" as const,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
});
