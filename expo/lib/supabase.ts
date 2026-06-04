import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Database } from "@/src/integrations/supabase/types";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase client configured for native session persistence.
 *
 * Uses AsyncStorage for token storage so sessions survive
 * app restarts, updates, and reinstalls (via iCloud key-value).
 * Auth state changes are observed by the useSupabaseAuth hook.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Sync the user profile row in Supabase after sign-in or sign-up.
 * Must be called after every successful authentication.
 */
export async function syncProfile(user: {
  id: string;
  email?: string;
  name?: string;
}) {
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    console.error("[supabase] Failed to sync profile:", error.message);
  }
}
