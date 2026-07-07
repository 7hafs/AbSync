import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Absence, AbsenceDuration, AbsenceStatus } from "@/types";
import { DB_VERSION } from "@/lib/storageManager";
import { upsertAbsence, upsertAbsences, deleteAbsenceFromSupabase, writeAuditLog } from "@/lib/dataService";

export const DEFAULT_MAX_ABSENCES_PER_DAY = 2;

export type CreateAbsenceInput = {
  staffId: string;
  name: string;
  type: Absence["type"];
  dates: string[];
  duration: AbsenceDuration;
  notes: string;
  cover?: string | null;
  createdBy: string;
  /** If true, auto-approve the absence (used in personal workspace). */
  autoApprove?: boolean;
};

export type AbsenceValidationResult = {
  valid: boolean;
  message?: string;
  conflictingDate?: string;
};

interface AbsenceState {
  absences: Absence[];
  maxAbsencesPerDay: number;
  isLoaded: boolean;
  dbVersion: number;
  addAbsence: (absence: Absence) => void;
  createAbsences: (input: CreateAbsenceInput) => string[];
  updateAbsence: (absence: Absence) => void;
  updateAbsenceStatus: (id: string, status: AbsenceStatus) => void;
  deleteAbsence: (id: string) => void;
  replaceAbsences: (absences: Absence[]) => void;
  setLoaded: (loaded: boolean) => void;
  setDbVersion: (version: number) => void;
  setMaxAbsencesPerDay: (limit: number) => void;
  getAbsencesForDate: (date: string) => Absence[];
  getApprovedAbsencesForDate: (date: string) => Absence[];
  getAbsencesForDateAndDuration: (
    date: string,
    duration: AbsenceDuration
  ) => Absence[];
  getAbsencesForStaff: (staffId: string) => Absence[];
  getAbsencesForMonth: (year: number, month: number) => Absence[];
  hasDuplicate: (
    staffId: string,
    date: string,
    duration: AbsenceDuration,
    excludeId?: string
  ) => boolean;
  validateNewAbsence: (
    staffId: string,
    dates: string[],
    duration: AbsenceDuration,
    excludeId?: string
  ) => AbsenceValidationResult;
  wouldExceedDailyLimit: (
    date: string,
    duration: AbsenceDuration,
    excludeId?: string
  ) => boolean;
  getConflictDays: (
    startDate: string,
    endDate: string
  ) => Array<{
    date: string;
    count: number;
    severity: "medium" | "high" | "critical";
  }>;
}

function createAbsenceId(
  date: string,
  staffId: string,
  duration: AbsenceDuration
) {
  return `${date}-${staffId}-${duration}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function normalizeDurationMatch(
  absence: Absence,
  duration: AbsenceDuration
) {
  if (absence.duration === "Full" || duration === "Full") {
    return true;
  }
  return absence.duration === duration;
}

const useAbsenceStore = create<AbsenceState>()(
  persist(
    (set, get) => ({
      absences: [],
      maxAbsencesPerDay: DEFAULT_MAX_ABSENCES_PER_DAY,
      isLoaded: false,
      dbVersion: 0,

      addAbsence: (absence) =>
        set((state) => {
          if (state.absences.some((a) => a.id === absence.id)) {
            return state;
          }
          return { absences: [...state.absences, absence] };
        }),

      createAbsences: (input) => {
        const createdAt = new Date().toISOString();
        const effectiveStatus: AbsenceStatus = input.autoApprove ? "Approved" : "Pending";
        const nextAbsences: Absence[] = input.dates.map((date) => {
          let id: string;
          do {
            id = createAbsenceId(date, input.staffId, input.duration);
          } while (get().absences.some((a) => a.id === id));

          return {
            id,
            staffId: input.staffId,
            name: input.name,
            type: input.type,
            date,
            duration: input.duration,
            status: effectiveStatus,
            cover: input.cover ?? null,
            notes: input.notes,
            createdBy: input.createdBy,
            createdAt,
          };
        });

        set((state) => ({
          absences: [...state.absences, ...nextAbsences],
        }));

        upsertAbsences(nextAbsences);

        // Audit log for each created absence
        for (const a of nextAbsences) {
          writeAuditLog("absence_created", "absence", a.id, undefined, {
            staffId: a.staffId,
            name: a.name,
            date: a.date,
            type: a.type,
            duration: a.duration,
          });
        }

        return nextAbsences.map((a) => a.id);
      },

      updateAbsence: (updatedAbsence) => {
        set((state) => ({
          absences: state.absences.map((absence) =>
            absence.id === updatedAbsence.id ? updatedAbsence : absence
          ),
        }));
        upsertAbsence(updatedAbsence);
        writeAuditLog("absence_updated", "absence", updatedAbsence.id);
      },

      updateAbsenceStatus: (id, status) => {
        const original = get().absences.find((a) => a.id === id);

        set((state) => {
          const updated = state.absences.map((absence) =>
            absence.id === id ? { ...absence, status } : absence
          );
          const changed = updated.find((a) => a.id === id);
          if (changed) {
            upsertAbsence(changed);
            writeAuditLog(
              status === "Approved" ? "absence_approved" : "absence_rejected",
              "absence",
              id
            );
          }
          return { absences: updated };
        });

        // Fire approval/rejection notification only on actual status changes
        if (
          original &&
          original.status !== status &&
          (status === "Approved" || status === "Rejected")
        ) {
          try {
            // Look up staff email for optional email notification
            let staffEmail: string | undefined;
            if (original.staffId) {
              const { default: useStaffStore } = require("@/store/useStaffStore");
              const staffMember = useStaffStore.getState().getStaffById(original.staffId);
              staffEmail = staffMember?.email;
            }

            // Dynamic import to avoid circular dependency at module level
            const { sendApprovalNotification } = require("@/utils/notificationService");

            sendApprovalNotification(
              status === "Approved" ? "approved" : "rejected",
              original.name,
              original.date,
              staffEmail
            );
          } catch (err) {
            console.error("[useAbsenceStore] Failed to send approval notification:", err);
          }
        }
      },

      deleteAbsence: (id) => {
        const deleted = get().absences.find((a) => a.id === id);
        set((state) => ({
          absences: state.absences.filter((absence) => {
            if (absence.id !== id) return true;
            if (absence.locked || absence.type === "Public Holiday")
              return true;
            return false;
          }),
        }));
        deleteAbsenceFromSupabase(id);
        if (deleted && !deleted.locked && deleted.type !== "Public Holiday") {
          writeAuditLog("absence_deleted", "absence", id, {
            staffId: deleted.staffId,
            name: deleted.name,
            date: deleted.date,
          });
        }
      },

      replaceAbsences: (incoming) => {
        if (!Array.isArray(incoming) || incoming.length === 0) {
          const currentCount = get().absences.length;
          if (currentCount > 0) {
            console.warn(
              '[useAbsenceStore] Refusing to replace absences with empty array — possible data loss prevented'
            );
            return;
          }
        }
        const seen = new Set<string>();
        const deduplicated = incoming.filter((a) => {
          if (seen.has(a.id)) {
            return false;
          }
          seen.add(a.id);
          return true;
        });
        // Merge: keep local records whose updatedAt is newer than the server's version.
        // This prevents stale Supabase refresh results from overwriting realtime updates.
        const existingMap = new Map(get().absences.map((a) => [a.id, a]));
        const merged = deduplicated.map((incomingAbsence) => {
          const existing = existingMap.get(incomingAbsence.id);
          if (!existing) return incomingAbsence;
          if (
            existing.updatedAt &&
            incomingAbsence.updatedAt &&
            existing.updatedAt > incomingAbsence.updatedAt
          ) {
            return existing; // realtime update beat the server query — keep local
          }
          return incomingAbsence;
        });
        set(() => ({ absences: merged }));
      },

      setLoaded: (loaded) => set(() => ({ isLoaded: loaded })),
      setDbVersion: (version) => set(() => ({ dbVersion: version })),

      setMaxAbsencesPerDay: (limit) =>
        set(() => ({
          maxAbsencesPerDay: Math.max(
            1,
            Math.floor(limit) || DEFAULT_MAX_ABSENCES_PER_DAY
          ),
        })),

      getAbsencesForDate: (date) =>
        get().absences.filter((absence) => absence.date === date),

      getApprovedAbsencesForDate: (date) =>
        get().absences.filter(
          (absence) =>
            absence.date === date && absence.status !== "Rejected"
        ),

      getAbsencesForDateAndDuration: (date, duration) =>
        get().absences.filter(
          (absence) =>
            absence.date === date &&
            absence.status !== "Rejected" &&
            normalizeDurationMatch(absence, duration)
        ),

      getAbsencesForStaff: (staffId) =>
        get().absences.filter((absence) => absence.staffId === staffId),

      getAbsencesForMonth: (year, month) =>
        get().absences.filter((absence) => {
          const [y, m] = absence.date.split("-").map(Number);
          return y === year && m - 1 === month;
        }),

      hasDuplicate: (staffId, date, duration, excludeId) =>
        get().absences.some(
          (absence) =>
            absence.staffId === staffId &&
            absence.date === date &&
            absence.duration === duration &&
            absence.id !== excludeId
        ),

      validateNewAbsence: (staffId, dates, duration, excludeId) => {
        for (const date of dates) {
          if (get().hasDuplicate(staffId, date, duration, excludeId)) {
            return {
              valid: false,
              message:
                "Duplicate entry for the same employee, date, and duration.",
              conflictingDate: date,
            };
          }
        }
        return { valid: true };
      },

      wouldExceedDailyLimit: () => false,

      getConflictDays: (startDate, endDate) => {
        const counts = new Map<string, number>();

        get().absences.forEach((absence) => {
          if (
            absence.status === "Rejected" ||
            absence.type === "Public Holiday"
          ) {
            return;
          }

          if (absence.date >= startDate && absence.date <= endDate) {
            counts.set(
              absence.date,
              (counts.get(absence.date) ?? 0) + 1
            );
          }
        });

        return Array.from(counts.entries())
          .map(([date, count]) => ({
            date,
            count,
            severity: "medium" as const,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
      },
    }),
    {
      name: "absence-storage-v2",
      storage: createJSONStorage(() => AsyncStorage),
      version: DB_VERSION,
      migrate: (persisted, version) => {
        const state = persisted as { absences?: Absence[]; dbVersion?: number };
        if (state.absences) {
          state.absences = state.absences.map((a) => ({
            ...a,
            notes: a.notes ?? '',
            documents: a.documents ?? undefined,
          }));
        }
        return state as Partial<AbsenceState>;
      },
      partialize: (state) => ({
        absences: state.absences,
        dbVersion: state.dbVersion,
        maxAbsencesPerDay: state.maxAbsencesPerDay,
      }),
    }
  )
);

export default useAbsenceStore;
