/**
 * Supabase Realtime hook — subscribes to organisation-scoped changes
 * for absences, staff_members, and calendar_events.
 *
 * When another organisation member creates, updates, or deletes a record,
 * the hook applies the change to the corresponding Zustand store instantly.
 * The current user's own writes are deduplicated (the store already has them).
 *
 * Usage:
 *   Call from within AuthenticatedApp with the current organisation_id.
 *   The hook manages channel lifecycle and cleans up on unmount / org change.
 */
import { useEffect, useRef } from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import useAbsenceStore from "@/store/useAbsenceStore";
import useStaffStore from "@/store/useStaffStore";
import useCalendarStore from "@/store/useCalendarStore";
import { Absence, StaffMember, EventType } from "@/types";

// ── Row converters (mirror dataService.ts) ───────────────────────────────────

type SupabasePayload = {
  commit_timestamp: string;
  errors: null | unknown[];
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  schema: string;
  table: string;
};

function absenceFromPayload(row: Record<string, unknown>): Absence {
  let documents: Absence["documents"] = undefined;
  if (row.documents) {
    try {
      documents = JSON.parse(row.documents as string) as Absence["documents"];
    } catch { /* ignore parse errors */ }
  }
  return {
    id: row.id as string,
    staffId: (row.staff_id as string) ?? null,
    name: row.name as string,
    type: row.type as Absence["type"],
    date: row.date as string,
    duration: row.duration as Absence["duration"],
    status: row.status as Absence["status"],
    cover: (row.cover as string) ?? null,
    notes: (row.notes as string) ?? "",
    locked: (row.locked as boolean) ?? false,
    createdBy: row.created_by as string,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? undefined,
    documents,
  };
}

function staffFromPayload(row: Record<string, unknown>): StaffMember {
  return {
    id: row.id as string,
    name: row.name as string,
    department: (row.department as string) ?? undefined,
    employeeId: (row.employee_id as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    jobTitle: (row.job_title as string) ?? undefined,
    phoneNumber: (row.phone_number as string) ?? undefined,
    active: (row.active as boolean) ?? true,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
    updatedAt: (row.updated_at as string) ?? undefined,
  };
}

function eventFromPayload(row: Record<string, unknown>): EventType {
  return {
    id: row.id as string,
    title: row.title as string,
    date: row.date as string,
    startTime: (row.start_time as string) ?? undefined,
    endTime: (row.end_time as string) ?? undefined,
    timeOfDay: (row.time_of_day as "AM" | "PM") ?? undefined,
    personId: (row.person_id as string) ?? undefined,
    isRecurring: (row.is_recurring as boolean) ?? false,
    recurringPattern: (row.recurring_pattern as EventType["recurringPattern"]) ?? undefined,
    updatedAt: (row.updated_at as string) ?? undefined,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Subscribe to realtime changes for the given organisation.
 *
 * @param organisationId — the org to scope subscriptions to (null = skip)
 * @param userId — the current user's ID, used for deduplication
 */
export function useRealtime(organisationId: string | null, userId: string | null): void {
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;

  useEffect(() => {
    // Nothing to subscribe to without an organisation
    if (!organisationId) {
      return;
    }

    // ── Helper: check if the change was made by the current user ──────────
    const isOwnChange = (payload: SupabasePayload): boolean => {
      if (!userIdRef.current) return false;
      const row = payload.eventType === "DELETE" ? payload.old : payload.new;
      return row?.user_id === userIdRef.current || row?.created_by === userIdRef.current;
    };

    // ── Absences channel ──────────────────────────────────────────────────
    const absenceChannel = supabase
      .channel(`absences-org-${organisationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "absences",
          filter: `organisation_id=eq.${organisationId}`,
        },
        (payload: SupabasePayload) => {
          const store = useAbsenceStore.getState();
          const id = (payload.eventType === "DELETE" ? payload.old.id : payload.new.id) as string;

          if (payload.eventType === "INSERT") {
            // Dedup: if store already has this record (our own write), skip
            if (isOwnChange(payload)) {
              const exists = store.absences.some((a) => a.id === id);
              if (exists) return;
            }
            const record = absenceFromPayload(payload.new);
            store.addAbsence(record);
          } else if (payload.eventType === "UPDATE") {
            const record = absenceFromPayload(payload.new);
            store.updateAbsence(record);
          } else if (payload.eventType === "DELETE") {
            store.deleteAbsence(id as string);
          }
        }
      )
      .subscribe();

    // ── Staff members channel ─────────────────────────────────────────────
    const staffChannel = supabase
      .channel(`staff_members-org-${organisationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "staff_members",
          filter: `organisation_id=eq.${organisationId}`,
        },
        (payload: SupabasePayload) => {
          const store = useStaffStore.getState();
          const id = (payload.eventType === "DELETE" ? payload.old.id : payload.new.id) as string;

          if (payload.eventType === "INSERT") {
            if (isOwnChange(payload)) {
              const exists = store.staff.some((s) => s.id === id);
              if (exists) return;
            }
            const record = staffFromPayload(payload.new);
            store.addStaff(record);
          } else if (payload.eventType === "UPDATE") {
            const record = staffFromPayload(payload.new);
            store.updateStaff(record);
          } else if (payload.eventType === "DELETE") {
            store.deleteStaff(id as string);
          }
        }
      )
      .subscribe();

    // ── Calendar events channel ───────────────────────────────────────────
    const calendarChannel = supabase
      .channel(`calendar_events-org-${organisationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "calendar_events",
          filter: `organisation_id=eq.${organisationId}`,
        },
        (payload: SupabasePayload) => {
          const store = useCalendarStore.getState();
          const id = (payload.eventType === "DELETE" ? payload.old.id : payload.new.id) as string;

          if (payload.eventType === "INSERT") {
            if (isOwnChange(payload)) {
              const exists = store.events.some((e) => e.id === id);
              if (exists) return;
            }
            const record = eventFromPayload(payload.new);
            store.addEvent(record);
          } else if (payload.eventType === "UPDATE") {
            const record = eventFromPayload(payload.new);
            store.updateEvent(record);
          } else if (payload.eventType === "DELETE") {
            store.deleteEvent(id as string);
          }
        }
      )
      .subscribe();

    channelsRef.current = [absenceChannel, staffChannel, calendarChannel];

    // ── Cleanup on unmount or org change ──────────────────────────────────
    return () => {
      for (const channel of channelsRef.current) {
        supabase.removeChannel(channel).catch((err: Error) => {
          console.warn("[useRealtime] Error removing channel:", err.message);
        });
      }
      channelsRef.current = [];
    };
  }, [organisationId]);
}
