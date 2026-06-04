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
        set((state) => ({
          preferences: { ...state.preferences, morningEnabled: enabled },
        }));
      },

      setEveningEnabled: (enabled) => {
        set((state) => ({
          preferences: { ...state.preferences, eveningEnabled: enabled },
        }));
      },

      setInstantAlertsEnabled: (enabled) => {
        set((state) => ({
          preferences: { ...state.preferences, instantAlertsEnabled: enabled },
        }));
      },

      setPreferences: (prefs) => set(() => ({ preferences: prefs })),

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
