import React, { useState, useEffect } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity, Text, Modal, Alert, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Plus, X, AlertTriangle, Flag } from "lucide-react-native";
import ThemedView from "@/components/ThemedView";
import ThemedText from "@/components/ThemedText";
import Colors, { absenceColors } from "@/constants/colors";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import useStaffStore from "@/store/useStaffStore";
import { Absence } from "@/types";
import useAuthStore from "@/store/useAuthStore";

export default function CalendarScreen() {
  const router = useRouter();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const isTablet = windowWidth >= 768;
  const isDesktop = windowWidth >= 1024;

  const { absences, getConflictDays } = useAbsenceStore();
  const { getStaffById } = useStaffStore();
  const { user } = useAuthStore();
  const canEdit = user?.accessLevel !== "viewer";
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showConflictAlert, setShowConflictAlert] = useState(false);
  const [showDailyAbsences, setShowDailyAbsences] = useState(false);
  const [showWeeklyAlert, setShowWeeklyAlert] = useState(false);
  const [show24HourAlert, setShow24HourAlert] = useState(false);
  const [lastShownDate, setLastShownDate] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    const checkAlerts = async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const isMonday = today.getDay() === 1;
      
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      const storedDate = await AsyncStorage.getItem('lastAbsenceAlertDate');
      const storedWeeklyDate = await AsyncStorage.getItem('lastWeeklyAlertDate');
      const stored24HourDate = await AsyncStorage.getItem('last24HourAlertDate');
      
      if (storedDate !== todayStr) {
        const todayAbsences = getAbsencesForDate(todayStr);
        if (todayAbsences.length > 0) {
          setShowDailyAbsences(true);
        }
        await AsyncStorage.setItem('lastAbsenceAlertDate', todayStr);
        setLastShownDate(todayStr);
      }

      if (stored24HourDate !== todayStr) {
        const tomorrowAbsences = getAbsencesForDate(tomorrowStr);
        if (tomorrowAbsences.length > 0) {
          setShow24HourAlert(true);
          await AsyncStorage.setItem('last24HourAlertDate', todayStr);
        }
      }

      if (isMonday && storedWeeklyDate !== todayStr) {
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + 6);
        const weekAbsences = getAbsencesForWeek(todayStr, endOfWeek.toISOString().split('T')[0]);
        
        if (weekAbsences.length > 0) {
          setShowWeeklyAlert(true);
          await AsyncStorage.setItem('lastWeeklyAlertDate', todayStr);
        }
      }
    };
    
    checkAlerts();
  }, []);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleViewDay = (date: string) => {
    router.push({
      pathname: "/calendar/day-absences" as any,
      params: { date },
    });
  };

  const handleAddAbsence = (date: string, session: 'AM' | 'PM') => {
    if (!canEdit) {
      Alert.alert("View-only access", "You can review this shared calendar, but only editors can add absences.");
      return;
    }

    router.push({
      pathname: "/calendar/absence-form" as any,
      params: { date, session },
    });
  };

  const handleShowSummary = (date: string) => {
    setSelectedDay(date);
    setShowSummaryModal(true);
  };

  const getAbsencesForDate = (date: string) => {
    return absences.filter(
      (a) => a.date === date && a.status !== 'Cancelled'
    );
  };

  const getAbsencesForWeek = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return absences.filter((a) => {
      if (a.status === 'Cancelled') return false;
      const absenceDate = new Date(a.date);
      return absenceDate >= start && absenceDate <= end;
    }).sort((a, b) => a.date.localeCompare(b.date));
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const getAbsencesForDateSession = (date: string, session: 'AM' | 'PM') => {
    return absences.filter(
      (a) =>
        a.date === date &&
        (a.session === session || a.session === 'Full Day') &&
        a.status !== 'Cancelled'
    );
  };

  const getSessionColor = (abs: Absence[]) => {
    if (abs.length === 0) return 'transparent';
    
    const types = abs.map((a) => a.type);
    if (types.includes('Sickness')) return absenceColors.sickness;
    if (types.includes('Holiday')) return absenceColors.holiday;
    return absenceColors.other;
  };

  const getConflictColor = (count: number) => {
    if (count >= 4) return '#D32F2F';
    if (count === 3) return '#FF5722';
    if (count === 2) return '#FF9800';
    return 'transparent';
  };

  const getConflictSeverity = (count: number): 'medium' | 'high' | 'critical' => {
    if (count >= 4) return 'critical';
    if (count === 3) return 'high';
    return 'medium';
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, paddingHorizontal: isDesktop ? 32 : isTablet ? 24 : 16 }]}>
        <TouchableOpacity onPress={handlePrevMonth}>
          <ChevronLeft size={isDesktop ? 32 : isTablet ? 28 : 24} color={colors.text} />
        </TouchableOpacity>
        <ThemedText style={[styles.headerTitle, { fontSize: isDesktop ? 24 : isTablet ? 22 : 20 }]}>
          <Text>
            {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
          </Text>
        </ThemedText>
        <TouchableOpacity onPress={handleNextMonth}>
          <ChevronRight size={isDesktop ? 32 : isTablet ? 28 : 24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {!canEdit ? (
        <View style={[styles.readOnlyBanner, { backgroundColor: colors.surfaceVariant, borderBottomColor: colors.border }]}>
          <ThemedText variant="secondary">You are viewing a shared calendar in read-only mode.</ThemedText>
        </View>
      ) : null}

      <View style={[styles.weekDaysHeader, { backgroundColor: colors.surface }]}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <View key={day} style={styles.weekDayCell}>
            <Text style={[styles.weekDayText, { color: colors.secondaryText, fontSize: isDesktop ? 15 : isTablet ? 14 : 13 }]}>
              {day}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.calendarGrid}>
        {days.map((day, index) => {
          if (day === null) {
            return <View key={`empty-${index}`} style={styles.dayCell} />;
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const amAbsences = getAbsencesForDateSession(dateStr, 'AM');
          const pmAbsences = getAbsencesForDateSession(dateStr, 'PM');
          const totalAbsences = getAbsencesForDate(dateStr);
          const hasConflict = totalAbsences.length >= 2;
          const conflictColor = getConflictColor(totalAbsences.length);
          const amConflict = amAbsences.length >= 2;
          const pmConflict = pmAbsences.length >= 2;

          const cellHeight = isDesktop ? 140 : isTablet ? 120 : 100;

          return (
            <View
              key={`day-${day}`}
              style={[
                styles.dayCell, 
                { borderColor: colors.border, minHeight: cellHeight }
              ]}
            >
              <View style={styles.dayHeader}>
                <View style={styles.dayNumberContainer}>
                  <Text style={[styles.dayNumber, { color: colors.text, fontSize: isDesktop ? 18 : isTablet ? 16 : 15 }]}>
                    {day}
                  </Text>
                  {hasConflict && (
                    <View style={[styles.conflictFlag, { backgroundColor: conflictColor }]}>
                      <Flag size={8} color="white" />
                    </View>
                  )}
                </View>
                <View style={styles.headerRight}>
                  {totalAbsences.length > 0 && (
                    <TouchableOpacity
                      style={[styles.summaryButton, { backgroundColor: colors.primary }]}
                      onPress={() => handleShowSummary(dateStr)}
                    >
                      <Text style={styles.summaryButtonText}>{totalAbsences.length}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              
              <View style={styles.sessions}>
                <TouchableOpacity
                  style={[
                    styles.session,
                    { backgroundColor: absenceColors.amSlot }
                  ]}
                  onPress={() => handleAddAbsence(dateStr, 'AM')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sessionLabel, { color: colors.text, fontSize: isDesktop ? 13 : isTablet ? 12 : 11 }]}>
                    AM
                  </Text>
                  {amAbsences.length > 0 && (
                    <View style={[styles.absenceIndicator, { backgroundColor: getSessionColor(amAbsences) }]}>
                      <Text style={[styles.absenceCount]}>{amAbsences.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.session,
                    { backgroundColor: absenceColors.pmSlot }
                  ]}
                  onPress={() => handleAddAbsence(dateStr, 'PM')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sessionLabel, { color: colors.text, fontSize: isDesktop ? 13 : isTablet ? 12 : 11 }]}>
                    PM
                  </Text>
                  {pmAbsences.length > 0 && (
                    <View style={[styles.absenceIndicator, { backgroundColor: getSessionColor(pmAbsences) }]}>
                      <Text style={[styles.absenceCount]}>{pmAbsences.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => handleViewDay(new Date().toISOString().split('T')[0])}
      >
        <Plus size={24} color="white" />
      </TouchableOpacity>

      <Modal
        visible={showSummaryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSummaryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, width: isDesktop ? '50%' : isTablet ? '70%' : '100%' }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <ThemedText style={styles.modalTitle}>Day Summary</ThemedText>
              <TouchableOpacity onPress={() => setShowSummaryModal(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            
            {selectedDay && (
              <ScrollView style={styles.modalBody}>
                <ThemedText style={styles.modalDate}>
                  {new Date(selectedDay).toLocaleDateString('default', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </ThemedText>

                {(() => {
                  const dayAbsences = getAbsencesForDate(selectedDay);
                  const amList = dayAbsences.filter(a => a.session === 'AM' || a.session === 'Full Day');
                  const pmList = dayAbsences.filter(a => a.session === 'PM' || a.session === 'Full Day');

                  return (
                    <View>
                      {amList.length > 0 && (
                        <View style={styles.summarySection}>
                          <View style={[styles.summarySectionHeader, { backgroundColor: absenceColors.amSlot }]}>
                            <Text style={[styles.summarySectionTitle, { color: colors.text }]}>Morning ({amList.length})</Text>
                          </View>
                          {amList.map((absence) => {
                            const staff = getStaffById(absence.staffId);
                            return (
                              <View key={absence.id} style={[styles.summaryItem, { backgroundColor: colors.surface }]}>
                                <View style={styles.summaryItemHeader}>
                                  <Text style={[styles.staffNameText, { color: colors.text }]}>
                                    {staff?.name || 'Unknown'}
                                  </Text>
                                  <View style={[styles.typeBadge, { backgroundColor: getSessionColor([absence]) }]}>
                                    <Text style={styles.typeBadgeText}>{absence.type}</Text>
                                  </View>
                                </View>
                                {staff?.department && (
                                  <Text style={[styles.departmentText, { color: colors.secondaryText }]}>
                                    {staff.department}
                                  </Text>
                                )}
                                {absence.note && (
                                  <Text style={[styles.noteText, { color: colors.secondaryText }]}>
                                    {absence.note}
                                  </Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {pmList.length > 0 && (
                        <View style={styles.summarySection}>
                          <View style={[styles.summarySectionHeader, { backgroundColor: absenceColors.pmSlot }]}>
                            <Text style={[styles.summarySectionTitle, { color: colors.text }]}>Afternoon ({pmList.length})</Text>
                          </View>
                          {pmList.map((absence) => {
                            const staff = getStaffById(absence.staffId);
                            return (
                              <View key={absence.id} style={[styles.summaryItem, { backgroundColor: colors.surface }]}>
                                <View style={styles.summaryItemHeader}>
                                  <Text style={[styles.staffNameText, { color: colors.text }]}>
                                    {staff?.name || 'Unknown'}
                                  </Text>
                                  <View style={[styles.typeBadge, { backgroundColor: getSessionColor([absence]) }]}>
                                    <Text style={styles.typeBadgeText}>{absence.type}</Text>
                                  </View>
                                </View>
                                {staff?.department && (
                                  <Text style={[styles.departmentText, { color: colors.secondaryText }]}>
                                    {staff.department}
                                  </Text>
                                )}
                                {absence.note && (
                                  <Text style={[styles.noteText, { color: colors.secondaryText }]}>
                                    {absence.note}
                                  </Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {dayAbsences.length === 0 && (
                        <View style={styles.emptyState}>
                          <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No absences for this day</Text>
                        </View>
                      )}
                    </View>
                  );
                })()}

                <TouchableOpacity
                  style={[styles.viewFullButton, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    setShowSummaryModal(false);
                    if (selectedDay) handleViewDay(selectedDay);
                  }}
                >
                  <Text style={styles.viewFullButtonText}>View Full Day</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={showConflictAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConflictAlert(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.alertContent, { backgroundColor: colors.card, width: isDesktop ? '40%' : isTablet ? '60%' : '90%' }]}>
            <View style={styles.alertIconContainer}>
              <AlertTriangle size={48} color="#FF5722" />
            </View>
            <ThemedText style={styles.alertTitle}>Staffing Conflicts Detected</ThemedText>
            <ThemedText style={[styles.alertMessage, { color: colors.secondaryText }]}>
              Multiple staff members have overlapping absences in the next 7 days.
            </ThemedText>
            
            <ScrollView style={styles.conflictList}>
              {(() => {
                const today = new Date();
                const nextWeek = new Date();
                nextWeek.setDate(today.getDate() + 7);
                const conflicts = getConflictDays(
                  today.toISOString().split('T')[0],
                  nextWeek.toISOString().split('T')[0]
                );
                
                return conflicts.map((conflict) => (
                  <View key={conflict.date} style={[styles.conflictItem, { backgroundColor: colors.surface }]}>
                    <View style={styles.conflictItemHeader}>
                      <Flag size={16} color={getConflictColor(conflict.count)} />
                      <Text style={[styles.conflictDate, { color: colors.text }]}>
                        {new Date(conflict.date).toLocaleDateString('default', { 
                          weekday: 'short', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </Text>
                      <View style={[styles.conflictBadge, { backgroundColor: getConflictColor(conflict.count) }]}>
                        <Text style={styles.conflictBadgeText}>{conflict.count} absent</Text>
                      </View>
                    </View>
                    <Text style={[styles.conflictSeverityText, { color: colors.secondaryText }]}>
                      {conflict.severity === 'critical' ? '🔴 Critical' : 
                       conflict.severity === 'high' ? '🟠 High' : '🟡 Medium'} Priority
                    </Text>
                  </View>
                ));
              })()}
            </ScrollView>

            <TouchableOpacity
              style={[styles.alertButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowConflictAlert(false)}
            >
              <Text style={styles.alertButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showDailyAbsences}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDailyAbsences(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.alertContent, { backgroundColor: colors.card, width: isDesktop ? '40%' : isTablet ? '60%' : '90%' }]}>
            <View style={styles.alertIconContainer}>
              <AlertTriangle size={48} color={colors.primary} />
            </View>
            <ThemedText style={styles.alertTitle}>Today's Absences</ThemedText>
            <ThemedText style={[styles.alertMessage, { color: colors.secondaryText }]}>
              {new Date().toLocaleDateString('default', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric',
                year: 'numeric'
              })}
            </ThemedText>
            
            <ScrollView style={styles.conflictList}>
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const todayAbsences = getAbsencesForDate(todayStr);
                const amList = todayAbsences.filter(a => a.session === 'AM' || a.session === 'Full Day');
                const pmList = todayAbsences.filter(a => a.session === 'PM' || a.session === 'Full Day');
                
                return (
                  <View style={{ width: '100%' }}>
                    {amList.length > 0 && (
                      <View style={styles.summarySection}>
                        <View style={[styles.summarySectionHeader, { backgroundColor: absenceColors.amSlot }]}>
                          <Text style={[styles.summarySectionTitle, { color: colors.text }]}>Morning ({amList.length})</Text>
                        </View>
                        {amList.map((absence) => {
                          const staff = getStaffById(absence.staffId);
                          return (
                            <View key={absence.id} style={[styles.summaryItem, { backgroundColor: colors.surface }]}>
                              <View style={styles.summaryItemHeader}>
                                <Text style={[styles.staffNameText, { color: colors.text }]}>
                                  {staff?.name || 'Unknown'}
                                </Text>
                                <View style={[styles.typeBadge, { backgroundColor: getSessionColor([absence]) }]}>
                                  <Text style={styles.typeBadgeText}>{absence.type}</Text>
                                </View>
                              </View>
                              {staff?.department && (
                                <Text style={[styles.departmentText, { color: colors.secondaryText }]}>
                                  {staff.department}
                                </Text>
                              )}
                              {absence.note && (
                                <Text style={[styles.noteText, { color: colors.secondaryText }]}>
                                  {absence.note}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {pmList.length > 0 && (
                      <View style={styles.summarySection}>
                        <View style={[styles.summarySectionHeader, { backgroundColor: absenceColors.pmSlot }]}>
                          <Text style={[styles.summarySectionTitle, { color: colors.text }]}>Afternoon ({pmList.length})</Text>
                        </View>
                        {pmList.map((absence) => {
                          const staff = getStaffById(absence.staffId);
                          return (
                            <View key={absence.id} style={[styles.summaryItem, { backgroundColor: colors.surface }]}>
                              <View style={styles.summaryItemHeader}>
                                <Text style={[styles.staffNameText, { color: colors.text }]}>
                                  {staff?.name || 'Unknown'}
                                </Text>
                                <View style={[styles.typeBadge, { backgroundColor: getSessionColor([absence]) }]}>
                                  <Text style={styles.typeBadgeText}>{absence.type}</Text>
                                </View>
                              </View>
                              {staff?.department && (
                                <Text style={[styles.departmentText, { color: colors.secondaryText }]}>
                                  {staff.department}
                                </Text>
                              )}
                              {absence.note && (
                                <Text style={[styles.noteText, { color: colors.secondaryText }]}>
                                  {absence.note}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {todayAbsences.length > 0 && todayAbsences.length >= 2 && (
                      <View style={[styles.conflictWarning, { backgroundColor: getConflictColor(todayAbsences.length) }]}>
                        <Flag size={16} color="white" />
                        <Text style={styles.conflictWarningText}>
                          {todayAbsences.length} staff members absent today
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </ScrollView>

            <TouchableOpacity
              style={[styles.alertButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowDailyAbsences(false)}
            >
              <Text style={styles.alertButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={show24HourAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setShow24HourAlert(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.alertContent, { backgroundColor: colors.card, width: isDesktop ? '40%' : isTablet ? '60%' : '90%' }]}>
            <View style={styles.alertIconContainer}>
              <AlertTriangle size={48} color="#FF9800" />
            </View>
            <ThemedText style={styles.alertTitle}>Tomorrow's Absences</ThemedText>
            <ThemedText style={[styles.alertMessage, { color: colors.secondaryText }]}>
              {(() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                return tomorrow.toLocaleDateString('default', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric',
                  year: 'numeric'
                });
              })()}
            </ThemedText>
            
            <ScrollView style={styles.conflictList}>
              {(() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = tomorrow.toISOString().split('T')[0];
                const tomorrowAbsences = getAbsencesForDate(tomorrowStr);
                const amList = tomorrowAbsences.filter(a => a.session === 'AM' || a.session === 'Full Day');
                const pmList = tomorrowAbsences.filter(a => a.session === 'PM' || a.session === 'Full Day');
                
                return (
                  <View style={{ width: '100%' }}>
                    {amList.length > 0 && (
                      <View style={styles.summarySection}>
                        <View style={[styles.summarySectionHeader, { backgroundColor: absenceColors.amSlot }]}>
                          <Text style={[styles.summarySectionTitle, { color: colors.text }]}>Morning ({amList.length})</Text>
                        </View>
                        {amList.map((absence) => {
                          const staff = getStaffById(absence.staffId);
                          return (
                            <View key={absence.id} style={[styles.summaryItem, { backgroundColor: colors.surface }]}>
                              <View style={styles.summaryItemHeader}>
                                <Text style={[styles.staffNameText, { color: colors.text }]}>
                                  {staff?.name || 'Unknown'}
                                </Text>
                                <View style={[styles.typeBadge, { backgroundColor: getSessionColor([absence]) }]}>
                                  <Text style={styles.typeBadgeText}>{absence.type}</Text>
                                </View>
                              </View>
                              {staff?.department && (
                                <Text style={[styles.departmentText, { color: colors.secondaryText }]}>
                                  {staff.department}
                                </Text>
                              )}
                              {absence.note && (
                                <Text style={[styles.noteText, { color: colors.secondaryText }]}>
                                  {absence.note}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {pmList.length > 0 && (
                      <View style={styles.summarySection}>
                        <View style={[styles.summarySectionHeader, { backgroundColor: absenceColors.pmSlot }]}>
                          <Text style={[styles.summarySectionTitle, { color: colors.text }]}>Afternoon ({pmList.length})</Text>
                        </View>
                        {pmList.map((absence) => {
                          const staff = getStaffById(absence.staffId);
                          return (
                            <View key={absence.id} style={[styles.summaryItem, { backgroundColor: colors.surface }]}>
                              <View style={styles.summaryItemHeader}>
                                <Text style={[styles.staffNameText, { color: colors.text }]}>
                                  {staff?.name || 'Unknown'}
                                </Text>
                                <View style={[styles.typeBadge, { backgroundColor: getSessionColor([absence]) }]}>
                                  <Text style={styles.typeBadgeText}>{absence.type}</Text>
                                </View>
                              </View>
                              {staff?.department && (
                                <Text style={[styles.departmentText, { color: colors.secondaryText }]}>
                                  {staff.department}
                                </Text>
                              )}
                              {absence.note && (
                                <Text style={[styles.noteText, { color: colors.secondaryText }]}>
                                  {absence.note}
                                </Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {tomorrowAbsences.length > 0 && tomorrowAbsences.length >= 2 && (
                      <View style={[styles.conflictWarning, { backgroundColor: getConflictColor(tomorrowAbsences.length) }]}>
                        <Flag size={16} color="white" />
                        <Text style={styles.conflictWarningText}>
                          {tomorrowAbsences.length} staff members absent tomorrow
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })()}
            </ScrollView>

            <TouchableOpacity
              style={[styles.alertButton, { backgroundColor: colors.primary }]}
              onPress={() => setShow24HourAlert(false)}
            >
              <Text style={styles.alertButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showWeeklyAlert}
        transparent
        animationType="fade"
        onRequestClose={() => setShowWeeklyAlert(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.alertContent, { backgroundColor: colors.card, width: isDesktop ? '40%' : isTablet ? '60%' : '90%' }]}>            <View style={styles.alertIconContainer}>
              <AlertTriangle size={48} color={colors.primary} />
            </View>
            <ThemedText style={styles.alertTitle}>This Week's Absences</ThemedText>
            <ThemedText style={[styles.alertMessage, { color: colors.secondaryText }]}>
              {(() => {
                const today = new Date();
                const endOfWeek = new Date(today);
                endOfWeek.setDate(today.getDate() + 6);
                return `${today.toLocaleDateString('default', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`;
              })()}
            </ThemedText>
            
            <ScrollView style={styles.conflictList}>
              {(() => {
                const today = new Date();
                const endOfWeek = new Date(today);
                endOfWeek.setDate(today.getDate() + 6);
                const weekAbsences = getAbsencesForWeek(
                  today.toISOString().split('T')[0],
                  endOfWeek.toISOString().split('T')[0]
                );
                
                const absencesByDate = new Map<string, Absence[]>();
                weekAbsences.forEach((absence) => {
                  const existing = absencesByDate.get(absence.date) || [];
                  absencesByDate.set(absence.date, [...existing, absence]);
                });
                
                return Array.from(absencesByDate.entries()).map(([date, absencesForDate]) => (
                  <View key={date} style={[styles.weeklyAbsenceDay, { backgroundColor: colors.surface }]}>
                    <View style={styles.weeklyAbsenceDateHeader}>
                      <Text style={[styles.weeklyAbsenceDate, { color: colors.text }]}>
                        {new Date(date).toLocaleDateString('default', { 
                          weekday: 'long', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </Text>
                      {absencesForDate.length >= 2 && (
                        <View style={[styles.conflictBadge, { backgroundColor: getConflictColor(absencesForDate.length) }]}>
                          <Flag size={10} color="white" />
                          <Text style={styles.conflictBadgeText}>{absencesForDate.length}</Text>
                        </View>
                      )}
                    </View>
                    
                    {absencesForDate.map((absence) => {
                      const staff = getStaffById(absence.staffId);
                      return (
                        <View key={absence.id} style={styles.weeklyAbsenceItem}>
                          <View style={styles.weeklyAbsenceItemHeader}>
                            <Text style={[styles.weeklyStaffName, { color: colors.text }]}>
                              {staff?.name || 'Unknown'}
                            </Text>
                            <View style={styles.weeklyAbsenceItemBadges}>
                              <View style={[styles.sessionBadge, { backgroundColor: absence.session === 'Full Day' ? '#9575CD' : absence.session === 'AM' ? absenceColors.amSlot : absenceColors.pmSlot }]}>
                                <Text style={styles.sessionBadgeText}>{absence.session}</Text>
                              </View>
                              <View style={[styles.typeBadge, { backgroundColor: getSessionColor([absence]) }]}>
                                <Text style={styles.typeBadgeText}>{absence.type}</Text>
                              </View>
                            </View>
                          </View>
                          {staff?.department && (
                            <Text style={[styles.weeklyDepartment, { color: colors.secondaryText }]}>
                              {staff.department}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ));
              })()}
            </ScrollView>

            <TouchableOpacity
              style={[styles.alertButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowWeeklyAlert(false)}
            >
              <Text style={styles.alertButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontWeight: '700' as const,
  },
  readOnlyBanner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  weekDaysHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekDayText: {
    fontWeight: '600' as const,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
  },
  dayCell: {
    width: '14.28%',
    padding: 2,
    borderWidth: 0.5,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
    paddingHorizontal: 2,
  },
  dayNumberContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  conflictFlag: {
    width: 12,
    height: 12,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dayNumber: {
    fontWeight: '600' as const,
  },
  summaryButton: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryButtonText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: 'white',
  },
  sessions: {
    flex: 1,
    gap: 2,
  },
  session: {
    flex: 1,
    borderRadius: 4,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionLabel: {
    fontWeight: '600' as const,
  },
  absenceIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  absenceCount: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#333',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    maxHeight: '80%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  modalBody: {
    padding: 16,
  },
  modalDate: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 16,
    textAlign: 'center',
  },
  summarySection: {
    marginBottom: 20,
  },
  summarySectionHeader: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  summarySectionTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  summaryItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  summaryItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  staffNameText: {
    fontSize: 15,
    fontWeight: '600' as const,
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#333',
  },
  departmentText: {
    fontSize: 13,
    marginTop: 2,
  },
  noteText: {
    fontSize: 12,
    marginTop: 4,
    fontStyle: 'italic' as const,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  viewFullButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  viewFullButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  alertContent: {
    maxHeight: '70%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  alertIconContainer: {
    marginBottom: 16,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    marginBottom: 12,
    textAlign: 'center',
  },
  alertMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  conflictList: {
    width: '100%',
    maxHeight: 250,
    marginBottom: 20,
  },
  conflictItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  conflictItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  conflictDate: {
    fontSize: 15,
    fontWeight: '600' as const,
    flex: 1,
  },
  conflictBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  conflictBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: 'white',
  },
  conflictSeverityText: {
    fontSize: 12,
    marginLeft: 24,
  },
  alertButton: {
    width: '100%',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  alertButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  conflictWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  conflictWarningText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600' as const,
    flex: 1,
  },
  weeklyAbsenceDay: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  weeklyAbsenceDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  weeklyAbsenceDate: {
    fontSize: 15,
    fontWeight: '700' as const,
  },
  weeklyAbsenceItem: {
    marginBottom: 8,
  },
  weeklyAbsenceItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weeklyStaffName: {
    fontSize: 14,
    fontWeight: '600' as const,
    flex: 1,
  },
  weeklyAbsenceItemBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  sessionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sessionBadgeText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: '#333',
  },
  weeklyDepartment: {
    fontSize: 12,
    marginTop: 2,
  },
});
