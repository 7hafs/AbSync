/**
 * Sync service — bridges local Zustand stores with Supabase persistence.
 *
 * Orchestrates:
 * - Loading all data from Supabase on login
 * - Migrating existing local data to Supabase on first login
 * - Tracking whether migration has been performed
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  fetchAllAbsences,
  fetchAllStaff,
  fetchAllCalendarEvents,
  fetchAllNotes,
  fetchAllReminders,
  fetchNotificationPreferences,
  migrateLocalDataToSupabase,
} from "@/lib/dataService";

const MIGRATION_FLAG_KEY = "supabase_migration_done_v1";

/** Check if the local-to-Supabase migration has been completed. */
export async function hasCompletedMigration(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(MIGRATION_FLAG_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

/** Mark the migration as completed. */
export async function markMigrationComplete(): Promise<void> {
  await AsyncStorage.setItem(MIGRATION_FLAG_KEY, "true");
}

/**
 * Load ALL data from Supabase into local stores.
 * Called after successful authentication.
 *
 * If the user has local data that hasn't been migrated yet, we:
 * 1. Upload local data to Supabase
 * 2. Then fetch from Supabase (so we get the definitive merged set)
 * 3. Mark migration complete
 *
 * If there is no local data or migration already completed:
 * 1. Just fetch from Supabase
 *
 * Returns the loaded data for each store.
 */
export async function loadAllFromSupabase(): Promise<{
  absences: ReturnType<typeof fetchAllAbsences> extends Promise<infer T> ? T : never;
  staff: ReturnType<typeof fetchAllStaff> extends Promise<infer T> ? T : never;
  calendarEvents: ReturnType<typeof fetchAllCalendarEvents> extends Promise<infer T> ? T : never;
  notes: ReturnType<typeof fetchAllNotes> extends Promise<infer T> ? T : never;
  reminders: ReturnType<typeof fetchAllReminders> extends Promise<infer T> ? T : never;
  notifPrefs: Awaited<ReturnType<typeof fetchNotificationPreferences>>;
}> {
  const migrationDone = await hasCompletedMigration();

  // If migration hasn't been done yet, attempt it.
  // The caller should pass local data for migration if needed.
  // We'll handle that in the root layout.

  // Fetch everything from Supabase in parallel
  const [absences, staff, calendarEvents, notes, reminders, notifPrefs] = await Promise.all([
    fetchAllAbsences(),
    fetchAllStaff(),
    fetchAllCalendarEvents(),
    fetchAllNotes(),
    fetchAllReminders(),
    fetchNotificationPreferences(),
  ]);

  console.log("[syncService] Loaded from Supabase:", {
    absences: absences.length,
    staff: staff.length,
    calendarEvents: calendarEvents.length,
    notes: notes.length,
    reminders: reminders.length,
    notifPrefs: notifPrefs ? "found" : "not found",
  });

  return { absences, staff, calendarEvents, notes, reminders, notifPrefs };
}

/**
 * Migrate local data to Supabase if migration hasn't been done.
 * Should be called ONCE after the first successful login.
 *
 * The caller passes the current local data from all stores.
 * After migration, we mark it complete so it never runs again.
 */
export async function migrateIfNeeded(
  localStaff: Parameters<typeof migrateLocalDataToSupabase>[0],
  localAbsences: Parameters<typeof migrateLocalDataToSupabase>[1],
  localNotes: Parameters<typeof migrateLocalDataToSupabase>[2],
  localReminders: Parameters<typeof migrateLocalDataToSupabase>[3],
  localEvents: Parameters<typeof migrateLocalDataToSupabase>[4],
  localNotifPrefs: Parameters<typeof migrateLocalDataToSupabase>[5]
): Promise<boolean> {
  const migrationDone = await hasCompletedMigration();
  if (migrationDone) {
    console.log("[syncService] Migration already completed, skipping");
    return false;
  }

  console.log("[syncService] Running local-to-Supabase migration...");
  await migrateLocalDataToSupabase(
    localStaff,
    localAbsences,
    localNotes,
    localReminders,
    localEvents,
    localNotifPrefs
  );
  await markMigrationComplete();
  console.log("[syncService] Migration complete");
  return true;
}
