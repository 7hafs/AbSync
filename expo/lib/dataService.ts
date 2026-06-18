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

// ═════════════════════════════════════════════════════════════════════════════
// ABSENCES
// ═════════════════════════════════════════════════════════════════════════════

/** Convert local Absence to Supabase insert shape. */
function absenceToInsert(a: Absence): TablesInsert<"absences"> {
  return {
    id: a.id,
    staff_id: a.staffId,
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
  const { error } = await supabase.from("absences").upsert(insert, { onConflict: "id" });
  if (error) {
    console.error("[dataService] upsertAbsence error:", error.message);
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
  const { error } = await supabase.from("absences").delete().eq("id", id);
  if (error) {
    console.error("[dataService] deleteAbsence error:", error.message);
    throw new Error(`Failed to delete absence: ${error.message}`);
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

  const { error } = await supabase
    .from("staff_members")
    .upsert({ ...staffToInsert(s), user_id: userId }, { onConflict: "id" });
  if (error) {
    console.error("[dataService] upsertStaff error:", error.message);
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
  const { error } = await supabase.from("staff_members").delete().eq("id", id);
  if (error) {
    console.error("[dataService] deleteStaff error:", error.message);
    throw new Error(`Failed to delete staff: ${error.message}`);
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
