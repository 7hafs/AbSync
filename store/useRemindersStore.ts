import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ReminderType } from "@/types";

interface RemindersState {
  reminders: ReminderType[];
  addReminder: (reminder: ReminderType) => void;
  updateReminder: (reminder: ReminderType) => void;
  deleteReminder: (id: string) => void;
  toggleComplete: (id: string) => void;
  getRemindersForDate: (date: string) => ReminderType[];
  getActiveReminders: () => ReminderType[];
  getCompletedReminders: () => ReminderType[];
}

const useRemindersStore = create<RemindersState>()(
  persist(
    (set, get) => ({
      reminders: [],

      addReminder: (reminder) =>
        set((state) => ({
          reminders: [...state.reminders, reminder],
        })),

      updateReminder: (updatedReminder) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === updatedReminder.id ? updatedReminder : r
          ),
        })),

      deleteReminder: (id) =>
        set((state) => ({
          reminders: state.reminders.filter((r) => r.id !== id),
        })),

      toggleComplete: (id) =>
        set((state) => ({
          reminders: state.reminders.map((r) =>
            r.id === id ? { ...r, isCompleted: !r.isCompleted } : r
          ),
        })),

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
      name: "reminders-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useRemindersStore;
