import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StaffMember } from "@/types";
import { DB_VERSION } from "@/lib/storageManager";
import { upsertStaff, deleteStaffFromSupabase, deleteAbsencesForStaffFromSupabase, writeAuditLog } from "@/lib/dataService";

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
        upsertStaff(member);
        writeAuditLog("staff_created", "staff", member.id, undefined, {
          name: member.name,
          active: member.active,
        });
        return member;
      },

      updateStaff: (updatedStaff) => {
        const old = get().staff.find((s) => s.id === updatedStaff.id);
        set((state) => ({
          staff: state.staff.map((s) =>
            s.id === updatedStaff.id ? updatedStaff : s
          ),
        }));
        upsertStaff(updatedStaff);
        writeAuditLog("staff_updated", "staff", updatedStaff.id,
          old ? { name: old.name, active: old.active } : undefined,
          { name: updatedStaff.name, active: updatedStaff.active }
        );
      },

      deleteStaff: (id) => {
        const deletedStaff = get().staff.find((s) => s.id === id);
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
        deleteStaffFromSupabase(id);
        deleteAbsencesForStaffFromSupabase(id);
        if (deletedStaff) {
          writeAuditLog("staff_deleted", "staff", id,
            { name: deletedStaff.name, active: deletedStaff.active },
            undefined
          );
        }
      },

      archiveStaff: (id) =>
        set((state) => {
          const updated = state.staff.map((s) =>
            s.id === id ? { ...s, active: false } : s
          );
          const changed = updated.find((s) => s.id === id);
          if (changed) {
            upsertStaff(changed);
            writeAuditLog("staff_deactivated", "staff", id);
          }
          return { staff: updated };
        }),

      unarchiveStaff: (id) =>
        set((state) => {
          const updated = state.staff.map((s) =>
            s.id === id ? { ...s, active: true } : s
          );
          const changed = updated.find((s) => s.id === id);
          if (changed) {
            upsertStaff(changed);
            writeAuditLog("staff_activated", "staff", id);
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
