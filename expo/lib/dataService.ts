/**
 * Supabase data service — all CRUD operations for each table.
 *
 * Every write is scoped to the authenticated user via user_id.
 * Reads are filtered by RLS policies on the server side.
 *
 * This module is called by Zustand stores to persist writes to Supabase
 * and by the root layout to load data on startup.
 */
import { supabase } from "@/lib/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Absence, StaffMember, EventType, NoteType, ReminderType, NotificationPreferences } from "@/types";
import { Tables, TablesInsert } from "@/integrations/supabase/types";

// ── Types ────────────────────────────────────────────────────────────────────

type SupabaseAbsence = Tables<"absences">;
type SupabaseStaffMember = Tables<"staff_members">;
type SupabaseCalendarEvent = Tables<"calendar_events">;
type SupabaseNote = Tables<"notes">;
type SupabaseReminder = Tables<"reminders">;
type SupabaseNotifPrefs = Tables<"notification_preferences">;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get the current user ID from the cached session. */
async function getUserIdAsync(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// ── Retry & Resilience ───────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const OFFLINE_QUEUE_KEY = "offline-queue";

interface QueuedOperation {
  id: string;
  table: string;
  operation: "upsert" | "delete";
  payload: unknown;
  timestamp: string;
  retries: number;
}

/**
 * Retry a Supabase operation with exponential backoff.
 * Returns the result or throws after exhausting retries.
 */
async function withRetry(
  operation: () => Promise<any>,
  context: string,
  maxRetries = MAX_RETRIES
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (!result || !result.error) return;

      const pgError = result.error as { code?: string; message?: string };
      // Don't retry FK violations, unique violations, or auth errors
      if (
        pgError.code === "23503" || // FK violation
        pgError.code === "23505" || // unique violation
        pgError.code === "42501" || // permission denied
        pgError.code === "PGRST301" // RLS violation
      ) {
        console.error(`[dataService] ${context} non-retryable:`, pgError.message);
        throw result.error;
      }

      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[dataService] ${context} attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      console.error(`[dataService] ${context} exhausted retries:`, pgError.message);
      throw result.error;
    } catch (err) {
      if (attempt < maxRetries && !(err as { code?: string })?.code) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[dataService] ${context} network error, retrying in ${delay}ms...`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`[dataService] ${context}: unreachable`);
}

// ── Offline Queue ─────────────────────────────────────────────────────────────

/** Enqueue an operation to be retried when connectivity returns. */
async function enqueueOffline(table: string, operation: "upsert" | "delete", payload: unknown): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue: QueuedOperation[] = raw ? JSON.parse(raw) : [];
    queue.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      table,
      operation,
      payload,
      timestamp: new Date().toISOString(),
      retries: 0,
    });
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    console.log(`[dataService] Enqueued offline ${operation} on ${table}`);
  } catch (err) {
    console.error("[dataService] Failed to enqueue offline operation:", err);
  }
}

/** Get the current offline queue size. */
export async function getOfflineQueueSize(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return 0;
    const queue: QueuedOperation[] = JSON.parse(raw);
    return queue.length;
  } catch {
    return 0;
  }
}

/** Process the offline queue, retrying all pending operations. */
export async function processOfflineQueue(): Promise<{ processed: number; failed: number }> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return { processed: 0, failed: 0 };
    const queue: QueuedOperation[] = JSON.parse(raw);
    if (queue.length === 0) return { processed: 0, failed: 0 };

    console.log(`[dataService] Processing ${queue.length} offline operations...`);
    const remaining: QueuedOperation[] = [];
    let processed = 0;
    let failed = 0;

    for (const op of queue) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tableRef = supabase.from(op.table as any) as any;
        if (op.operation === "upsert") {
          await withRetry(
            () => tableRef.upsert(op.payload, { onConflict: "id" }),
            `offline-${op.table}-upsert`
          );
        } else {
          await withRetry(
            () => tableRef.delete().eq("id", (op.payload as { id: string }).id),
            `offline-${op.table}-delete`
          );
        }
        processed++;
      } catch {
        if (op.retries < MAX_RETRIES) {
          remaining.push({ ...op, retries: op.retries + 1 });
        }
        failed++;
      }
    }

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
    console.log(`[dataService] Offline queue: ${processed} processed, ${failed} failed, ${remaining.length} remaining`);
    return { processed, failed };
  } catch (err) {
    console.error("[dataService] Failed to process offline queue:", err);
    return { processed: 0, failed: 0 };
  }
}

// ── Audit Logging ─────────────────────────────────────────────────────────────

export type AuditAction =
  | "staff_created"
  | "staff_updated"
  | "staff_deleted"
  | "staff_activated"
  | "staff_deactivated"
  | "absence_created"
  | "absence_updated"
  | "absence_deleted"
  | "absence_approved"
  | "absence_rejected";

/**
 * Write an audit log entry to the audit_logs table.
 * Fire-and-forget — never blocks the UI or throws.
 */
export async function writeAuditLog(
  action: AuditAction,
  entityType: string,
  entityId: string,
  oldValues?: Record<string, unknown>,
  newValues?: Record<string, unknown>
): Promise<void> {
  try {
    const userId = await getUserIdAsync();
    if (!userId) return;

    const { error } = await supabase.from("audit_logs" as any).insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      old_values: oldValues ? (JSON.parse(JSON.stringify(oldValues)) as unknown as Record<string, unknown>) : null,
      new_values: newValues ? (JSON.parse(JSON.stringify(newValues)) as unknown as Record<string, unknown>) : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    if (error) {
      console.warn("[dataService] Audit log write failed:", error.message);
    }
  } catch (err) {
    console.warn("[dataService] Audit log write error:", err);
  }
}

// ── Supabase Storage ──────────────────────────────────────────────────────────

const BUCKETS = {
  documents: "absence-documents",
  uploads: "staff-uploads",
  imports: "staff-imports",
} as const;

/** Ensure a storage bucket exists, creating it if needed. */
async function ensureBucket(bucketName: string): Promise<boolean> {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === bucketName);
    if (exists) return true;

    const { error } = await supabase.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024, // 10MB
    });
    if (error) {
      console.warn(`[dataService] Failed to create bucket "${bucketName}":`, error.message);
      return false;
    }
    console.log(`[dataService] Created storage bucket: ${bucketName}`);
    return true;
  } catch (err) {
    console.warn(`[dataService] Bucket ensure error for "${bucketName}":`, err);
    return false;
  }
}

/**
 * Upload a file to Supabase Storage.
 * Returns the public URL on success, null on failure.
 */
export async function uploadToStorage(
  bucket: keyof typeof BUCKETS,
  path: string,
  file: { uri: string; type: string; name: string }
): Promise<string | null> {
  try {
    await ensureBucket(BUCKETS[bucket]);

    const userId = await getUserIdAsync();
    if (!userId) return null;

    const fullPath = `${userId}/${path}`;

    // For React Native, use fetch to get blob
    const response = await fetch(file.uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from(BUCKETS[bucket])
      .upload(fullPath, blob, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      console.error(`[dataService] Upload to ${bucket} failed:`, error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKETS[bucket])
      .getPublicUrl(fullPath);

    return urlData.publicUrl;
  } catch (err) {
    console.error(`[dataService] Upload error for ${bucket}:`, err);
    return null;
  }
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFromStorage(
  bucket: keyof typeof BUCKETS,
  path: string
): Promise<boolean> {
  try {
    const userId = await getUserIdAsync();
    if (!userId) return false;

    const { error } = await supabase.storage
      .from(BUCKETS[bucket])
      .remove([`${userId}/${path}`]);

    if (error) {
      console.error(`[dataService] Delete from ${bucket} failed:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[dataService] Delete error for ${bucket}:`, err);
    return false;
  }
}

// ── Sync Status ───────────────────────────────────────────────────────────────

export type SyncStatus = "synced" | "syncing" | "offline" | "error";

let currentSyncStatus: SyncStatus = "synced";
let syncListeners: Array<(status: SyncStatus) => void> = [];

/** Get the current sync status. */
export function getSyncStatus(): SyncStatus {
  return currentSyncStatus;
}

/** Subscribe to sync status changes. Returns unsubscribe function. */
export function onSyncStatusChange(listener: (status: SyncStatus) => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== listener);
  };
}

export function setSyncStatus(status: SyncStatus): void {
  if (currentSyncStatus === status) return;
  currentSyncStatus = status;
  console.log(`[dataService] Sync status: ${status}`);
  for (const listener of syncListeners) {
    try { listener(status); } catch { /* ignore listener errors */ }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ABSENCES
// ═════════════════════════════════════════════════════════════════════════════

/** Convert local Absence to Supabase insert shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function absenceToInsert(a: Absence): any {
  return {
    id: a.id,
    staff_id: a.staffId ?? null,
    name: a.name,
    type: a.type,
    date: a.date,
    duration: a.duration,
    status: a.status,
    cover: a.cover ?? null,
    notes: a.notes,
    locked: a.locked ?? false,
    created_by: a.createdBy,
    created_at: a.createdAt,
    documents: a.documents ? JSON.stringify(a.documents) : null,
    user_id: "", // filled by caller
  };
}

/** Convert Supabase row to local Absence shape. */
function absenceFromRow(row: SupabaseAbsence): Absence {
  let documents: Absence["documents"] = undefined;
  if (row.documents) {
    try {
      documents = JSON.parse(row.documents as string) as Absence["documents"];
    } catch { /* ignore parse errors */ }
  }
  return {
    id: row.id,
    staffId: row.staff_id,
    name: row.name,
    type: row.type as Absence["type"],
    date: row.date,
    duration: row.duration as Absence["duration"],
    status: row.status as Absence["status"],
    cover: row.cover ?? null,
    notes: row.notes ?? "",
    locked: row.locked ?? false,
    createdBy: row.created_by,
    createdAt: row.created_at ?? new Date().toISOString(),
    documents,
  };
}

export async function fetchAllAbsences(): Promise<Absence[]> {
  const { data, error } = await supabase.from("absences").select("*");
  if (error) {
    console.error("[dataService] fetchAllAbsences error:", error.message);
    return [];
  }
  return (data as SupabaseAbsence[]).map(absenceFromRow);
}

export async function upsertAbsence(absence: Absence): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) {
    console.warn("[dataService] upsertAbsence: not authenticated, skipping");
    return;
  }

  const insert = { ...absenceToInsert(absence), user_id: userId };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await withRetry(
      () => supabase.from("absences").upsert(insert as any, { onConflict: "id" }) as any,
      "upsertAbsence"
    );
  } catch {
    // If retries exhausted, enqueue for later
    await enqueueOffline("absences", "upsert", insert);
  }
}

export async function upsertAbsences(absences: Absence[]): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) {
    console.warn("[dataService] upsertAbsences: not authenticated, skipping");
    return;
  }

  const rows = absences.map((a) => ({ ...absenceToInsert(a), user_id: userId }));
  const { error } = await supabase.from("absences").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("[dataService] upsertAbsences error:", error.message);
  }
}

export async function deleteAbsenceFromSupabase(id: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await withRetry(
      () => supabase.from("absences").delete().eq("id", id) as any,
      "deleteAbsence"
    );
  } catch (err) {
    const error = err as { message?: string };
    console.error("[dataService] deleteAbsence error:", error.message);
    await enqueueOffline("absences", "delete", { id });
  }
}

/** Delete all absences for a given staff member from Supabase (cascade on staff delete). */
export async function deleteAbsencesForStaffFromSupabase(staffId: string): Promise<void> {
  const { error } = await supabase.from("absences").delete().eq("staff_id", staffId);
  if (error) {
    console.error("[dataService] deleteAbsencesForStaff error:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// STAFF MEMBERS
// ═════════════════════════════════════════════════════════════════════════════

function staffToInsert(s: StaffMember): TablesInsert<"staff_members"> {
  return {
    id: s.id,
    name: s.name,
    department: s.department ?? null,
    employee_id: s.employeeId ?? null,
    email: s.email ?? null,
    job_title: s.jobTitle ?? null,
    phone_number: s.phoneNumber ?? null,
    active: s.active,
    created_at: s.createdAt,
    user_id: "",
  };
}

function staffFromRow(row: SupabaseStaffMember): StaffMember {
  const r = row as Record<string, unknown>;
  return {
    id: row.id,
    name: row.name,
    department: row.department ?? undefined,
    employeeId: r.employee_id as string ?? undefined,
    email: r.email as string ?? undefined,
    jobTitle: r.job_title as string ?? undefined,
    phoneNumber: r.phone_number as string ?? undefined,
    active: row.active ?? true,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export async function fetchAllStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase.from("staff_members").select("*");
  if (error) {
    console.error("[dataService] fetchAllStaff error:", error.message);
    return [];
  }
  return (data as SupabaseStaffMember[]).map(staffFromRow);
}

export async function upsertStaff(s: StaffMember): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) return;

  const insert = { ...staffToInsert(s), user_id: userId };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await withRetry(
      () => supabase.from("staff_members").upsert(insert as any, { onConflict: "id" }) as any,
      "upsertStaff"
    );
  } catch {
    await enqueueOffline("staff_members", "upsert", insert);
  }
}

export async function upsertStaffMembers(staff: StaffMember[]): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) return;

  const rows = staff.map((s) => ({ ...staffToInsert(s), user_id: userId }));
  const { error } = await supabase.from("staff_members").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("[dataService] upsertStaffMembers error:", error.message);
  }
}

export async function deleteStaffFromSupabase(id: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await withRetry(
      () => supabase.from("staff_members").delete().eq("id", id) as any,
      "deleteStaff"
    );
  } catch (err) {
    const error = err as { message?: string };
    console.error("[dataService] deleteStaff error:", error.message);
    await enqueueOffline("staff_members", "delete", { id });
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// CALENDAR EVENTS
// ═════════════════════════════════════════════════════════════════════════════

function eventToInsert(e: EventType): TablesInsert<"calendar_events"> {
  return {
    id: e.id,
    title: e.title,
    date: e.date,
    start_time: e.startTime ?? null,
    end_time: e.endTime ?? null,
    time_of_day: e.timeOfDay ?? null,
    person_id: e.personId ?? null,
    is_recurring: e.isRecurring,
    recurring_pattern: e.recurringPattern ?? null,
    user_id: "",
  };
}

function eventFromRow(row: SupabaseCalendarEvent): EventType {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    timeOfDay: (row.time_of_day as "AM" | "PM") ?? undefined,
    personId: row.person_id ?? undefined,
    isRecurring: row.is_recurring ?? false,
    recurringPattern: (row.recurring_pattern as EventType["recurringPattern"]) ?? undefined,
  };
}

export async function fetchAllCalendarEvents(): Promise<EventType[]> {
  const { data, error } = await supabase.from("calendar_events").select("*");
  if (error) {
    console.error("[dataService] fetchAllCalendarEvents error:", error.message);
    return [];
  }
  return (data as SupabaseCalendarEvent[]).map(eventFromRow);
}

export async function upsertCalendarEvent(e: EventType): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) return;

  const { error } = await supabase
    .from("calendar_events")
    .upsert({ ...eventToInsert(e), user_id: userId }, { onConflict: "id" });
  if (error) {
    console.error("[dataService] upsertCalendarEvent error:", error.message);
  }
}

export async function deleteCalendarEventFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) {
    console.error("[dataService] deleteCalendarEvent error:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// NOTES
// ═════════════════════════════════════════════════════════════════════════════

function noteToInsert(n: NoteType): TablesInsert<"notes"> {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    tags: n.tags,
    date: n.date ?? null,
    is_pinned: n.isPinned,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    user_id: "",
  };
}

function noteFromRow(row: SupabaseNote): NoteType {
  return {
    id: row.id,
    title: row.title,
    content: row.content ?? "",
    tags: row.tags ?? [],
    date: row.date ?? undefined,
    isPinned: row.is_pinned ?? false,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

export async function fetchAllNotes(): Promise<NoteType[]> {
  const { data, error } = await supabase.from("notes").select("*");
  if (error) {
    console.error("[dataService] fetchAllNotes error:", error.message);
    return [];
  }
  return (data as SupabaseNote[]).map(noteFromRow);
}

export async function upsertNote(n: NoteType): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) return;

  const { error } = await supabase
    .from("notes")
    .upsert({ ...noteToInsert(n), user_id: userId }, { onConflict: "id" });
  if (error) {
    console.error("[dataService] upsertNote error:", error.message);
  }
}

export async function deleteNoteFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) {
    console.error("[dataService] deleteNote error:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// REMINDERS
// ═════════════════════════════════════════════════════════════════════════════

function reminderToInsert(r: ReminderType): TablesInsert<"reminders"> {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    time: r.time ?? null,
    is_completed: r.isCompleted,
    is_recurring: r.isRecurring,
    recurring_pattern: r.recurringPattern ?? null,
    user_id: "",
  };
}

function reminderFromRow(row: SupabaseReminder): ReminderType {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time ?? undefined,
    isCompleted: row.is_completed ?? false,
    isRecurring: row.is_recurring ?? false,
    recurringPattern: (row.recurring_pattern as ReminderType["recurringPattern"]) ?? undefined,
  };
}

export async function fetchAllReminders(): Promise<ReminderType[]> {
  const { data, error } = await supabase.from("reminders").select("*");
  if (error) {
    console.error("[dataService] fetchAllReminders error:", error.message);
    return [];
  }
  return (data as SupabaseReminder[]).map(reminderFromRow);
}

export async function upsertReminder(r: ReminderType): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) return;

  const { error } = await supabase
    .from("reminders")
    .upsert({ ...reminderToInsert(r), user_id: userId }, { onConflict: "id" });
  if (error) {
    console.error("[dataService] upsertReminder error:", error.message);
  }
}

export async function deleteReminderFromSupabase(id: string): Promise<void> {
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) {
    console.error("[dataService] deleteReminder error:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// USER PREFERENCES (calendar view, etc.)
// ═════════════════════════════════════════════════════════════════════════════

export type CalendarViewPref = 'day' | 'week' | 'month';

export async function fetchCalendarView(): Promise<CalendarViewPref> {
  const userId = await getUserIdAsync();
  if (!userId) return 'week';

  const { data, error } = await supabase
    .from("profiles")
    .select("calendar_view")
    .eq("id", userId)
    .single();

  if (error || !data?.calendar_view) return 'week';
  return data.calendar_view as CalendarViewPref;
}

export async function upsertCalendarView(view: CalendarViewPref): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) return;

  // Use update first to avoid overwriting other profile fields (name, email)
  // that might not be loaded. Fall back to upsert if no profile row exists yet.
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ calendar_view: view })
    .eq("id", userId);

  if (updateError) {
    // If update fails (e.g. profile row doesn't exist yet), try upsert
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: userId, calendar_view: view }, { onConflict: "id" });
    if (upsertError) {
      console.error("[dataService] upsertCalendarView error:", upsertError.message);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATION PREFERENCES
// ═════════════════════════════════════════════════════════════════════════════

export async function fetchNotificationPreferences(): Promise<NotificationPreferences | null> {
  const userId = await getUserIdAsync();
  if (!userId) return null;

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return {
    morningEnabled: data.morning_enabled ?? true,
    eveningEnabled: data.evening_enabled ?? true,
    instantAlertsEnabled: data.instant_alerts_enabled ?? false,
  };
}

export async function upsertNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) return;

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        morning_enabled: prefs.morningEnabled,
        evening_enabled: prefs.eveningEnabled,
        instant_alerts_enabled: prefs.instantAlertsEnabled,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("[dataService] upsertNotificationPreferences error:", error.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MIGRATION: Bulk upload local data to Supabase
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Check if the device currently has network connectivity to Supabase.
 * Returns false if we can't reach the Supabase API.
 */
export async function isSupabaseReachable(): Promise<boolean> {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1);
    // Even if there are no rows, a successful query means we're connected
    return !error || error.code === "PGRST116"; // PGRST116 = no rows returned (still connected)
  } catch {
    return false;
  }
}

export async function migrateLocalDataToSupabase(
  staff: StaffMember[],
  absences: Absence[],
  notes: NoteType[],
  reminders: ReminderType[],
  events: EventType[],
  notifPrefs: NotificationPreferences
): Promise<void> {
  const userId = await getUserIdAsync();
  if (!userId) {
    console.warn("[dataService] migrateLocalDataToSupabase: not authenticated");
    return;
  }

  console.log("[dataService] Migrating local data to Supabase for user:", userId);

  if (staff.length > 0) {
    const staffRows = staff.map((s) => ({ ...staffToInsert(s), user_id: userId }));
    await supabase.from("staff_members").upsert(staffRows, { onConflict: "id" });
  }

  if (absences.length > 0) {
    const absenceRows = absences.map((a) => ({ ...absenceToInsert(a), user_id: userId }));
    await supabase.from("absences").upsert(absenceRows, { onConflict: "id" });
  }

  if (notes.length > 0) {
    const noteRows = notes.map((n) => ({ ...noteToInsert(n), user_id: userId }));
    await supabase.from("notes").upsert(noteRows, { onConflict: "id" });
  }

  if (reminders.length > 0) {
    const reminderRows = reminders.map((r) => ({ ...reminderToInsert(r), user_id: userId }));
    await supabase.from("reminders").upsert(reminderRows, { onConflict: "id" });
  }

  if (events.length > 0) {
    const eventRows = events.map((e) => ({ ...eventToInsert(e), user_id: userId }));
    await supabase.from("calendar_events").upsert(eventRows, { onConflict: "id" });
  }

  await upsertNotificationPreferences(notifPrefs);

  console.log("[dataService] Migration complete");
}
