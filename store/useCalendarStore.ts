import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EventType } from "@/types";

interface CalendarState {
  events: EventType[];
  selectedDate: string | null;
  addEvent: (event: EventType) => void;
  updateEvent: (event: EventType) => void;
  deleteEvent: (id: string) => void;
  setSelectedDate: (date: string | null) => void;
  getEventsForDate: (date: string) => EventType[];
  getEventsForDateRange: (startDate: string, endDate: string) => EventType[];
}

const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      events: [],
      selectedDate: null,

      addEvent: (event) =>
        set((state) => ({
          events: [...state.events, event],
        })),

      updateEvent: (updatedEvent) =>
        set((state) => ({
          events: state.events.map((e) =>
            e.id === updatedEvent.id ? updatedEvent : e
          ),
        })),

      deleteEvent: (id) =>
        set((state) => ({
          events: state.events.filter((e) => e.id !== id),
        })),

      setSelectedDate: (date) =>
        set(() => ({
          selectedDate: date,
        })),

      getEventsForDate: (date) => {
        return get().events.filter((e) => e.date === date);
      },

      getEventsForDateRange: (startDate, endDate) => {
        return get().events.filter(
          (e) => e.date >= startDate && e.date <= endDate
        );
      },
    }),
    {
      name: "calendar-storage",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export default useCalendarStore;
