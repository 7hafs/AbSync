/**
 * Notification preferences store.
 *
 * Stores user notification settings locally in AsyncStorage.
 * Preferences survive app updates and reinstalls.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DB_VERSION } from "@/lib/storageManager";
import { upsertNotificationPreferences } from "@/lib/dataService";

export interface NotificationPreferences {
  morningEnabled: boolean;
  eveningEnabled: boolean;
  instantAlertsEnabled: boolean;
}

interface NotificationState {
  preferences: NotificationPreferences;
  isLoaded: boolean;
  setMorningEnabled: (enabled: boolean) => void;
  setEveningEnabled: (enabled: boolean) => void;
  setInstantAlertsEnabled: (enabled: boolean) => void;
  setPreferences: (prefs: NotificationPreferences) => void;
  setLoaded: (loaded: boolean) => void;
}

const DEFAULT_PREFS: NotificationPreferences = {
  morningEnabled: true,
  eveningEnabled: true,
  instantAlertsEnabled: false,
};

const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      preferences: DEFAULT_PREFS,
      isLoaded: false,

      setMorningEnabled: (enabled) => {
        set((state) => {
          const newPrefs = { ...state.preferences, morningEnabled: enabled };
          // Sync to Supabase (fire-and-forget)
          upsertNotificationPreferences(newPrefs);
          return { preferences: newPrefs };
        });
      },

      setEveningEnabled: (enabled) => {
        set((state) => {
          const newPrefs = { ...state.preferences, eveningEnabled: enabled };
          // Sync to Supabase (fire-and-forget)
          upsertNotificationPreferences(newPrefs);
          return { preferences: newPrefs };
        });
      },

      setInstantAlertsEnabled: (enabled) => {
        set((state) => {
          const newPrefs = { ...state.preferences, instantAlertsEnabled: enabled };
          // Sync to Supabase (fire-and-forget)
          upsertNotificationPreferences(newPrefs);
          return { preferences: newPrefs };
        });
      },

      setPreferences: (prefs) => {
        set(() => ({ preferences: prefs }));
        // Sync to Supabase
        upsertNotificationPreferences(prefs);
      },

      setLoaded: (loaded) => set(() => ({ isLoaded: loaded })),
    }),
    {
      name: "notification-prefs-v2",
      storage: createJSONStorage(() => AsyncStorage),
      version: DB_VERSION,
      migrate: (persisted) => persisted,
      partialize: (state) => ({
        preferences: state.preferences,
      }),
    }
  )
);

export default useNotificationStore;
