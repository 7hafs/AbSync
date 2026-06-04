/**
 * One-time migration from AsyncStorage to Supabase.
 *
 * This module handles the safe migration of existing local data
 * to the Supabase backend. It:
 * 1. Checks if migration has already been performed
 * 2. Reads existing data from AsyncStorage
 * 3. Bulk-inserts into Supabase
 * 4. Marks migration as complete
 *
 * Migration is idempotent — running it multiple times is safe.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import type { Absence, StaffMember } from "@/types";

const MIGRATION_KEY = "supabase_migration_completed_v1";
const OLD_ABSENCE_KEY = "absence-storage";
const OLD_STAFF_KEY = "staff-storage";

export async function hasMigrationCompleted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(MIGRATION_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function markMigrationComplete(): Promise<void> {
  await AsyncStorage.setItem(MIGRATION_KEY, "true");
}

/**
 * Migrate existing AsyncStorage data to Supabase.
 * Returns the count of migrated records, or 0 if already migrated.
 */
export async function migrateLocalDataToSupabase(
  userId: string
): Promise<{ staffCount: number; absenceCount: number }> {
  const alreadyMigrated = await hasMigrationCompleted();
  if (alreadyMigrated) {
    console.log("[migration] Already migrated, skipping");
    return { staffCount: 0, absenceCount: 0 };
  }

  console.log("[migration] Starting migration to Supabase for user", userId);

  let staffCount = 0;
  let absenceCount = 0;

  try {
    // Migrate staff
    const staffJson = await AsyncStorage.getItem(OLD_STAFF_KEY);
    if (staffJson) {
      const parsed = JSON.parse(staffJson);
      const staffList: StaffMember[] =
        parsed?.state?.staff ?? parsed?.staff ?? [];

      if (staffList.length > 0) {
        const rows = staffList.map((s) => ({
          id: s.id,
          user_id: userId,
          name: s.name,
          department: s.department ?? null,
          active: s.active,
          created_at: s.createdAt ?? new Date().toISOString(),
        }));

        // Insert in batches
        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const { error } = await supabase.from("staff_members").upsert(batch, {
            onConflict: "id",
          });
          if (error) {
            console.error(
              "[migration] Staff batch insert error:",
              error.message
            );
          }
        }
        staffCount = rows.length;
        console.log("[migration] Migrated", staffCount, "staff members");
      }
    }

    // Migrate absences
    const absenceJson = await AsyncStorage.getItem(OLD_ABSENCE_KEY);
    if (absenceJson) {
      const parsed = JSON.parse(absenceJson);
      const absenceList: Absence[] =
        parsed?.state?.absences ?? parsed?.absences ?? [];

      if (absenceList.length > 0) {
        const rows = absenceList.map((a) => ({
          id: a.id,
          user_id: userId,
          staff_id: a.staffId,
          name: a.name,
          type: a.type,
          date: a.date,
          duration: a.duration,
          status: a.status,
          cover: a.cover,
          notes: a.notes ?? "",
          locked: a.locked ?? false,
          created_by: a.createdBy,
          created_at: a.createdAt,
        }));

        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const { error } = await supabase.from("absences").upsert(batch, {
            onConflict: "id",
          });
          if (error) {
            console.error(
              "[migration] Absence batch insert error:",
              error.message
            );
          }
        }
        absenceCount = rows.length;
        console.log("[migration] Migrated", absenceCount, "absences");
      }
    }

    if (staffCount > 0 || absenceCount > 0) {
      await markMigrationComplete();
      console.log("[migration] Migration completed successfully");
    } else {
      // No data to migrate, but mark as done so we don't keep trying
      await markMigrationComplete();
    }

    return { staffCount, absenceCount };
  } catch (err) {
    console.error("[migration] Migration failed:", err);
    return { staffCount, absenceCount };
  }
}
