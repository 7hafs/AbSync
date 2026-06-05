import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Absence, AbsenceDuration, AbsenceStatus } from "@/types";
import { DB_VERSION } from "@/lib/storageManager";
import { upsertAbsence, upsertAbsences, deleteAbsenceFromSupabase } from "@/lib/dataService";

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
          // Deduplicate: skip if an absence with the same ID already exists
          if (state.absences.some((a) => a.id === absence.id)) {
            console.log('[useAbsenceStore] Skipping duplicate absence ID:', absence.id);
            return state;
          }
          return { absences: [...state.absences, absence] };
        }),

      createAbsences: (input) => {
        const createdAt = new Date().toISOString();
        const nextAbsences: Absence[] = input.dates.map((date) => {
          let id: string;
          // Ensure unique ID — retry if random collision (extremely rare)
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
            status: "Pending" as const,
            cover: input.cover ?? null,
            notes: input.notes,
            createdBy: input.createdBy,
            createdAt,
          };
        });

        set((state) => ({
          absences: [...state.absences, ...nextAbsences],
        }));

        // Sync to Supabase
        upsertAbsences(nextAbsences);

        // Return created IDs for the caller
        return nextAbsences.map((a) => a.id);
      },

      updateAbsence: (updatedAbsence) => {
        set((state) => ({
          absences: state.absences.map((absence) =>
            absence.id === updatedAbsence.id ? updatedAbsence : absence
          ),
        }));
        // Sync to Supabase
        upsertAbsence(updatedAbsence);
      },

      updateAbsenceStatus: (id, status) =>
        set((state) => ({
          absences: state.absences.map((absence) =>
            absence.id === id ? { ...absence, status } : absence
          ),
        })),

      deleteAbsence: (id) => {
        console.log("[useAbsenceStore] deleteAbsence", id);
        set((state) => ({
          absences: state.absences.filter((absence) => {
            if (absence.id !== id) return true;
            if (absence.locked || absence.type === "Public Holiday")
              return true;
            return false;
          }),
        }));
        // Sync to Supabase
        deleteAbsenceFromSupabase(id);
      },

      replaceAbsences: (incoming) => {
        // Safety: never replace with empty data if we already have records
        if (!Array.isArray(incoming) || incoming.length === 0) {
          const currentCount = get().absences.length;
          if (currentCount > 0) {
            console.warn(
              '[useAbsenceStore] Refusing to replace ${currentCount} absences with empty array — possible data loss prevented'
            );
            return;
          }
        }
        // Deduplicate by ID before replacing
        const seen = new Set<string>();
        const deduplicated = incoming.filter((a) => {
          if (seen.has(a.id)) {
            console.log('[useAbsenceStore] Dropping duplicate absence ID during replace:', a.id);
            return false;
          }
          seen.add(a.id);
          return true;
        });
        set(() => ({ absences: deduplicated }));
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
        // Future migrations: handle schema changes here when DB_VERSION increments
        // e.g. if version < 2, add missing fields to old records
        const state = persisted as { absences?: Absence[]; dbVersion?: number };
        if (state.absences) {
          state.absences = state.absences.map((a) => ({
            ...a,
            notes: a.notes ?? '',
          }));
        }
        return state as Partial<AbsenceState>;
      },
      partialize: (state) => ({
        absences: state.absences,
        dbVersion: state.dbVersion,
      }),
    }
  )
);

export default useAbsenceStore;
