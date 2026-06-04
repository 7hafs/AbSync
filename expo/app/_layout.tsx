import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import useStaffStore from "@/store/useStaffStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import useCalendarStore from "@/store/useCalendarStore";
import useNotesStore from "@/store/useNotesStore";
import useRemindersStore from "@/store/useRemindersStore";
import useNotificationStore from "@/store/useNotificationStore";
import { initializeSampleData } from "@/utils/sampleData";
import {
  initializeNotifications,
  cancelAllDailyNotifications,
  scheduleDailyNotifications,
} from "@/utils/notificationService";
import Colors from "@/constants/colors";
import useAuthStore from "@/store/useAuthStore";
import { SupabaseAuthProvider, useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { syncProfile } from "@/lib/supabase";
import {
  fetchAbsences,
  fetchStaff,
  fetchEvents,
  fetchNotes,
  fetchReminders,
} from "@/lib/dataService";
import { migrateLocalDataToSupabase } from "@/lib/migration";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) {
      console.error(error);
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SupabaseAuthProvider>
      <RootLayoutNav />
    </SupabaseAuthProvider>
  );
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { user: authUser, isLoading: authLoading } = useSupabaseAuth();
  const authStore = useAuthStore();
  const staffStore = useStaffStore();
  const absenceStore = useAbsenceStore();
  const calendarStore = useCalendarStore();
  const notesStore = useNotesStore();
  const remindersStore = useRemindersStore();
  const notificationStore = useNotificationStore();

  // The useSupabaseAuth hook already syncs with useAuthStore
  // via its own useEffect, so we don't need to duplicate that here.

  // Load notification preferences from Supabase when authenticated
  useEffect(() => {
    if (!authStore.isAuthenticated || !authStore.user) return;

    const userId = authStore.user.id;
    notificationStore.syncFromSupabase(userId).then(() => {
      // After prefs are loaded, initialize notifications
      initializeNotifications(userId);
    });
  }, [authStore.isAuthenticated, authStore.user?.id]);

  // Persist notification prefs to Supabase when they change
  useEffect(() => {
    if (
      !authStore.isAuthenticated ||
      !authStore.user ||
      !notificationStore.isLoaded
    )
      return;

    const userId = authStore.user.id;
    const timeout = setTimeout(() => {
      notificationStore.persistToSupabase(userId);
      // Reschedule notifications to reflect updated prefs
      scheduleDailyNotifications(userId);
    }, 500);

    return () => clearTimeout(timeout);
  }, [
    notificationStore.preferences.morningEnabled,
    notificationStore.preferences.eveningEnabled,
    notificationStore.preferences.instantAlertsEnabled,
    authStore.isAuthenticated,
    notificationStore.isLoaded,
  ]);

  // Load data from Supabase when authenticated
  useEffect(() => {
    if (!authStore.isAuthenticated || !authStore.user) return;

    const userId = authStore.user.id;

    async function loadData() {
      console.log("[RootLayout] Loading data from Supabase for user", userId);

      // Sync profile
      await syncProfile({
        id: userId,
        email: authStore.user?.email,
        name: authStore.user?.name,
      });

      // Run migration if needed (one-time: AsyncStorage → Supabase)
      const migration = await migrateLocalDataToSupabase(userId);
      if (migration.staffCount > 0 || migration.absenceCount > 0) {
        console.log(
          "[RootLayout] Migration complete — reloading from Supabase"
        );
      }

      // Fetch all data from Supabase
      const [staff, absences, events, notes, reminders] = await Promise.all([
        fetchStaff(userId),
        fetchAbsences(userId),
        fetchEvents(userId),
        fetchNotes(userId),
        fetchReminders(userId),
      ]);

      // Populate stores with Supabase data
      if (staff.length > 0) {
        staffStore.replaceStaff(staff);
      }
      if (absences.length > 0) {
        absenceStore.replaceAbsences(absences);
      }
      if (events.length > 0) {
        calendarStore.replaceEvents(events);
      }
      if (notes.length > 0) {
        notesStore.replaceNotes(notes);
      }
      if (reminders.length > 0) {
        remindersStore.replaceReminders(reminders);
      }

      // Mark stores as loaded
      staffStore.setLoaded(true);
      absenceStore.setLoaded(true);
      calendarStore.setLoaded(true);
      notesStore.setLoaded(true);
      remindersStore.setLoaded(true);

      // Initialize sample data only if both Supabase and local stores are empty
      initializeSampleData(staffStore, absenceStore);

      console.log("[RootLayout] Data loaded from Supabase:", {
        staff: staff.length,
        absences: absences.length,
        events: events.length,
      });

      // Refresh notifications with latest counts after data load
      scheduleDailyNotifications(userId);
    }

    loadData();
  }, [authStore.isAuthenticated, authStore.user?.id]);

  // Auth routing
  useEffect(() => {
    if (authLoading) return;

    const firstSegment = segments[0];
    const isAuthRoute = firstSegment === "auth";
    const isShareRoute = firstSegment === "share";

    console.log("[RootLayout] Evaluating route access", {
      isAuthenticated: authStore.isAuthenticated,
      firstSegment,
    });

    if (!authStore.isAuthenticated && !isAuthRoute && !isShareRoute) {
      // Cancel all notifications when user is not authenticated
      cancelAllDailyNotifications();
      router.replace("/auth" as any);
      return;
    }

    if (authStore.isAuthenticated && isAuthRoute) {
      router.replace("/(tabs)" as any);
    }
  }, [authStore.isAuthenticated, authLoading, router, segments]);

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontWeight: "bold",
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="share/manage"
        options={{ title: "Share Calendar" }}
      />
      <Stack.Screen
        name="share/join"
        options={{ title: "Join Shared Calendar" }}
      />
      <Stack.Screen
        name="calendar/absence-form"
        options={{ presentation: "modal", title: "Absence" }}
      />
      <Stack.Screen
        name="staff/staff-form"
        options={{ presentation: "modal", title: "Staff" }}
      />
      <Stack.Screen
        name="settings/archived-staff"
        options={{ title: "Archived Staff" }}
      />
    </Stack>
  );
}
