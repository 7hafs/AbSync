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
import * as Linking from "expo-linking";

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
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Returns the correct redirect URL for Supabase auth callbacks.
 *
 * **Web**: Points at the root domain (NOT /auth/reset-password) because
 * the Rork web preview serves static files without SPA fallback. Supabase
 * appends hash-fragment recovery tokens (#access_token=...&type=recovery)
 * which are never sent to the server — they stay client-side. The server
 * serves index.html for /, the app boots, AuthGate detects the tokens in
 * the URL hash, calls setSession(), and navigates to /auth/reset-password.
 *
 * **Native (iOS/Android)**: Uses `Linking.createURL()` which automatically
 * generates the correct URL based on the runtime environment:
 *
 *   - Expo Go (development):  exp://<host>/--/auth/reset-password
 *   - Standalone build (prod): <scheme>://auth/reset-password
 *
 * This is critical: if we hardcode the custom scheme URL (e.g.
 * rork-<projectId>://auth/reset-password), iOS opens whatever app has that
 * scheme registered — which is the App Store production build, NOT the
 * Expo Go development build the user is testing with. By using
 * Linking.createURL(), the redirect URL always matches the app that's
 * actually running.
 *
 * Supabase appends the hash fragment to whichever URL we provide, and the
 * OS routes the deep link to the correct app. The redirect URL must be in
 * the Supabase Authentication → URL Configuration allowlist.
 */
export function getAuthRedirectUrl(): string {
  if (Platform.OS === "web") {
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
    return `https://p-${projectId}--expo.rork.live`;
  }

  // Native: Linking.createURL() generates the environment-correct URL.
  // Expo Go → exp://<host>/--/auth/reset-password
  // Standalone → <scheme>://auth/reset-password
  return Linking.createURL("auth/reset-password");
}
