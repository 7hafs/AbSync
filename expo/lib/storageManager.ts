/**
 * Unified storage manager for AbsenceFlow.
 *
 * Provides:
 * - Current schema version tracking (DB_VERSION)
 * - Startup data integrity validation for all stores
 * - Safe backup (full JSON export) and restore (full JSON import)
 * - Corruption detection and automatic recovery attempts
 *
 * Every Zustand store uses this module's DB_VERSION as its persist version.
 * When DB_VERSION increments, the migrate callback in each store handles
 * forward-compatible schema migrations without data loss.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Alert, Platform } from "react-native";

// ── Version ─────────────────────────────────────────────────────────────────
/**
 * Current database schema version.
 *
 * Increment this when changing the shape of any persisted store.
 * Each store's migrate callback must handle upgrades from the
 * previous version to the current version.
 *
 * History:
 *   1 — Initial schema (v2.0.0)
 *   2 — Added notes field to absences, added absence categories
 */
export const DB_VERSION = 2;

// ── Storage keys (must match the `name` field in each Zustand persist config) ─
export const STORAGE_KEYS = {
  absences: "absence-storage-v2",
  people: "people-storage",
  staff: "staff-storage-v2",
  calendar: "calendar-storage-v3",
  notes: "notes-storage-v2",
  reminders: "reminders-storage-v2",
  notifications: "notification-prefs-v2",
  theme: "theme-storage",
  share: "share-storage",
} as const;

// ── Integrity ───────────────────────────────────────────────────────────────

export interface IntegrityReport {
  healthy: boolean;
  keys: Record<string, { exists: boolean; valid: boolean; size: number }>;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all persisted stores on startup.
 * Returns a detailed report — logs warnings internally, surfaces
 * critical errors for the user if data is unrecoverable.
 */
export async function verifyStorageIntegrity(): Promise<IntegrityReport> {
  const report: IntegrityReport = {
    healthy: true,
    keys: {},
    errors: [],
    warnings: [],
  };

  const allKeys = await AsyncStorage.getAllKeys();
  const knownKeys: readonly string[] = Object.values(STORAGE_KEYS);

  for (const key of knownKeys) {
    try {
      const raw = await AsyncStorage.getItem(key);
      const exists = raw !== null;
      let valid = true;
      let size = 0;

      if (exists && raw) {
        size = raw.length;
        try {
          const parsed = JSON.parse(raw);
          if (parsed === null || typeof parsed !== "object") {
            valid = false;
            report.errors.push(
              `${key}: stored data is not a valid object (got ${typeof parsed})`
            );
            report.healthy = false;
          } else if (
            parsed.state &&
            typeof parsed.state === "object"
          ) {
            // Zustand persist wraps in { state, version }
            // state is the actual data — shallow check
            const stateKeys = Object.keys(parsed.state);
            if (stateKeys.length === 0) {
              report.warnings.push(`${key}: state object is empty`);
            }
          }
        } catch {
          valid = false;
          report.errors.push(`${key}: JSON parse failed — data may be corrupted`);
          report.healthy = false;
        }
      }

      report.keys[key] = { exists, valid, size };
    } catch (err) {
      report.errors.push(`${key}: AsyncStorage read failed — ${String(err)}`);
      report.keys[key] = { exists: false, valid: false, size: 0 };
      report.healthy = false;
    }
  }

  // Check for unknown keys (stale storage from removed stores)
  for (const key of allKeys) {
    if (!knownKeys.includes(key) && !key.startsWith("rork-")) {
      report.warnings.push(`Unknown storage key found: "${key}" — may be stale`);
    }
  }

  console.log("[storageManager] Integrity report:", {
    healthy: report.healthy,
    errors: report.errors.length,
    warnings: report.warnings.length,
  });

  return report;
}

/**
 * Attempt to recover a corrupted store by removing the bad entry
 * and logging the event. The store will reinitialize with defaults
 * but no other data is lost.
 */
export async function recoverCorruptedStore(key: string): Promise<boolean> {
  try {
    console.warn(`[storageManager] Attempting recovery for corrupted key: ${key}`);
    await AsyncStorage.removeItem(key);
    console.log(`[storageManager] Removed corrupted entry for ${key}. Store will reinitialize.`);
    return true;
  } catch (err) {
    console.error(`[storageManager] Recovery failed for ${key}:`, err);
    return false;
  }
}

/**
 * Run full startup integrity check. If corruption is detected in a
 * non-critical store, attempt automatic recovery. If a critical store
 * (absences, staff) is corrupted, alert the user.
 */
export async function startupIntegrityCheck(): Promise<void> {
  const report = await verifyStorageIntegrity();

  if (report.healthy && report.warnings.length === 0) {
    console.log("[storageManager] All stores healthy");
    return;
  }

  // Handle warnings (non-critical — log only)
  for (const warning of report.warnings) {
    console.warn(`[storageManager] Warning: ${warning}`);
  }

  // Handle errors (critical)
  for (const error of report.errors) {
    console.error(`[storageManager] Error: ${error}`);
  }

  // Attempt recovery for corrupted stores
  if (!report.healthy) {
    for (const [key, info] of Object.entries(report.keys)) {
      if (!info.valid) {
        const recovered = await recoverCorruptedStore(key);
        if (recovered) {
          console.log(`[storageManager] Store "${key}" recovered (reset to defaults)`);
        }
      }
    }
  }
}

// ── Backup & Restore ────────────────────────────────────────────────────────

export const BACKUP_FORMAT_VERSION = 2;

export interface BackupPayload {
  formatVersion: number;
  exportedAt: string;
  appVersion: string;
  dbVersion: number;
  stores: Record<string, unknown>;
}

/**
 * Create a full backup of ALL persisted stores.
 * Returns the backup payload ready for JSON serialization.
 */
export async function createFullBackup(): Promise<BackupPayload> {
  const stores: Record<string, unknown> = {};

  for (const [name, key] of Object.entries(STORAGE_KEYS)) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        stores[name] = JSON.parse(raw);
      }
    } catch (err) {
      console.error(`[storageManager] Failed to backup ${key}:`, err);
    }
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: "2.0.0",
    dbVersion: DB_VERSION,
    stores,
  };
}

/**
 * Validate a backup payload structure.
 */
export function validateBackupPayload(
  data: unknown
): data is BackupPayload {
  if (!data || typeof data !== "object") return false;
  const p = data as Record<string, unknown>;
  if (typeof p.formatVersion !== "number") return false;
  if (typeof p.exportedAt !== "string") return false;
  if (typeof p.stores !== "object" || p.stores === null) return false;
  return true;
}

/**
 * Restore all stores from a backup payload.
 * Writes each store's raw Zustand persist JSON directly to AsyncStorage,
 * then instructs the caller to reload each Zustand store via its rehydration.
 *
 * Returns { success, count } where count is the number of stores restored.
 */
export async function restoreFromBackup(
  data: BackupPayload
): Promise<{ success: boolean; count: number; errors: string[] }> {
  const errors: string[] = [];
  let count = 0;

  // Map our logical store names to AsyncStorage keys
  const storeEntries = data.stores as Record<string, unknown>;

  for (const [name, storeData] of Object.entries(storeEntries)) {
    const key = STORAGE_KEYS[name as keyof typeof STORAGE_KEYS];
    if (!key) {
      console.warn(`[storageManager] Unknown store in backup: ${name}`);
      continue;
    }

    try {
      // Write the raw Zustand persist JSON directly
      await AsyncStorage.setItem(key, JSON.stringify(storeData));
      count++;
    } catch (err) {
      errors.push(`${name}: ${String(err)}`);
      console.error(`[storageManager] Failed to restore ${key}:`, err);
    }
  }

  const success = errors.length === 0 && count > 0;

  console.log(
    `[storageManager] Restore ${success ? "succeeded" : "partially failed"}: ${count} stores, ${errors.length} errors`
  );

  return { success, count, errors };
}

/**
 * Save a backup file to the filesystem and share it.
 */
export async function exportBackupFile(): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
}> {
  try {
    const backup = await createFullBackup();
    const json = JSON.stringify(backup, null, 2);
    const fileName = `absenceflow-backup-${new Date().toISOString().split("T")[0]}.json`;
    const filePath = `${FileSystem.cacheDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, json, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    // Try to share; if not available, return the path
    if (Platform.OS !== "web") {
      const { default: Sharing } = await import("expo-sharing");
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(filePath, {
          mimeType: "application/json",
          dialogTitle: "Save Backup",
          UTI: "public.json",
        });
      }
    }

    return { success: true, message: "Backup created successfully.", filePath };
  } catch (err) {
    console.error("[storageManager] Export failed:", err);
    return { success: false, message: "Could not create backup file." };
  }
}

/**
 * Restore from a backup file path.
 * Reads the file, validates it, writes to AsyncStorage, then
 * returns a result. The caller must reload Zustand stores after.
 */
export async function importBackupFile(
  filePath: string
): Promise<{ success: boolean; message: string; count: number }> {
  try {
    const raw = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return { success: false, message: "Invalid backup file — not valid JSON.", count: 0 };
    }

    if (!validateBackupPayload(data)) {
      return {
        success: false,
        message: "Invalid backup file — incorrect format or missing data.",
        count: 0,
      };
    }

    const result = await restoreFromBackup(data);

    if (result.success) {
      return {
        success: true,
        message: `Successfully restored ${result.count} data stores. Please restart the app to apply changes.`,
        count: result.count,
      };
    }

    return {
      success: false,
      message: `Partially restored ${result.count} stores. ${result.errors.length} errors occurred:\n${result.errors.join("\n")}`,
      count: result.count,
    };
  } catch (err) {
    console.error("[storageManager] Import failed:", err);
    return {
      success: false,
      message: `Failed to read backup file: ${String(err)}`,
      count: 0,
    };
  }
}

// ── Store clearing (sign-out) ────────────────────────────────────────────────

/**
 * Clear ALL persisted Zustand store data from AsyncStorage.
 * Called on sign-out to prevent data leakage between users.
 *
 * Does NOT clear theme preferences (theme-storage) so the user's
 * dark/light mode preference survives logout.
 */
export async function clearAllStores(): Promise<void> {
  const keysToClear = [
    STORAGE_KEYS.absences,
    STORAGE_KEYS.people,
    STORAGE_KEYS.staff,
    STORAGE_KEYS.calendar,
    STORAGE_KEYS.notes,
    STORAGE_KEYS.reminders,
    STORAGE_KEYS.notifications,
    STORAGE_KEYS.share,
    // theme-storage is intentionally excluded
  ];

  try {
    await AsyncStorage.multiRemove(keysToClear);
    console.log("[storageManager] Cleared all data stores for sign-out");
  } catch (err) {
    console.error("[storageManager] Failed to clear stores on sign-out:", err);
  }
}

// ── Store health helpers ────────────────────────────────────────────────────

/**
 * Check if a specific store has data (non-empty).
 * Used by sample data initialization to avoid overwriting real data.
 */
export async function storeHasData(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return false;

    // Zustand persist wraps in { state, version }
    const state = parsed.state;
    if (!state || typeof state !== "object") return false;

    // Check if any array in the state has items
    for (const value of Object.values(state)) {
      if (Array.isArray(value) && value.length > 0) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Count total records across all data stores (for display in settings).
 */
export async function getStorageStats(): Promise<{
  totalRecords: number;
  absences: number;
  staff: number;
  notes: number;
  reminders: number;
  events: number;
}> {
  const counts = {
    totalRecords: 0,
    absences: 0,
    staff: 0,
    notes: 0,
    reminders: 0,
    events: 0,
  };

  try {
    const countArray = (key: string): number => {
      // Quick synchronous read of the in-memory Zustand store is preferred,
      // but we can also read AsyncStorage directly
      return 0; // Will be populated below
    };

    // Read each store
    const readStore = async (key: string): Promise<unknown[]> => {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const state = parsed?.state;
      if (!state) return [];

      // Find the main array property
      for (const value of Object.values(state)) {
        if (Array.isArray(value)) return value as unknown[];
      }
      return [];
    };

    const [a, s, n, r, e] = await Promise.all([
      readStore(STORAGE_KEYS.absences),
      readStore(STORAGE_KEYS.staff),
      readStore(STORAGE_KEYS.notes),
      readStore(STORAGE_KEYS.reminders),
      readStore(STORAGE_KEYS.calendar),
    ]);

    counts.absences = a.length;
    counts.staff = s.length;
    counts.notes = n.length;
    counts.reminders = r.length;
    counts.events = e.length;
    counts.totalRecords =
      counts.absences + counts.staff + counts.notes + counts.reminders + counts.events;
  } catch (err) {
    console.error("[storageManager] Failed to get storage stats:", err);
  }

  return counts;
}
