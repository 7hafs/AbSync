import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Absence, AbsenceDuration, AbsenceStatus } from '@/types';

export const DEFAULT_MAX_ABSENCES_PER_DAY = 2;

export type CreateAbsenceInput = {
  staffId: string;
  name: string;
  type: Absence['type'];
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
  addAbsence: (absence: Absence) => void;
  createAbsences: (input: CreateAbsenceInput) => void;
  updateAbsence: (absence: Absence) => void;
  updateAbsenceStatus: (id: string, status: AbsenceStatus) => void;
  deleteAbsence: (id: string) => void;
  replaceAbsences: (absences: Absence[]) => void;
  setMaxAbsencesPerDay: (limit: number) => void;
  getAbsencesForDate: (date: string) => Absence[];
  getApprovedAbsencesForDate: (date: string) => Absence[];
  getAbsencesForDateAndDuration: (date: string, duration: AbsenceDuration) => Absence[];
  getAbsencesForStaff: (staffId: string) => Absence[];
  getAbsencesForMonth: (year: number, month: number) => Absence[];
  hasDuplicate: (staffId: string, date: string, duration: AbsenceDuration, excludeId?: string) => boolean;
  validateNewAbsence: (staffId: string, dates: string[], duration: AbsenceDuration, excludeId?: string) => AbsenceValidationResult;
  wouldExceedDailyLimit: (date: string, duration: AbsenceDuration, excludeId?: string) => boolean;
  getConflictDays: (startDate: string, endDate: string) => Array<{ date: string; count: number; severity: 'medium' | 'high' | 'critical' }>;
}

function createAbsenceId(date: string, staffId: string, duration: AbsenceDuration) {
  return `${date}-${staffId}-${duration}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDurationMatch(absence: Absence, duration: AbsenceDuration) {
  if (absence.duration === 'Full' || duration === 'Full') {
    return true;
  }

  return absence.duration === duration;
}

const useAbsenceStore = create<AbsenceState>()(
  persist(
    (set, get) => ({
      absences: [],
      maxAbsencesPerDay: DEFAULT_MAX_ABSENCES_PER_DAY,

      addAbsence: (absence) =>
        set((state) => ({
          absences: [...state.absences, absence],
        })),

      createAbsences: (input) => {
        const createdAt = new Date().toISOString();
        const nextAbsences: Absence[] = input.dates.map((date) => ({
          id: createAbsenceId(date, input.staffId, input.duration),
          staffId: input.staffId,
          name: input.name,
          type: input.type,
          date,
          duration: input.duration,
          status: 'Pending',
          cover: input.cover ?? null,
          notes: input.notes,
          createdBy: input.createdBy,
          createdAt,
        }));

        set((state) => ({
          absences: [...state.absences, ...nextAbsences],
        }));
      },

      updateAbsence: (updatedAbsence) =>
        set((state) => ({
          absences: state.absences.map((absence) =>
            absence.id === updatedAbsence.id ? updatedAbsence : absence
          ),
        })),

      updateAbsenceStatus: (id, status) =>
        set((state) => ({
          absences: state.absences.map((absence) =>
            absence.id === id ? { ...absence, status } : absence
          ),
        })),

      deleteAbsence: (id) =>
        set((state) => ({
          absences: state.absences.filter((absence) => absence.id !== id || absence.locked),
        })),

      replaceAbsences: (absences) => set(() => ({ absences })),

      setMaxAbsencesPerDay: (limit) =>
        set(() => ({
          maxAbsencesPerDay: Math.max(1, Math.floor(limit) || DEFAULT_MAX_ABSENCES_PER_DAY),
        })),

      getAbsencesForDate: (date) => get().absences.filter((absence) => absence.date === date),

      getApprovedAbsencesForDate: (date) =>
        get().absences.filter((absence) => absence.date === date && absence.status !== 'Rejected'),

      getAbsencesForDateAndDuration: (date, duration) =>
        get().absences.filter(
          (absence) =>
            absence.date === date &&
            absence.status !== 'Rejected' &&
            normalizeDurationMatch(absence, duration)
        ),

      getAbsencesForStaff: (staffId) => get().absences.filter((absence) => absence.staffId === staffId),

      getAbsencesForMonth: (year, month) =>
        get().absences.filter((absence) => {
          const parsedDate = new Date(absence.date);
          return parsedDate.getFullYear() === year && parsedDate.getMonth() === month;
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
              message: 'Duplicate entry for the same employee, date, and duration.',
              conflictingDate: date,
            };
          }

        }

        return { valid: true };
      },

      wouldExceedDailyLimit: () => false,

      getConflictDays: (startDate, endDate) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const counts = new Map<string, number>();

        get().absences.forEach((absence) => {
          if (absence.status === 'Rejected' || absence.type === 'Public Holiday') {
            return;
          }

          const parsedDate = new Date(absence.date);
          if (parsedDate >= start && parsedDate <= end) {
            counts.set(absence.date, (counts.get(absence.date) ?? 0) + 1);
          }
        });

        return Array.from(counts.entries())
          .map(([date, count]) => ({
            date,
            count,
            severity: 'medium' as const,
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
      },
    }),
    {
      name: 'absence-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useAbsenceStore;
