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
  | "absence_rejected"
  | "invitation_created"
  | "invitation_accepted"
  | "invitation_revoked"
  | "invitation_expired"
  | "invitation_resent";

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

// ═════════════════════════════════════════════════════════════════════════════
// ORGANISATIONS
// ═════════════════════════════════════════════════════════════════════════════

export type OrganisationRow = {
  id: string;
  name: string;
  owner_id: string | null;
  slug: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganisationMemberRow = {
  id: string;
  organisation_id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile_name: string | null;
  profile_email: string | null;
};

/** Fetch an organisation by ID. Returns null if not found. */
export async function fetchOrganisation(orgId: string): Promise<OrganisationRow | null> {
  const { data, error } = await supabase
    .from("organisations")
    .select("id, name, owner_id, slug, created_at, updated_at")
    .eq("id", orgId)
    .single();

  if (error) {
    console.error("[dataService] fetchOrganisation error:", error.message);
    return null;
  }
  return data as OrganisationRow;
}

/**
 * Fetch all members of an organisation, joined with their profile names.
 * Uses a raw join since the Supabase types have FK relationships defined.
 */
export async function fetchOrganisationMembers(
  orgId: string
): Promise<OrganisationMemberRow[]> {
  const { data, error } = await supabase
    .from("organisation_members")
    .select("id, organisation_id, user_id, role, created_at, profiles(name, email)")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[dataService] fetchOrganisationMembers error:", error.message);
    return [];
  }

  // Flatten the nested profiles join into top-level fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row: any) => ({
    id: row.id,
    organisation_id: row.organisation_id,
    user_id: row.user_id,
    role: row.role,
    created_at: row.created_at,
    profile_name: row.profiles?.name ?? null,
    profile_email: row.profiles?.email ?? null,
  }));
}

/** Update an organisation's name. Returns true on success. */
export async function updateOrganisationName(
  orgId: string,
  name: string
): Promise<boolean> {
  const { error } = await supabase
    .from("organisations")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", orgId);

  if (error) {
    console.error("[dataService] updateOrganisationName error:", error.message);
    return false;
  }
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
// ORGANISATION INVITATIONS
// ═════════════════════════════════════════════════════════════════════════════

export type InvitationRow = {
  id: string;
  token: string;
  organisation_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  invited_by: string;
  inviter_name: string | null;
  created_at: string;
  updated_at: string;
};

const INVITATION_EXPIRY_DAYS = 7;

/** Generate a URL-safe random token for invitation links. */
function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = new Uint8Array(32);
  // Use Math.random for React Native (no crypto.getRandomValues in all envs)
  for (let i = 0; i < 32; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < 32; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Fetch all pending invitations for an organisation, joined with the
 * inviter's profile name.
 */
export async function fetchPendingInvitations(
  orgId: string
): Promise<InvitationRow[]> {
  const { data, error } = await supabase
    .from("organisation_invitations")
    .select("*, profiles!invited_by(name)")
    .eq("organisation_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[dataService] fetchPendingInvitations error:", error.message);
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row: any) => ({
    id: row.id,
    token: row.token,
    organisation_id: row.organisation_id,
    email: row.email,
    role: row.role,
    status: row.status,
    expires_at: row.expires_at,
    invited_by: row.invited_by,
    inviter_name: row.profiles?.name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

/**
 * Check if a user with the given email is already a member of an organisation.
 */
export async function isEmailExistingMember(
  orgId: string,
  email: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("organisation_members")
    .select("user_id, profiles!inner(email)")
    .eq("organisation_id", orgId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter("profiles.email", "eq", email.toLowerCase().trim());

  if (error) {
    console.error("[dataService] isEmailExistingMember error:", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Check if there is already a pending invitation for this email+org combo.
 */
export async function hasPendingInvitation(
  orgId: string,
  email: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("organisation_invitations")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("email", email.toLowerCase().trim())
    .eq("status", "pending")
    .limit(1);

  if (error) {
    console.error("[dataService] hasPendingInvitation error:", error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

/**
 * Create a new invitation. Returns the invitation row or an error message.
 *
 * Validates:
 *  - No duplicate active invitation for the same email+org
 *  - Email is not already a member of the organisation
 */
export async function createInvitation(
  orgId: string,
  email: string,
  role: string,
  invitedByUserId: string
): Promise<{ invitation: InvitationRow | null; error: string | null }> {
  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { invitation: null, error: "Please enter a valid email address." };
  }

  if (!["owner", "manager", "staff"].includes(role)) {
    return { invitation: null, error: "Invalid role selected." };
  }

  // Check for duplicate active invitation
  const duplicate = await hasPendingInvitation(orgId, normalizedEmail);
  if (duplicate) {
    return {
      invitation: null,
      error: `An active invitation already exists for ${normalizedEmail}.`,
    };
  }

  // Check for existing member
  const isMember = await isEmailExistingMember(orgId, normalizedEmail);
  if (isMember) {
    return {
      invitation: null,
      error: `${normalizedEmail} is already a member of this organisation.`,
    };
  }

  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("organisation_invitations")
    .insert({
      token,
      organisation_id: orgId,
      email: normalizedEmail,
      role,
      status: "pending",
      expires_at: expiresAt,
      invited_by: invitedByUserId,
    })
    .select("*, profiles!invited_by(name)")
    .single();

  if (error) {
    console.error("[dataService] createInvitation error:", error.message, error.code);
    return {
      invitation: null,
      error: "Failed to create invitation. Please try again.",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  const invitation: InvitationRow = {
    id: row.id,
    token: row.token,
    organisation_id: row.organisation_id,
    email: row.email,
    role: row.role,
    status: row.status,
    expires_at: row.expires_at,
    invited_by: row.invited_by,
    inviter_name: row.profiles?.name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  console.log("[dataService] Invitation created:", invitation.id, "for", normalizedEmail);

  // Audit log
  writeAuditLog("invitation_created", "organisation_invitations", invitation.id, undefined, {
    organisation_id: orgId,
    email: normalizedEmail,
    role,
    token: token.substring(0, 8) + "...",
  });

  return { invitation, error: null };
}

/**
 * Revoke a pending invitation. Sets status to 'revoked'.
 */
export async function revokeInvitation(
  invitationId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("organisation_invitations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("status", "pending");

  if (error) {
    console.error("[dataService] revokeInvitation error:", error.message);
    return false;
  }

  // Audit log
  writeAuditLog("invitation_revoked", "organisation_invitations", invitationId);

  console.log("[dataService] Invitation revoked:", invitationId);
  return true;
}

/**
 * Resend an invitation — extends the expiry date by INVITATION_EXPIRY_DAYS
 * from now and updates the updated_at timestamp.
 */
export async function resendInvitation(
  invitationId: string
): Promise<boolean> {
  const expiresAt = new Date(
    Date.now() + INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await supabase
    .from("organisation_invitations")
    .update({
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invitationId)
    .eq("status", "pending");

  if (error) {
    console.error("[dataService] resendInvitation error:", error.message);
    return false;
  }

  // Audit log
  writeAuditLog("invitation_resent", "organisation_invitations", invitationId, undefined, {
    new_expires_at: expiresAt,
  });

  console.log("[dataService] Invitation resent:", invitationId);
  return true;
}

/**
 * Fetch a single invitation by its token. Returns null if not found.
 */
export async function getInvitationByToken(
  token: string
): Promise<InvitationRow | null> {
  const { data, error } = await supabase
    .from("organisation_invitations")
    .select("*, profiles!invited_by(name)")
    .eq("token", token)
    .single();

  if (error || !data) {
    console.error("[dataService] getInvitationByToken error:", error?.message);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  return {
    id: row.id,
    token: row.token,
    organisation_id: row.organisation_id,
    email: row.email,
    role: row.role,
    status: row.status,
    expires_at: row.expires_at,
    invited_by: row.invited_by,
    inviter_name: row.profiles?.name ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Accept an invitation. This performs the full join flow:
 *  1. Look up invitation by token, validate it's still pending and not expired
 *  2. Remove the user from their current organisation (if any)
 *  3. Add the user to the invited organisation
 *  4. Update profile.organisation_id to the new org
 *  5. Mark the invitation as accepted
 *
 * Returns { success: true, orgId } on success, or { success: false, error }.
 */
export async function acceptInvitation(
  token: string,
  userId: string,
  userEmail: string
): Promise<{ success: boolean; orgId?: string; error?: string }> {
  // Step 1: Look up invitation
  const invitation = await getInvitationByToken(token);
  if (!invitation) {
    return { success: false, error: "Invitation not found. It may have been revoked." };
  }

  if (invitation.status !== "pending") {
    return { success: false, error: `This invitation is ${invitation.status}.` };
  }

  if (new Date(invitation.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from("organisation_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", invitation.id);
    writeAuditLog("invitation_expired", "organisation_invitations", invitation.id);
    return { success: false, error: "This invitation has expired." };
  }

  // Check email match
  if (invitation.email.toLowerCase() !== userEmail.toLowerCase()) {
    return {
      success: false,
      error: `This invitation is for ${invitation.email}. Your account email is ${userEmail}.`,
    };
  }

  const orgId = invitation.organisation_id;

  // Step 2: Check if user is already a member of the target org
  const { data: existingMember } = await supabase
    .from("organisation_members")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existingMember) {
    return { success: false, error: "You are already a member of this organisation." };
  }

  // Step 3: Remove from current organisation (if any)
  const { data: oldMember } = await supabase
    .from("organisation_members")
    .select("id, organisation_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (oldMember) {
    await supabase
      .from("organisation_members")
      .delete()
      .eq("id", oldMember.id);
    console.log("[dataService] Removed user from old organisation:", oldMember.organisation_id);
  }

  // Step 4: Add to new organisation
  const { error: insertError } = await supabase
    .from("organisation_members")
    .insert({
      organisation_id: orgId,
      user_id: userId,
      role: invitation.role,
    });

  if (insertError) {
    console.error("[dataService] acceptInvitation insert error:", insertError.message);
    return { success: false, error: "Failed to join organisation. Please try again." };
  }

  // Step 5: Update profile.organisation_id
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ organisation_id: orgId })
    .eq("id", userId);

  if (profileError) {
    console.error("[dataService] acceptInvitation profile update error:", profileError.message);
    // Non-fatal — membership exists, profile will be repaired on next login
  }

  // Step 6: Mark invitation as accepted
  await supabase
    .from("organisation_invitations")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", invitation.id);

  // Audit log
  writeAuditLog("invitation_accepted", "organisation_invitations", invitation.id, undefined, {
    user_id: userId,
    organisation_id: orgId,
    role: invitation.role,
  });

  console.log("[dataService] Invitation accepted: user=", userId, "org=", orgId, "role=", invitation.role);
  return { success: true, orgId };
}

/**
 * Check for any pending invitations matching the user's email and
 * auto-accept the first valid one. Returns the new organisation ID
 * if an invitation was accepted, null otherwise.
 */
export async function autoAcceptInvitations(
  userId: string,
  email: string
): Promise<{ accepted: boolean; orgId?: string }> {
  if (!email) return { accepted: false };

  const { data, error } = await supabase
    .from("organisation_invitations")
    .select("token")
    .eq("email", email.toLowerCase().trim())
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) {
    return { accepted: false };
  }

  const token = (data[0] as { token: string }).token;
  const result = await acceptInvitation(token, userId, email);

  return {
    accepted: result.success,
    orgId: result.orgId,
  };
}
