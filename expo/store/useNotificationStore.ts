/**
 * Notification preferences store.
 *
 * Stores user notification settings in Supabase so they survive
 * app reinstalls and sync across devices. Falls back to AsyncStorage
 * for offline access.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

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
  syncFromSupabase: (userId: string) => Promise<void>;
  persistToSupabase: (userId: string) => Promise<void>;
}

const DEFAULT_PREFS: NotificationPreferences = {
  morningEnabled: true,
  eveningEnabled: true,
  instantAlertsEnabled: false,
};

const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
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

      syncFromSupabase: async (userId) => {
        try {
          const { data, error } = await supabase
            .from("notification_preferences")
            .select("*")
            .eq("user_id", userId)
            .single();

          if (error && error.code !== "PGRST116") {
            console.error(
              "[notificationStore] syncFromSupabase error:",
              error.message
            );
            return;
          }

          if (data) {
            set({
              preferences: {
                morningEnabled: data.morning_enabled ?? true,
                eveningEnabled: data.evening_enabled ?? true,
                instantAlertsEnabled: data.instant_alerts_enabled ?? false,
              },
              isLoaded: true,
            });
          } else {
            // No row yet — upsert defaults
            await supabase.from("notification_preferences").upsert(
              {
                user_id: userId,
                morning_enabled: true,
                evening_enabled: true,
                instant_alerts_enabled: false,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            );
            set({ isLoaded: true });
          }
        } catch (err) {
          console.error("[notificationStore] syncFromSupabase error:", err);
          set({ isLoaded: true });
        }
      },

      persistToSupabase: async (userId) => {
        try {
          const { preferences } = get();
          const { error } = await supabase
            .from("notification_preferences")
            .upsert(
              {
                user_id: userId,
                morning_enabled: preferences.morningEnabled,
                evening_enabled: preferences.eveningEnabled,
                instant_alerts_enabled: preferences.instantAlertsEnabled,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id" }
            );

          if (error) {
            console.error(
              "[notificationStore] persistToSupabase error:",
              error.message
            );
          }
        } catch (err) {
          console.error("[notificationStore] persistToSupabase error:", err);
        }
      },
    }),
    {
      name: "notification-prefs-v2",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        preferences: state.preferences,
      }),
    }
  )
);

export default useNotificationStore;
