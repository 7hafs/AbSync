import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StaffMember } from "@/types";

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
        return member;
      },

      updateStaff: (updatedStaff) =>
        set((state) => ({
          staff: state.staff.map((s) =>
            s.id === updatedStaff.id ? updatedStaff : s
          ),
        })),

      deleteStaff: (id) =>
        set((state) => ({
          staff: state.staff.filter((s) => s.id !== id),
        })),

      archiveStaff: (id) =>
        set((state) => ({
          staff: state.staff.map((s) =>
            s.id === id ? { ...s, active: false } : s
          ),
        })),

      unarchiveStaff: (id) =>
        set((state) => ({
          staff: state.staff.map((s) =>
            s.id === id ? { ...s, active: true } : s
          ),
        })),

      replaceStaff: (staff) => set(() => ({ staff })),

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
            s.department?.toLowerCase().includes(lowerQuery)
        );
      },

      getStaffById: (id) => {
        return get().staff.find((s) => s.id === id);
      },
    }),
    {
      name: "staff-storage-v2",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        staff: state.staff,
      }),
    }
  )
);

export default useStaffStore;
