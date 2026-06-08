/**
 * Supabase client configured for native session persistence.
 *
 * Session tokens are stored in SecureStore (iOS Keychain / Android Keystore)
 * so the user stays logged in across app restarts, updates, and reinstalls.
 */
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/integrations/supabase/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY"
  );
}

/**
 * SecureStore adapter for Supabase session persistence.
 *
 * Uses SecureStore on native platforms (iOS Keychain, Android Keystore)
 * and falls back to AsyncStorage on web/other environments.
 */
const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      if (Platform.OS === "web") {
        return AsyncStorage.getItem(key);
      }
      return SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        await AsyncStorage.setItem(key, value);
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch (err) {
      console.error("[supabase] SecureStore write failed:", err);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      if (Platform.OS === "web") {
        await AsyncStorage.removeItem(key);
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (err) {
      console.error("[supabase] SecureStore delete failed:", err);
    }
  },
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

/**
 * Returns the correct redirect URL for Supabase auth callbacks.
 *
 * Uses the Rork preview URL (already in Supabase's allowed redirect list)
 * so password reset and email confirmation links work in the preview
 * environment. On native devices these URLs are handled by the Expo
 * WebBrowser / deep-link system.
 */
export function getAuthRedirectUrl(): string {
  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
  return `https://p-${projectId}--expo.rork.live/auth/reset-password`;
}
