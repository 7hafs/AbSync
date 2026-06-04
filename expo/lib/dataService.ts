/**
 * Supabase data service layer.
 *
 * All CRUD operations go through this file. Each function takes a userId
 * (the Rork Auth user ID from the JWT) to scope operations to the
 * authenticated user.
 */
import { supabase } from "@/lib/supabase";
import type { Absence, StaffMember, EventType, NoteType, ReminderType } from "@/types";

// ── Profiles ────────────────────────────────────────────────────────────────

export async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("[dataService] fetchProfile error:", error.message);
  }
  return data ?? null;
}

// ── Absences ────────────────────────────────────────────────────────────────

export async function fetchAbsences(userId: string): Promise<Absence[]> {
  const { data, error } = await supabase
    .from("absences")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) {
    console.error("[dataService] fetchAbsences error:", error.message);
    return [];
  }
  return (data ?? []).map(mapAbsenceRow);
}

export async function insertAbsence(userId: string, absence: Absence): Promise<void> {
  const { error } = await supabase.from("absences").insert({
    id: absence.id,
    user_id: userId,
    staff_id: absence.staffId,
    name: absence.name,
    type: absence.type,
    date: absence.date,
    duration: absence.duration,
    status: absence.status,
    cover: absence.cover,
    notes: absence.notes,
    locked: absence.locked ?? false,
    created_by: absence.createdBy,
    created_at: absence.createdAt,
  });

  if (error) {
    console.error("[dataService] insertAbsence error:", error.message);
  }
}

export async function updateAbsenceRow(userId: string, absence: Absence): Promise<void> {
  const { error } = await supabase
    .from("absences")
    .update({
      staff_id: absence.staffId,
      name: absence.name,
      type: absence.type,
      date: absence.date,
      duration: absence.duration,
      status: absence.status,
      cover: absence.cover,
      notes: absence.notes,
      locked: absence.locked ?? false,
      created_by: absence.createdBy,
    })
    .eq("id", absence.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] updateAbsence error:", error.message);
  }
}

export async function deleteAbsenceRow(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("absences")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] deleteAbsence error:", error.message);
  }
}

export async function bulkInsertAbsences(
  userId: string,
  absences: Absence[]
): Promise<void> {
  const rows = absences.map((a) => ({
    id: a.id,
    user_id: userId,
    staff_id: a.staffId,
    name: a.name,
    type: a.type,
    date: a.date,
    duration: a.duration,
    status: a.status,
    cover: a.cover,
    notes: a.notes,
    locked: a.locked ?? false,
    created_by: a.createdBy,
    created_at: a.createdAt,
  }));

  // Insert in batches of 100
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from("absences").insert(batch);
    if (error) {
      console.error("[dataService] bulkInsertAbsences error:", error.message);
    }
  }
}

// ── Staff Members ───────────────────────────────────────────────────────────

export async function fetchStaff(userId: string): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from("staff_members")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    console.error("[dataService] fetchStaff error:", error.message);
    return [];
  }
  return (data ?? []).map(mapStaffRow);
}

export async function insertStaffMember(
  userId: string,
  member: StaffMember
): Promise<void> {
  const { error } = await supabase.from("staff_members").insert({
    id: member.id,
    user_id: userId,
    name: member.name,
    department: member.department ?? null,
    active: member.active,
    created_at: member.createdAt,
  });

  if (error) {
    console.error("[dataService] insertStaff error:", error.message);
  }
}

export async function updateStaffMember(
  userId: string,
  member: StaffMember
): Promise<void> {
  const { error } = await supabase
    .from("staff_members")
    .update({
      name: member.name,
      department: member.department ?? null,
      active: member.active,
    })
    .eq("id", member.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] updateStaff error:", error.message);
  }
}

export async function deleteStaffMember(
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("staff_members")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] deleteStaff error:", error.message);
  }
}

export async function bulkInsertStaff(
  userId: string,
  members: StaffMember[]
): Promise<void> {
  const rows = members.map((m) => ({
    id: m.id,
    user_id: userId,
    name: m.name,
    department: m.department ?? null,
    active: m.active,
    created_at: m.createdAt,
  }));

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await supabase.from("staff_members").insert(batch);
    if (error) {
      console.error("[dataService] bulkInsertStaff error:", error.message);
    }
  }
}

// ── Events ──────────────────────────────────────────────────────────────────

export async function fetchEvents(userId: string): Promise<EventType[]> {
  const { data, error } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) {
    console.error("[dataService] fetchEvents error:", error.message);
    return [];
  }
  return (data ?? []).map(mapEventRow);
}

export async function insertEvent(
  userId: string,
  event: EventType
): Promise<void> {
  const { error } = await supabase.from("calendar_events").insert({
    id: event.id,
    user_id: userId,
    title: event.title,
    date: event.date,
    start_time: event.startTime ?? null,
    end_time: event.endTime ?? null,
    time_of_day: event.timeOfDay ?? null,
    person_id: event.personId ?? null,
    is_recurring: event.isRecurring,
    recurring_pattern: event.recurringPattern ?? null,
  });

  if (error) {
    console.error("[dataService] insertEvent error:", error.message);
  }
}

export async function updateEventRow(
  userId: string,
  event: EventType
): Promise<void> {
  const { error } = await supabase
    .from("calendar_events")
    .update({
      title: event.title,
      date: event.date,
      start_time: event.startTime ?? null,
      end_time: event.endTime ?? null,
      time_of_day: event.timeOfDay ?? null,
      person_id: event.personId ?? null,
      is_recurring: event.isRecurring,
      recurring_pattern: event.recurringPattern ?? null,
    })
    .eq("id", event.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] updateEvent error:", error.message);
  }
}

export async function deleteEventRow(
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] deleteEvent error:", error.message);
  }
}

// ── Notes ───────────────────────────────────────────────────────────────────

export async function fetchNotes(userId: string): Promise<NoteType[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[dataService] fetchNotes error:", error.message);
    return [];
  }
  return (data ?? []).map(mapNoteRow);
}

export async function insertNote(
  userId: string,
  note: NoteType
): Promise<void> {
  const { error } = await supabase.from("notes").insert({
    id: note.id,
    user_id: userId,
    title: note.title,
    content: note.content,
    tags: note.tags,
    date: note.date ?? null,
    is_pinned: note.isPinned,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  });

  if (error) {
    console.error("[dataService] insertNote error:", error.message);
  }
}

export async function updateNoteRow(
  userId: string,
  note: NoteType
): Promise<void> {
  const { error } = await supabase
    .from("notes")
    .update({
      title: note.title,
      content: note.content,
      tags: note.tags,
      date: note.date ?? null,
      is_pinned: note.isPinned,
      updated_at: note.updatedAt,
    })
    .eq("id", note.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] updateNote error:", error.message);
  }
}

export async function deleteNoteRow(
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] deleteNote error:", error.message);
  }
}

// ── Reminders ───────────────────────────────────────────────────────────────

export async function fetchReminders(userId: string): Promise<ReminderType[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });

  if (error) {
    console.error("[dataService] fetchReminders error:", error.message);
    return [];
  }
  return (data ?? []).map(mapReminderRow);
}

export async function insertReminder(
  userId: string,
  reminder: ReminderType
): Promise<void> {
  const { error } = await supabase.from("reminders").insert({
    id: reminder.id,
    user_id: userId,
    title: reminder.title,
    date: reminder.date,
    time: reminder.time ?? null,
    is_completed: reminder.isCompleted,
    is_recurring: reminder.isRecurring,
    recurring_pattern: reminder.recurringPattern ?? null,
  });

  if (error) {
    console.error("[dataService] insertReminder error:", error.message);
  }
}

export async function updateReminderRow(
  userId: string,
  reminder: ReminderType
): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .update({
      title: reminder.title,
      date: reminder.date,
      time: reminder.time ?? null,
      is_completed: reminder.isCompleted,
      is_recurring: reminder.isRecurring,
      recurring_pattern: reminder.recurringPattern ?? null,
    })
    .eq("id", reminder.id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] updateReminder error:", error.message);
  }
}

export async function deleteReminderRow(
  userId: string,
  id: string
): Promise<void> {
  const { error } = await supabase
    .from("reminders")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("[dataService] deleteReminder error:", error.message);
  }
}

// ── Row Mappers (DB row → app type) ─────────────────────────────────────────

type AbsenceRow = {
  id: string;
  user_id: string;
  staff_id: string;
  name: string;
  type: string;
  date: string;
  duration: string;
  status: string;
  cover: string | null;
  notes: string;
  locked: boolean;
  created_by: string;
  created_at: string;
};

type StaffRow = {
  id: string;
  user_id: string;
  name: string;
  department: string | null;
  active: boolean;
  created_at: string;
};

type EventRow = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  time_of_day: string | null;
  person_id: string | null;
  is_recurring: boolean;
  recurring_pattern: string | null;
  created_at: string;
};

type NoteRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  tags: string[];
  date: string | null;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

type ReminderRow = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  time: string | null;
  is_completed: boolean;
  is_recurring: boolean;
  recurring_pattern: string | null;
  created_at: string;
};

function mapAbsenceRow(row: AbsenceRow): Absence {
  return {
    id: row.id,
    staffId: row.staff_id,
    name: row.name,
    type: row.type as Absence["type"],
    date: row.date,
    duration: row.duration as Absence["duration"],
    status: row.status as Absence["status"],
    cover: row.cover,
    notes: row.notes,
    locked: row.locked,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapStaffRow(row: StaffRow): StaffMember {
  return {
    id: row.id,
    name: row.name,
    department: row.department ?? undefined,
    active: row.active,
    createdAt: row.created_at,
  };
}

function mapEventRow(row: EventRow): EventType {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    startTime: row.start_time ?? undefined,
    endTime: row.end_time ?? undefined,
    timeOfDay: (row.time_of_day as EventType["timeOfDay"]) ?? undefined,
    personId: row.person_id ?? undefined,
    isRecurring: row.is_recurring,
    recurringPattern:
      (row.recurring_pattern as EventType["recurringPattern"]) ?? undefined,
  };
}

function mapNoteRow(row: NoteRow): NoteType {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags: row.tags,
    date: row.date ?? undefined,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReminderRow(row: ReminderRow): ReminderType {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    time: row.time ?? undefined,
    isCompleted: row.is_completed,
    isRecurring: row.is_recurring,
    recurringPattern:
      (row.recurring_pattern as ReminderType["recurringPattern"]) ?? undefined,
  };
}
