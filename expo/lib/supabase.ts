import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import type { Database } from "@/src/integrations/supabase/types";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {},
  },
  auth: {
    persistSession: false,
  },
  accessToken: async () => {
    const token = await SecureStore.getItemAsync("access_token");
    return token ?? undefined;
  },
});

/**
 * Sync the user profile row in Supabase after sign-in.
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
