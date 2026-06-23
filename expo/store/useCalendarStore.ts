import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { EventType, CalendarViewType } from "@/types";
import { DB_VERSION } from "@/lib/storageManager";
import {
  upsertCalendarEvent,
  deleteCalendarEventFromSupabase,
  upsertCalendarView,
} from "@/lib/dataService";

interface CalendarState {
  events: EventType[];
  selectedDate: string | null;
  calendarView: CalendarViewType;
  isLoaded: boolean;
  addEvent: (event: EventType) => void;
  updateEvent: (event: EventType) => void;
  deleteEvent: (id: string) => void;
  setSelectedDate: (date: string | null) => void;
  setCalendarView: (view: CalendarViewType) => void;
  replaceEvents: (events: EventType[]) => void;
  setLoaded: (loaded: boolean) => void;
  getEventsForDate: (date: string) => EventType[];
  getEventsForDateRange: (startDate: string, endDate: string) => EventType[];
}

const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      events: [],
      selectedDate: null,
      calendarView: "week" as CalendarViewType,
      isLoaded: false,

      addEvent: (event) => {
        set((state) => ({
          events: [...state.events, event],
        }));
        upsertCalendarEvent(event);
      },

      updateEvent: (updatedEvent) => {
        set((state) => ({
          events: state.events.map((e) =>
            e.id === updatedEvent.id ? updatedEvent : e
          ),
        }));
        upsertCalendarEvent(updatedEvent);
      },

      deleteEvent: (id) => {
        set((state) => ({
          events: state.events.filter((e) => e.id !== id),
        }));
        deleteCalendarEventFromSupabase(id);
      },

      setSelectedDate: (date) =>
        set(() => ({ selectedDate: date })),

      setCalendarView: (view) => {
        set(() => ({ calendarView: view }));
        upsertCalendarView(view);
      },

      replaceEvents: (incoming) => {
        if (!Array.isArray(incoming) || incoming.length === 0) {
          const currentCount = get().events.length;
          if (currentCount > 0) {
            console.warn('[useCalendarStore] Refusing to replace events with empty array');
            return;
          }
        }
        // Merge: keep local records whose updatedAt is newer than the server's version.
        // This prevents stale Supabase refresh results from overwriting realtime updates.
        const existingMap = new Map(get().events.map((e) => [e.id, e]));
        const merged = incoming.map((incomingEvent) => {
          const existing = existingMap.get(incomingEvent.id);
          if (!existing) return incomingEvent;
          if (
            existing.updatedAt &&
            incomingEvent.updatedAt &&
            existing.updatedAt > incomingEvent.updatedAt
          ) {
            return existing; // realtime update beat the server query — keep local
          }
          return incomingEvent;
        });
        set(() => ({ events: merged }));
      },

      setLoaded: (loaded) => set(() => ({ isLoaded: loaded })),

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
      name: "calendar-storage-v3",
      storage: createJSONStorage(() => AsyncStorage),
      version: DB_VERSION,
      migrate: (persisted) => persisted,
      partialize: (state) => ({
        events: state.events,
        calendarView: state.calendarView,
      }),
    }
  )
);

export default useCalendarStore;
