import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StaffMember } from "@/types";
import { DB_VERSION } from "@/lib/storageManager";
import { upsertStaff, deleteStaffFromSupabase, deleteAbsencesForStaffFromSupabase } from "@/lib/dataService";

interface StaffState {
  staff: StaffMember[];
  isLoaded: boolean;
  addStaff: (staff: StaffMember) => StaffMember;
  updateStaff: (staff: StaffMember) => void;
  deleteStaff: (id: string) => void;
  archiveStaff: (id: string) => void;
  unarchiveStaff: (id: string) => void;
  replaceStaff: (staff: StaffMember[]) => void;
  setLoaded: (loaded: boolean) => void;
  getActiveStaff: () => StaffMember[];
  getArchivedStaff: () => StaffMember[];
  searchStaff: (query: string) => StaffMember[];
  getStaffById: (id: string) => StaffMember | undefined;
}

const useStaffStore = create<StaffState>()(
  persist(
    (set, get) => ({
      staff: [],
      isLoaded: false,

      addStaff: (staffMember) => {
        const member = staffMember.id
          ? staffMember
          : { ...staffMember, id: Date.now().toString() };
        set((state) => ({
          staff: [...state.staff, member],
        }));
        // Sync to Supabase
        upsertStaff(member);
        return member;
      },

      updateStaff: (updatedStaff) => {
        set((state) => ({
          staff: state.staff.map((s) =>
            s.id === updatedStaff.id ? updatedStaff : s
          ),
        }));
        // Sync to Supabase
        upsertStaff(updatedStaff);
      },

      deleteStaff: (id) => {
        // Remove associated absences from local store first
        try {
          const { default: useAbsenceStore } = require("@/store/useAbsenceStore");
          const absenceState = useAbsenceStore.getState();
          const orphanedIds = absenceState.absences
            .filter((a: { staffId: string; id: string }) => a.staffId === id)
            .map((a: { id: string }) => a.id);
          if (orphanedIds.length > 0) {
            absenceState.replaceAbsences(
              absenceState.absences.filter((a: { staffId: string }) => a.staffId !== id)
            );
            console.log(
              `[useStaffStore] Cascaded delete: removed ${orphanedIds.length} absences for staff ${id}`
            );
          }
        } catch (e) {
          console.warn("[useStaffStore] Could not cascade absence cleanup:", e);
        }

        set((state) => ({
          staff: state.staff.filter((s) => s.id !== id),
        }));
        // Sync to Supabase (staff + associated absences)
        deleteStaffFromSupabase(id);
        deleteAbsencesForStaffFromSupabase(id);
      },

      archiveStaff: (id) =>
        set((state) => {
          const updated = state.staff.map((s) =>
            s.id === id ? { ...s, active: false } : s
          );
          // Sync to Supabase
          const changed = updated.find((s) => s.id === id);
          if (changed) {
            upsertStaff(changed);
          }
          return { staff: updated };
        }),

      unarchiveStaff: (id) =>
        set((state) => {
          const updated = state.staff.map((s) =>
            s.id === id ? { ...s, active: true } : s
          );
          // Sync to Supabase
          const changed = updated.find((s) => s.id === id);
          if (changed) {
            upsertStaff(changed);
          }
          return { staff: updated };
        }),

      replaceStaff: (incoming) => {
        if (!Array.isArray(incoming) || incoming.length === 0) {
          const currentCount = get().staff.length;
          if (currentCount > 0) {
            console.warn('[useStaffStore] Refusing to replace staff with empty array');
            return;
          }
        }
        set(() => ({ staff: incoming }));
      },

      setLoaded: (loaded) => set(() => ({ isLoaded: loaded })),

      getActiveStaff: () => {
        return get().staff.filter((s) => s.active);
      },

      getArchivedStaff: () => {
        return get().staff.filter((s) => !s.active);
      },

      searchStaff: (query) => {
        const lowerQuery = query.toLowerCase();
        return get().staff.filter(
          (s) =>
            s.name.toLowerCase().includes(lowerQuery) ||
            s.department?.toLowerCase().includes(lowerQuery) ||
            s.employeeId?.toLowerCase().includes(lowerQuery) ||
            s.email?.toLowerCase().includes(lowerQuery) ||
            s.jobTitle?.toLowerCase().includes(lowerQuery) ||
            s.phoneNumber?.toLowerCase().includes(lowerQuery)
        );
      },

      getStaffById: (id) => {
        return get().staff.find((s) => s.id === id);
      },
    }),
    {
      name: "staff-storage-v2",
      storage: createJSONStorage(() => AsyncStorage),
      version: DB_VERSION,
      migrate: (persisted) => {
        const state = persisted as { staff?: StaffMember[] };
        if (state.staff) {
          state.staff = state.staff.map((s) => ({
            ...s,
            department: s.department ?? '',
            employeeId: s.employeeId ?? undefined,
            email: s.email ?? undefined,
            jobTitle: s.jobTitle ?? undefined,
            phoneNumber: s.phoneNumber ?? undefined,
            active: s.active ?? true,
          }));
        }
        return state;
      },
      partialize: (state) => ({
        staff: state.staff,
      }),
    }
  )
);

export default useStaffStore;
