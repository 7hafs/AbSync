import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ReminderType } from "@/types";
import { DB_VERSION } from "@/lib/storageManager";
import { upsertReminder, deleteReminderFromSupabase } from "@/lib/dataService";

interface RemindersState {
  reminders: ReminderType[];
  isLoaded: boolean;
  addReminder: (reminder: ReminderType) => void;
  updateReminder: (reminder: ReminderType) => void;
  deleteReminder: (id: string) => void;
  toggleComplete: (id: string) => void;
  replaceReminders: (reminders: ReminderType[]) => void;
  setLoaded: (loaded: boolean) => void;
  getRemindersForDate: (date: string) => ReminderType[];
  getActiveReminders: () => ReminderType[];
  getCompletedReminders: () => ReminderType[];
}

const useRemindersStore = create<RemindersState>()(
  persist(
    (set, get) => ({
      reminders: [],
      isLoaded: false,

      addReminder: (reminder) => {
        set((state) => ({
          reminders: [...state.reminders, reminder],
        }));
        // Sync to Supabase
        upsertReminder(reminder);
      },

      updateReminder: (updatedReminder) => {
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === updatedReminder.id ? updatedReminder : r
          ),
        }));
        // Sync to Supabase
        upsertReminder(updatedReminder);
      },

      deleteReminder: (id) => {
        set((state) => ({
          reminders: state.reminders.filter((r) => r.id !== id),
        }));
        // Sync to Supabase
        deleteReminderFromSupabase(id);
      },

      toggleComplete: (id) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, isCompleted: !r.isCompleted } : r
          ),
        })),

      replaceReminders: (incoming) => {
        if (!Array.isArray(incoming) || incoming.length === 0) {
          const currentCount = get().reminders.length;
          if (currentCount > 0) {
            console.warn('[useRemindersStore] Refusing to replace reminders with empty array');
            return;
          }
        }
        set(() => ({ reminders: incoming }));
      },
      setLoaded: (loaded) => set(() => ({ isLoaded: loaded })),

      getRemindersForDate: (date) => {
        return get().reminders.filter((r) => r.date === date);
      },

      getActiveReminders: () => {
        return get().reminders.filter((r) => !r.isCompleted);
      },

      getCompletedReminders: () => {
        return get().reminders.filter((r) => r.isCompleted);
      },
    }),
    {
      name: "reminders-storage-v2",
      storage: createJSONStorage(() => AsyncStorage),
      version: DB_VERSION,
      migrate: (persisted) => persisted,
      partialize: (state) => ({
        reminders: state.reminders,
      }),
    }
  )
);

export default useRemindersStore;
