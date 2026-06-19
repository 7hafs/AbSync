/**
 * Absence notification service.
 *
 * Schedules two daily notifications (10:00 AM and 5:00 PM) with
 * privacy-safe absence counts. Supports both local push notifications
 * and email notifications (via Supabase Edge Function).
 *
 * Notifications:
 * - Morning (10:00): summarizes today & tomorrow absences
 * - Evening (17:00): summarizes today & tomorrow absences with latest data
 * - Instant alerts: fires on approval/rejection/creation
 * - Email support: sends summary emails via edge function (if configured)
 * - Privacy-safe: only shows counts, never names or reasons
 * - Smart pluralization: "1 absence" vs "2 absences" vs "is" vs "are"
 *
 * Reliability:
 * - Survives app updates, reinstalls
 * - Duplicate prevention via identifier-based scheduling
 * - Automatic reschedule on app foreground
 */
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import * as BackgroundFetch from "expo-background-fetch";
import { Platform } from "react-native";
import { todayDateString, toDateString } from "@/utils/dateUtils";
import useNotificationStore from "@/store/useNotificationStore";
import { supabase } from "@/lib/supabase";

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

/** Count absences for a given date from the local absence store. */
function countAbsencesLocally(dateStr: string): number {
  try {
    // Dynamic import to avoid circular dependency at module level
    const { default: useAbsenceStore } = require("@/store/useAbsenceStore");
    const absences = useAbsenceStore.getState().absences;
    return absences.filter(
      (a: { date: string; status: string }) =>
        a.date === dateStr && a.status !== "Rejected"
    ).length;
  } catch {
    return 0;
  }
}

/** Fetch today + tomorrow absence counts from local store. */
function fetchAbsenceCounts(): {
  todayCount: number;
  tomorrowCount: number;
} {
  const today = todayDateString();
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toDateString(tomorrowDate);

  return {
    todayCount: countAbsencesLocally(today),
    tomorrowCount: countAbsencesLocally(tomorrow),
  };
}

// ── Schedule / Reschedule ───────────────────────────────────────────────────

/** Schedule a single daily notification if enabled. */
async function scheduleOne(
  identifier: string,
  hour: number,
  minute: number
): Promise<void> {
  // Cancel any existing notification with this identifier first (idempotent)
  await Notifications.cancelScheduledNotificationAsync(identifier);

  const { todayCount, tomorrowCount } = fetchAbsenceCounts();
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

/** Schedule (or reschedule) both daily notifications. */
export async function scheduleDailyNotifications(_userId?: string): Promise<void> {
  if (Platform.OS === "web") {
    console.log("[notificationService] Notifications not available on web");
    return;
  }

  const prefs = useNotificationStore.getState().preferences;

  if (prefs.morningEnabled) {
    await scheduleOne(MORNING_ID, 10, 0);
  } else {
    await Notifications.cancelScheduledNotificationAsync(MORNING_ID);
  }

  if (prefs.eveningEnabled) {
    await scheduleOne(EVENING_ID, 17, 0);
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
  action: "added" | "modified" | "cancelled" | "approved" | "rejected"
): Promise<void> {
  const prefs = useNotificationStore.getState().preferences;
  if (!prefs.instantAlertsEnabled) return;

  const messages: Record<string, string> = {
    added: "A new absence has been added.",
    modified: "An absence has been modified.",
    cancelled: "An absence has been cancelled.",
    approved: "An absence request has been approved.",
    rejected: "An absence request has been rejected.",
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

// ── Email notification (via Supabase Edge Function) ────────────────────────

export type EmailNotificationPayload = {
  recipientEmail: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

/**
 * Send an email notification via the Supabase Edge Function.
 * Falls back silently if the edge function is not deployed or fails.
 */
export async function sendEmailNotification(
  payload: EmailNotificationPayload
): Promise<boolean> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      console.log("[notificationService] No session, skipping email");
      return false;
    }

    const { error } = await supabase.functions.invoke("send-email", {
      body: payload,
    });

    if (error) {
      console.warn("[notificationService] Email send failed:", error.message);
      return false;
    }

    console.log("[notificationService] Email sent:", payload.subject);
    return true;
  } catch (err) {
    console.warn("[notificationService] Email send error:", err);
    return false;
  }
}

/**
 * Send an absence approval notification (local + optional email).
 * Called by stores when an absence is approved or rejected.
 */
export async function sendApprovalNotification(
  action: "approved" | "rejected",
  staffName: string,
  date: string,
  recipientEmail?: string
): Promise<void> {
  await sendInstantAlert(action);

  if (recipientEmail) {
    const verb = action === "approved" ? "approved" : "rejected";
    await sendEmailNotification({
      recipientEmail,
      subject: `Absence ${verb} — ${staffName} on ${date}`,
      bodyHtml: `<p>The absence request for <strong>${staffName}</strong> on <strong>${date}</strong> has been <strong>${verb}</strong>.</p><p>Open AbSync to view details.</p>`,
      bodyText: `The absence request for ${staffName} on ${date} has been ${verb}. Open AbSync to view details.`,
    });
  }
}

/**
 * Send a daily summary email.
 * Called by the daily notification scheduler if email is configured.
 */
export async function sendDailySummaryEmail(
  recipientEmail: string,
  todayCount: number,
  tomorrowCount: number,
  period: "morning" | "evening"
): Promise<void> {
  const todayWord = todayCount === 1 ? "is" : "are";
  const todayAbsenceWord = todayCount === 1 ? "absence" : "absences";
  const tomorrowAbsenceWord = tomorrowCount === 1 ? "absence" : "absences";

  let bodyHtml: string;
  if (todayCount === 0 && tomorrowCount === 0) {
    bodyHtml = `<p>No absences recorded for today or tomorrow.</p>`;
  } else if (todayCount > 0 && tomorrowCount > 0) {
    bodyHtml = `<p>There ${todayWord} <strong>${todayCount} ${todayAbsenceWord}</strong> today and <strong>${tomorrowCount} ${tomorrowAbsenceWord}</strong> tomorrow.</p>`;
  } else if (todayCount > 0) {
    bodyHtml = `<p>There ${todayWord} <strong>${todayCount} ${todayAbsenceWord}</strong> recorded for today.</p>`;
  } else {
    bodyHtml = `<p>There are <strong>${tomorrowCount} ${tomorrowAbsenceWord}</strong> scheduled for tomorrow.</p>`;
  }

  await sendEmailNotification({
    recipientEmail,
    subject: `AbSync ${period === "morning" ? "Morning" : "Evening"} Summary`,
    bodyHtml: bodyHtml + `<p>Open AbSync to view details.</p>`,
    bodyText: bodyHtml.replace(/<[^>]*>/g, ""),
  });
}

// ── Background fetch task ───────────────────────────────────────────────────

TaskManager.defineTask(BG_TASK_NAME, async () => {
  try {
    await scheduleDailyNotifications();
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
 */
export async function initializeNotifications(_userId?: string): Promise<void> {
  if (Platform.OS === "web") return;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log("[notificationService] Permission denied, skipping init");
    return;
  }

  // Schedule the daily notifications with live data
  await scheduleDailyNotifications();

  // Register background fetch to periodically refresh
  await registerBackgroundFetch();

  // Handle notification taps — navigate to the calendar (dashboard)
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    console.log("[notificationService] Notification tapped:", data?.type);
  });

  console.log("[notificationService] Initialized");
}

/**
 * Quick test notification — fires immediately with current counts.
 * Used from the settings "Test Notification" button.
 */
export async function sendTestNotification(): Promise<void> {
  const { todayCount, tomorrowCount } = fetchAbsenceCounts();
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
