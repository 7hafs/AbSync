import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Absence, AbsenceSessionType } from "@/types";

interface AbsenceState {
  absences: Absence[];
  addAbsence: (absence: Absence) => void;
  updateAbsence: (absence: Absence) => void;
  deleteAbsence: (id: string) => void;
  replaceAbsences: (absences: Absence[]) => void;
  getAbsencesForDate: (date: string) => Absence[];
  getAbsencesForDateAndSession: (date: string, session: AbsenceSessionType) => Absence[];
  getAbsencesForStaff: (staffId: string) => Absence[];
  getAbsencesForMonth: (year: number, month: number) => Absence[];
  getTotalAbsencesForStaff: (staffId: string, startDate: string, endDate: string) => number;
  getConflictDays: (startDate: string, endDate: string) => Array<{ date: string; count: number; severity: 'medium' | 'high' | 'critical' }>;
}

const useAbsenceStore = create<AbsenceState>()(
  persist(
    (set, get) => ({
      absences: [],

      addAbsence: (absence) =>
        set((state) => ({
          absences: [...state.absences, absence],
        })),

      updateAbsence: (updatedAbsence) =>
        set((state) => ({
          absences: state.absences.map((a) =>
            a.id === updatedAbsence.id ? updatedAbsence : a
          ),
        })),

      deleteAbsence: (id) =>
        set((state) => ({
          absences: state.absences.filter((a) => a.id !== id),
        })),

      replaceAbsences: (absences) =>
        set(() => ({
          absences,
        })),

      getAbsencesForDate: (date) => {
        return get().absences.filter((a) => a.date === date && a.status !== 'Cancelled');
      },

      getAbsencesForDateAndSession: (date, session) => {
        return get().absences.filter(
          (a) => a.date === date && 
                 (a.session === session || a.session === 'Full Day') && 
                 a.status !== 'Cancelled'
        );
      },

      getAbsencesForStaff: (staffId) => {
        return get().absences.filter((a) => a.staffId === staffId && a.status !== 'Cancelled');
      },

      getAbsencesForMonth: (year, month) => {
        return get().absences.filter((a) => {
          const date = new Date(a.date);
          return date.getFullYear() === year && date.getMonth() === month && a.status !== 'Cancelled';
        });
      },

      getTotalAbsencesForStaff: (staffId, startDate, endDate) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        return get().absences.filter((a) => {
          if (a.staffId !== staffId || a.status === 'Cancelled') return false;
          const absenceDate = new Date(a.date);
          return absenceDate >= start && absenceDate <= end;
        }).length;
      },

      getConflictDays: (startDate, endDate) => {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const conflictMap = new Map<string, number>();
        
        get().absences.forEach((a) => {
          if (a.status === 'Cancelled') return;
          const absenceDate = new Date(a.date);
          if (absenceDate >= start && absenceDate <= end) {
            const count = conflictMap.get(a.date) || 0;
            conflictMap.set(a.date, count + 1);
          }
        });
        
        const conflicts: Array<{ date: string; count: number; severity: 'medium' | 'high' | 'critical' }> = [];
        conflictMap.forEach((count, date) => {
          if (count >= 2) {
            let severity: 'medium' | 'high' | 'critical';
            if (count >= 4) {
              severity = 'critical';
            } else if (count === 3) {
              severity = 'high';
            } else {
              severity = 'medium';
            }
            conflicts.push({ date, count, severity });
          }
        });
        
        return conflicts.sort((a, b) => a.date.localeCompare(b.date));
      },
    }),
    {
      name: "absence-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useAbsenceStore;
