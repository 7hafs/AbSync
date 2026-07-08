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
    detectSessionInUrl: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Returns the correct redirect URL for Supabase auth callbacks,
 * platform-aware.
 *
 * **Web**: Points at the root domain — NOT /auth/reset-password.
 * The Rork web preview serves static files and does NOT support SPA
 * fallback routing. A direct browser request to /auth/reset-password
 * would 404 at the server level before the JS bundle even loads.
 * Supabase appends hash-fragment recovery tokens
 * (#access_token=...&refresh_token=...&type=recovery) which are
 * NEVER sent to the server — they stay client-side only. So the server
 * sees a request for /, serves index.html, the app boots, AuthGate
 * detects the recovery tokens in the URL hash, calls setSession(),
 * and navigates to /auth/reset-password.
 *
 * **Native (iOS/Android)**: Uses the app's custom URL scheme:
 *   rork-<projectId>://auth/reset-password#access_token=...&type=recovery
 * iOS opens the app directly (not Safari), and +native-intent.tsx
 * routes the deep link so AuthGate can process the recovery tokens.
 *
 * The custom scheme must be registered in app.json ("scheme" field)
 * AND added to the Supabase Authentication → URL Configuration
 * redirect URL allowlist. Both have been verified.
 */
export function getAuthRedirectUrl(): string {
  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;

  if (Platform.OS === "web") {
    return `https://p-${projectId}--expo.rork.live`;
  }

  // Native: use the custom URL scheme registered in app.json.
  // Supabase appends the hash fragment (#access_token=...&type=recovery)
  // to this URL, and the OS opens the app directly.
  const scheme = `rork-${projectId}`;
  return `${scheme}://auth/reset-password`;
}
