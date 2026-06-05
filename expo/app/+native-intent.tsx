import { Platform } from "react-native";

/**
 * Maps native deep-link URLs to Expo Router paths.
 *
 * This is the entry point for all deep links — including Supabase password
 * reset callbacks (rork-lxwo9f6yr6sjgzxbuwjkz://auth/reset-password#...).
 *
 * On a cold launch the `initial` flag is true and `path` is the full URL path.
 * The router calls this once and navigates to the returned path.
 *
 * We preserve the actual deep-link path so auth callbacks, share links, and
 * future deep-link features all work correctly.
 */
export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  if (process.env.NODE_ENV === "development") {
    console.log("[native-intent] redirectSystemPath", { path, initial });
  }

  // On true initial launch (no deep link), go to root
  if (initial && (!path || path === "/")) {
    return "/";
  }

  // Strip leading slash(es) so the path is a clean Expo Router route
  const cleaned = path.replace(/^\/+/, "");

  // If the deep link came from a Supabase password reset email, the URL
  // looks like:  rork-lxwo9f6yr6sjgzxbuwjkz://auth/reset-password#access_token=...
  // Expo Router strips the fragment before calling us, so `cleaned` will be
  // something like "auth/reset-password".  We route it directly.
  if (cleaned) {
    return `/${cleaned}`;
  }

  return "/";
}
