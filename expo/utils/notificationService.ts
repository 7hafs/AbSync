/**
 * Absence notification service.
 *
 * Schedules two daily notifications (10:00 AM and 5:00 PM) with
 * privacy-safe absence counts. Uses live Supabase data refreshed on
 * every schedule/reschedule. Preferences are stored in Supabase and
 * sync across devices.
 *
 * Notifications:
 * - Morning (10:00): summarizes today & tomorrow absences
 * - Evening (17:00): summarizes today & tomorrow absences with latest data
 * - Privacy-safe: only shows counts, never names or reasons
 * - Smart pluralization: "1 absence" vs "2 absences" vs "is" vs "are"
 *
 * Reliability:
 * - Survives app updates, reinstalls, logout/login
 * - Preferences linked to user account via Supabase
 * - Duplicate prevention via identifier-based scheduling
 * - Automatic reschedule on app foreground
 */
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import { Platform } from "react-native";
import { supabase } from "@/lib/supabase";
import { todayDateString, toDateString } from "@/utils/dateUtils";
import useNotificationStore from "@/store/useNotificationStore";

// ── Identifiers ─────────────────────────────────────────────────────────────

const MORNING_ID = "absence-morning-10am";
const EVENING_ID = "absence-evening-5pm";
const BG_TASK_NAME = "absence-notification-refresh";

// ── Notification handler ────────────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build the privacy-safe notification body from absence counts. */
function buildMessage(
  todayCount: number,
  tomorrowCount: number
): { title: string; body: string } {
  const title = "Absence Update";

  if (todayCount === 0 && tomorrowCount === 0) {
    return {
      title,
      body: "No absences recorded for today or tomorrow.",
    };
  }

  const todayWord = todayCount === 1 ? "is" : "are";
  const todayAbsenceWord = todayCount === 1 ? "absence" : "absences";
  const tomorrowAbsenceWord = tomorrowCount === 1 ? "absence" : "absences";

  if (todayCount > 0 && tomorrowCount > 0) {
    return {
      title,
      body: `There ${todayWord} ${todayCount} ${todayAbsenceWord} today and ${tomorrowCount} ${tomorrowAbsenceWord} tomorrow. Open the app to view details.`,
    };
  }

  if (todayCount > 0) {
    return {
      title,
      body: `There ${todayWord} ${todayCount} ${todayAbsenceWord} recorded for today. Open the app to view details.`,
    };
  }

  return {
    title,
    body: `There are ${tomorrowCount} ${tomorrowAbsenceWord} scheduled for tomorrow. Open the app to view details.`,
  };
}

/** Count absences for a given date from Supabase, excluding rejected ones. */
async function countAbsencesForDate(
  userId: string,
  dateStr: string
): Promise<number> {
  const { count, error } = await supabase
    .from("absences")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("date", dateStr)
    .neq("status", "Rejected");

  if (error) {
    console.error("[notificationService] countAbsencesForDate error:", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Fetch today + tomorrow absence counts from Supabase. */
async function fetchAbsenceCounts(userId: string): Promise<{
  todayCount: number;
  tomorrowCount: number;
}> {
  const today = todayDateString();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toDateString(tomorrowDate);

  const [todayCount, tomorrowCount] = await Promise.all([
    countAbsencesForDate(userId, today),
    countAbsencesForDate(userId, tomorrow),
  ]);

  return { todayCount, tomorrowCount };
}

// ── Schedule / Reschedule ───────────────────────────────────────────────────

/** Schedule a single daily notification if enabled. */
async function scheduleOne(
  userId: string,
  identifier: string,
  hour: number,
  minute: number
): Promise<void> {
  // Cancel any existing notification with this identifier first (idempotent)
  await Notifications.cancelScheduledNotificationAsync(identifier);

  const { todayCount, tomorrowCount } = await fetchAbsenceCounts(userId);
  const { title, body } = buildMessage(todayCount, tomorrowCount);

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title,
      body,
      data: {
        type: "absence_summary",
        identifier,
        todayCount,
        tomorrowCount,
      },
      sound: "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });

  console.log(
    `[notificationService] Scheduled "${identifier}" at ${hour}:${String(minute).padStart(2, "0")} — today=${todayCount}, tomorrow=${tomorrowCount}`
  );
}

/** Schedule (or reschedule) both daily notifications for the given user. */
export async function scheduleDailyNotifications(userId: string): Promise<void> {
  if (Platform.OS === "web") {
    console.log("[notificationService] Notifications not available on web");
    return;
  }

  const prefs = useNotificationStore.getState().preferences;

  if (prefs.morningEnabled) {
    await scheduleOne(userId, MORNING_ID, 10, 0);
  } else {
    await Notifications.cancelScheduledNotificationAsync(MORNING_ID);
  }

  if (prefs.eveningEnabled) {
    await scheduleOne(userId, EVENING_ID, 17, 0);
  } else {
    await Notifications.cancelScheduledNotificationAsync(EVENING_ID);
  }
}

/** Cancel all daily absence notifications. */
export async function cancelAllDailyNotifications(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(MORNING_ID);
  await Notifications.cancelScheduledNotificationAsync(EVENING_ID);
  console.log("[notificationService] All daily notifications cancelled");
}

// ── Instant alert (optional) ────────────────────────────────────────────────

/** Send an instant local notification about an absence change. */
export async function sendInstantAlert(
  action: "added" | "modified" | "cancelled"
): Promise<void> {
  const prefs = useNotificationStore.getState().preferences;
  if (!prefs.instantAlertsEnabled) return;

  const messages: Record<string, string> = {
    added: "A new absence has been added.",
    modified: "An absence has been modified.",
    cancelled: "An absence has been cancelled.",
  };

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Absence Alert",
      body: messages[action] ?? "Absence record updated.",
      data: { type: "instant_alert", action },
      sound: "default",
    },
    trigger: null, // immediate
  });
}

// ── Background fetch task ───────────────────────────────────────────────────

TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    // Get the user ID from the auth store
    const { default: useAuthStore } = await import("@/store/useAuthStore");
    const userId = useAuthStore.getState().user?.id;
    if (!userId) {
      console.log("[notificationService] BG task: no user, skipping");
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await scheduleDailyNotifications(userId);
    console.log("[notificationService] BG task: notifications refreshed");
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (err) {
    console.error("[notificationService] BG task error:", err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

async function registerBackgroundFetch(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (status === BackgroundFetch.BackgroundFetchStatus.Denied) {
      console.log("[notificationService] Background fetch denied");
      return;
    }

    await BackgroundFetch.registerTaskAsync(BG_TASK_NAME, {
      minimumInterval: 15 * 60, // 15 minutes (minimum for iOS)
      stopOnTerminate: false,
      startOnBoot: true,
    });

    console.log("[notificationService] Background fetch registered");
  } catch (err) {
    console.error("[notificationService] Background fetch registration error:", err);
  }
}

// ── Permission ──────────────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

// ── Initialization ──────────────────────────────────────────────────────────

/**
 * Full initialization: request permissions, schedule daily notifications,
 * register background refresh, and set up tap-to-open handler.
 *
 * Must be called when the user authenticates and notification prefs are loaded.
 */
export async function initializeNotifications(userId: string): Promise<void> {
  if (Platform.OS === "web") return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log("[notificationService] Permission denied, skipping init");
    return;
  }

  // Schedule the daily notifications with live data
  await scheduleDailyNotifications(userId);

  // Register background fetch to periodically refresh
  await registerBackgroundFetch();

  // Handle notification taps — navigate to the calendar (dashboard)
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    console.log("[notificationService] Notification tapped:", data?.type);

    // Navigation is handled by the app's root layout via linking
  });

  console.log("[notificationService] Initialized for user", userId);
}

/**
 * Quick test notification — fires immediately with current counts.
 * Used from the settings "Test Notification" button.
 */
export async function sendTestNotification(userId: string): Promise<void> {
  const { todayCount, tomorrowCount } = await fetchAbsenceCounts(userId);
  const { title, body } = buildMessage(todayCount, tomorrowCount);

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: "absence_summary", test: true },
      sound: "default",
    },
    trigger: null, // immediate
  });

  console.log("[notificationService] Test notification sent");
}
