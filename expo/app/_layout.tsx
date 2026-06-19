import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Linking from "expo-linking";
import { useEffect, useCallback, useRef } from "react";
import { useColorScheme, Platform } from "react-native";
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
import { startupIntegrityCheck, clearAllStores } from "@/lib/storageManager";
import { AuthProvider, useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { loadAllFromSupabase, migrateIfNeeded } from "@/lib/syncService";
import { fetchCalendarView, setSyncStatus, isSupabaseReachable } from "@/lib/dataService";
import { supabase } from "@/lib/supabase";
import { Absence } from "@/types";
import { toDateString } from "@/utils/dateUtils";
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
  const recoveryHandled = useRef(false);

  const inAuthGroup = segments[0] === "auth";

  // ── Handle URL-based recovery tokens (password reset) ─────────────────
  //
  // Supabase password reset emails contain a link like:
  //   https://p-...rork.live#access_token=abc&refresh_token=def&type=recovery
  //
  // We disabled detectSessionInUrl on the Supabase client so we can
  // control the flow: parse the hash ourselves, set the session, then
  // navigate to the dedicated reset-password screen.
  useEffect(() => {
    if (recoveryHandled.current) return;

    const handleUrl = async () => {
      try {
        const url =
          (await Linking.getInitialURL()) ??
          (Platform.OS === "web" ? window.location.href : null);

        if (!url) return;

        const hashIndex = url.indexOf("#");
        if (hashIndex === -1) return;

        const fragment = url.substring(hashIndex + 1);
        const params = new URLSearchParams(fragment);

        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        const type = params.get("type");

        if (!accessToken || !refreshToken || type !== "recovery") return;

        recoveryHandled.current = true;

        // Set the session manually (replaces what detectSessionInUrl would do)
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.warn("[AuthGate] Recovery setSession failed:", error.message);
          return;
        }

        // Session set — navigate to the reset-password form
        // Small delay so the AuthProvider's onAuthStateChange can fire first
        setTimeout(() => {
          router.replace("/auth/reset-password" as never);
        }, 100);
      } catch (e) {
        console.warn("[AuthGate] URL recovery parsing error:", e);
      }
    };

    handleUrl();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    if (!user && !inAuthGroup) {
      // Not authenticated — clear stores and redirect to login
      clearAllStores().catch((e) =>
        console.warn("[AuthGate] Failed to clear stores on sign-out:", e)
      );
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

    // Set syncing status
    setSyncStatus("syncing");

    // Check connectivity
    try {
      const reachable = await isSupabaseReachable();
      if (!reachable) {
        setSyncStatus("offline");
        console.log("[_layout] Supabase unreachable, using local data");
      }
    } catch {
      setSyncStatus("offline");
    }

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

    // Step 5b: Load calendar view preference from Supabase
    try {
      const savedView = await fetchCalendarView();
      if (savedView && ['day', 'week', 'month'].includes(savedView)) {
        calendarStore.setCalendarView(savedView);
        console.log("[_layout] Loaded calendar view preference:", savedView);
      }
    } catch (e) {
      console.warn("[_layout] Failed to load calendar view preference:", e);
    }

    // Step 6: Seed public holidays only — no sample staff or absences
    seedPublicHolidays(absenceStore);

    // Step 7: Initialize notifications
    initializeNotifications(user.id);

    // Mark synced
    setSyncStatus("synced");
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
        name="auth/reset-password"
        options={{ headerShown: false }}
      />
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
// Public holiday seeding — UK bank holidays, dynamically generated
// ═════════════════════════════════════════════════════════════════════════════

import { upsertAbsence } from "@/lib/dataService";

/**
 * Generate UK public holidays for a given year.
 * Covers New Year, Good Friday, Easter Monday, Early May, Spring,
 * Summer, Christmas, and Boxing Day (with substitute days).
 */
function generateUKHolidays(year: number): Absence[] {
  const holidays: Absence[] = [];

  // New Year's Day (Jan 1, or Jan 2 if Jan 1 is weekend)
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const nyDate = jan1Day === 0 || jan1Day === 6
    ? toDateString(new Date(year, 0, jan1Day === 0 ? 2 : 3))
    : toDateString(jan1);
  holidays.push(createHoliday(`ph-${nyDate}`, "New Year's Day", nyDate));

  // Easter calculation (Anonymous Gregorian algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31);
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  const easterSunday = new Date(year, easterMonth - 1, easterDay);

  // Good Friday (2 days before Easter Sunday)
  const goodFriday = new Date(easterSunday);
  goodFriday.setDate(goodFriday.getDate() - 2);
  holidays.push(createHoliday(`ph-${toDateString(goodFriday)}`, "Good Friday", toDateString(goodFriday)));

  // Easter Monday (1 day after Easter Sunday)
  const easterMonday = new Date(easterSunday);
  easterMonday.setDate(easterMonday.getDate() + 1);
  holidays.push(createHoliday(`ph-${toDateString(easterMonday)}`, "Easter Monday", toDateString(easterMonday)));

  // Early May Bank Holiday (first Monday in May)
  const may1 = new Date(year, 4, 1);
  const mayMonday = new Date(may1);
  mayMonday.setDate(1 + ((8 - may1.getDay()) % 7 || (may1.getDay() === 1 ? 0 : 7 - may1.getDay() + 1)));
  // Simplified: first Monday of May
  let firstMayMonday = 1;
  const d1 = new Date(year, 4, 1).getDay();
  firstMayMonday = d1 === 1 ? 1 : d1 === 0 ? 2 : 9 - d1;
  holidays.push(createHoliday(`ph-${year}-05-${String(firstMayMonday).padStart(2, '0')}`, "Early May Bank Holiday", `${year}-05-${String(firstMayMonday).padStart(2, '0')}`));

  // Spring Bank Holiday (last Monday in May)
  const may31 = new Date(year, 4, 31);
  const springMonday = 31 - ((may31.getDay() + 6) % 7);
  holidays.push(createHoliday(`ph-${year}-05-${String(springMonday).padStart(2, '0')}`, "Spring Bank Holiday", `${year}-05-${String(springMonday).padStart(2, '0')}`));

  // Summer Bank Holiday (last Monday in August)
  const aug31 = new Date(year, 7, 31);
  const summerMonday = 31 - ((aug31.getDay() + 6) % 7);
  holidays.push(createHoliday(`ph-${year}-08-${String(summerMonday).padStart(2, '0')}`, "Summer Bank Holiday", `${year}-08-${String(summerMonday).padStart(2, '0')}`));

  // Christmas Day (Dec 25, or substitute)
  const dec25 = new Date(year, 11, 25);
  const xmasDay = dec25.getDay();
  const xmasDate = xmasDay === 0 || xmasDay === 6
    ? toDateString(new Date(year, 11, xmasDay === 0 ? 27 : 28))
    : toDateString(dec25);
  holidays.push(createHoliday(`ph-${xmasDate}`, "Christmas Day", xmasDate));

  // Boxing Day (Dec 26, or substitute)
  const dec26 = new Date(year, 11, 26);
  const boxingDay = dec26.getDay();
  const boxingDate = boxingDay === 0 || boxingDay === 6
    ? toDateString(new Date(year, 11, boxingDay === 0 ? 28 : 27))
    : toDateString(dec26);
  holidays.push(createHoliday(`ph-${boxingDate}`, "Boxing Day", boxingDate));

  return holidays;
}

function createHoliday(id: string, name: string, date: string): Absence {
  return {
    id,
    staffId: null,
    name,
    type: "Public Holiday",
    date,
    duration: "Full",
    status: "Approved",
    cover: null,
    notes: "UK public holiday",
    locked: true,
    createdBy: "system",
    createdAt: `${date}T00:00:00.000Z`,
  };
}

function seedPublicHolidays(absenceStore: { absences: Absence[]; addAbsence: (a: Absence) => void }) {
  const currentYear = new Date().getFullYear();
  const allHolidays = [
    ...generateUKHolidays(currentYear),
    ...generateUKHolidays(currentYear + 1),
  ];

  const existing = new Set(absenceStore.absences.map((a: Absence) => a.id));
  const newlyAdded: Absence[] = [];

  for (const holiday of allHolidays) {
    if (!existing.has(holiday.id)) {
      absenceStore.addAbsence(holiday);
      newlyAdded.push(holiday);
    }
  }

  // Only sync newly-added public holidays to Supabase
  if (newlyAdded.length > 0) {
    newlyAdded.forEach((h) => {
      upsertAbsence(h).catch((e) =>
        console.warn("[_layout] Failed to sync public holiday:", h.id, e)
      );
    });
  }
}
