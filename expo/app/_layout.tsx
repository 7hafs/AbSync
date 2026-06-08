import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useCallback } from "react";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import useStaffStore from "@/store/useStaffStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import useCalendarStore from "@/store/useCalendarStore";
import useNotesStore from "@/store/useNotesStore";
import useRemindersStore from "@/store/useRemindersStore";
import useNotificationStore from "@/store/useNotificationStore";
import {
  initializeNotifications,
  scheduleDailyNotifications,
} from "@/utils/notificationService";
import { startupIntegrityCheck } from "@/lib/storageManager";
import { AuthProvider, useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { loadAllFromSupabase, migrateIfNeeded } from "@/lib/syncService";
import Colors from "@/constants/colors";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

// ═════════════════════════════════════════════════════════════════════════════
// Root layout — wraps everything in AuthProvider
// ═════════════════════════════════════════════════════════════════════════════

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
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Auth gate — redirects to login if not authenticated
// ═════════════════════════════════════════════════════════════════════════════

function AuthGate() {
  const { isLoading, user } = useSupabaseAuth();
  const segments = useSegments();
  const router = useRouter();

  const inAuthGroup = segments[0] === "auth";

  useEffect(() => {
    if (isLoading) return;

    if (!user && !inAuthGroup) {
      // Not authenticated — redirect to login
      router.replace("/auth/login" as never);
    } else if (user && inAuthGroup) {
      // Authenticated but on an auth screen — redirect to dashboard
      router.replace("/" as never);
    }
  }, [isLoading, user, inAuthGroup]);

  if (isLoading) {
    // Still restoring session from SecureStore — show nothing
    return null;
  }

  if (!user) {
    // Show auth screens without the app stack
    return (
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/register" />
        <Stack.Screen name="auth/forgot-password" />
        <Stack.Screen name="auth/reset-password" />
      </Stack>
    );
  }

  return <AuthenticatedApp />;
}

// ═════════════════════════════════════════════════════════════════════════════
// Authenticated app — loads data from Supabase, seeds sample data if empty
// ═════════════════════════════════════════════════════════════════════════════

function AuthenticatedApp() {
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const { user } = useSupabaseAuth();

  const staffStore = useStaffStore();
  const absenceStore = useAbsenceStore();
  const calendarStore = useCalendarStore();
  const notesStore = useNotesStore();
  const remindersStore = useRemindersStore();
  const notificationStore = useNotificationStore();

  const loadData = useCallback(async () => {
    if (!user) return;

    // Step 1: Run integrity check on local persisted stores
    await startupIntegrityCheck();

    // Step 2: Mark stores as loaded so Zustand rehydrates from AsyncStorage
    staffStore.setLoaded(true);
    absenceStore.setLoaded(true);
    calendarStore.setLoaded(true);
    notesStore.setLoaded(true);
    remindersStore.setLoaded(true);
    notificationStore.setLoaded(true);

    // Step 3: Migrate existing local data to Supabase (if first login)
    const migrated = await migrateIfNeeded(
      staffStore.staff,
      absenceStore.absences,
      notesStore.notes,
      remindersStore.reminders,
      calendarStore.events,
      notificationStore.preferences
    );

    // Step 4: Load data from Supabase (source of truth)
    const data = await loadAllFromSupabase();

    // Step 5: Replace local stores with Supabase data (carefully — don't
    // lose data if the Supabase fetch returns empty due to a network error)
    if (data.staff.length > 0) {
      staffStore.replaceStaff(data.staff);
    } else if (!migrated && staffStore.staff.length > 0) {
      // Fallback: keep local data if Supabase returns empty
      console.log("[_layout] Keeping local staff data (Supabase returned empty)");
    }

    if (data.absences.length > 0) {
      absenceStore.replaceAbsences(data.absences);
    } else if (!migrated && absenceStore.absences.length > 0) {
      console.log("[_layout] Keeping local absences data (Supabase returned empty)");
    }

    if (data.calendarEvents.length > 0) {
      calendarStore.replaceEvents(data.calendarEvents);
    } else if (!migrated && calendarStore.events.length > 0) {
      console.log("[_layout] Keeping local calendar events (Supabase returned empty)");
    }

    if (data.notes.length > 0) {
      notesStore.replaceNotes(data.notes);
    } else if (!migrated && notesStore.notes.length > 0) {
      console.log("[_layout] Keeping local notes data (Supabase returned empty)");
    }

    if (data.reminders.length > 0) {
      remindersStore.replaceReminders(data.reminders);
    } else if (!migrated && remindersStore.reminders.length > 0) {
      console.log("[_layout] Keeping local reminders data (Supabase returned empty)");
    }

    if (data.notifPrefs) {
      notificationStore.setPreferences(data.notifPrefs);
    }

    // Step 6: Seed public holidays only — no sample staff or absences
    seedPublicHolidays(absenceStore);

    // Step 7: Initialize notifications
    initializeNotifications(user.id);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reschedule notifications when preferences change
  useEffect(() => {
    if (!notificationStore.isLoaded || !user) return;

    const timeout = setTimeout(() => {
      scheduleDailyNotifications(user.id);
    }, 500);

    return () => clearTimeout(timeout);
  }, [
    notificationStore.preferences.morningEnabled,
    notificationStore.preferences.eveningEnabled,
    notificationStore.preferences.instantAlertsEnabled,
    notificationStore.isLoaded,
    user,
  ]);

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontWeight: "bold" as const,
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
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
        name="staff/bulk-import"
        options={{ presentation: "modal", title: "Bulk Import" }}
      />
      <Stack.Screen
        name="settings/archived-staff"
        options={{ title: "Archived Staff" }}
      />
      <Stack.Screen
        name="settings/about"
        options={{ title: "Support & About" }}
      />
    </Stack>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Public holiday seeding — these are reference data, not sample data
// ═════════════════════════════════════════════════════════════════════════════

import { upsertAbsence } from "@/lib/dataService";

const publicHolidays2026: Absence[] = [
  { id: "ph-2026-01-01", staffId: "public-holiday", name: "New Year's Day", type: "Public Holiday", date: "2026-01-01", duration: "Full", status: "Approved", cover: null, notes: "UK public holiday", locked: true, createdBy: "system", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ph-2026-04-03", staffId: "public-holiday", name: "Good Friday", type: "Public Holiday", date: "2026-04-03", duration: "Full", status: "Approved", cover: null, notes: "UK public holiday", locked: true, createdBy: "system", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ph-2026-04-06", staffId: "public-holiday", name: "Easter Monday", type: "Public Holiday", date: "2026-04-06", duration: "Full", status: "Approved", cover: null, notes: "UK public holiday", locked: true, createdBy: "system", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ph-2026-05-04", staffId: "public-holiday", name: "Early May Bank Holiday", type: "Public Holiday", date: "2026-05-04", duration: "Full", status: "Approved", cover: null, notes: "UK public holiday", locked: true, createdBy: "system", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ph-2026-05-25", staffId: "public-holiday", name: "Spring Bank Holiday", type: "Public Holiday", date: "2026-05-25", duration: "Full", status: "Approved", cover: null, notes: "UK public holiday", locked: true, createdBy: "system", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ph-2026-08-31", staffId: "public-holiday", name: "Summer Bank Holiday", type: "Public Holiday", date: "2026-08-31", duration: "Full", status: "Approved", cover: null, notes: "UK public holiday", locked: true, createdBy: "system", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ph-2026-12-25", staffId: "public-holiday", name: "Christmas Day", type: "Public Holiday", date: "2026-12-25", duration: "Full", status: "Approved", cover: null, notes: "UK public holiday", locked: true, createdBy: "system", createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "ph-2026-12-28", staffId: "public-holiday", name: "Boxing Day (substitute day)", type: "Public Holiday", date: "2026-12-28", duration: "Full", status: "Approved", cover: null, notes: "UK public holiday", locked: true, createdBy: "system", createdAt: "2026-01-01T00:00:00.000Z" },
];

function seedPublicHolidays(absenceStore: ReturnType<typeof useAbsenceStore>) {
  const existing = new Set(absenceStore.absences.map((a) => a.id));
  let added = false;
  for (const holiday of publicHolidays2026) {
    if (!existing.has(holiday.id)) {
      absenceStore.addAbsence(holiday);
      added = true;
    }
  }
  // Sync all public holidays to Supabase so they appear on other devices
  if (added) {
    const currentHolidays = useAbsenceStore.getState().absences.filter(
      (a) => a.type === "Public Holiday"
    );
    currentHolidays.forEach((h) => {
      upsertAbsence(h).catch((e) =>
        console.warn("[_layout] Failed to sync public holiday:", h.id, e)
      );
    });
  }
}
