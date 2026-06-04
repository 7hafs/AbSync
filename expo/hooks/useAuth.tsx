import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";

const AUTH_URL = process.env.EXPO_PUBLIC_RORK_AUTH_URL!;
const APP_KEY = process.env.EXPO_PUBLIC_RORK_APP_KEY!;
const PROJECT_ID = process.env.EXPO_PUBLIC_PROJECT_ID!;

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/** Decode the JWT payload to extract user info and check expiration. */
function userFromToken(token: string): AuthUser | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));

    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return {
      id: payload.sub,
      email: payload.email ?? "",
      name: payload.name,
      picture: payload.picture,
    };
  } catch {
    return null;
  }
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isSigningIn: boolean;
  error: string | null;
  signIn: (provider: "google" | "apple") => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeVerifierRef = useRef<string | null>(null);

  function clearError() {
    setError(null);
  }

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener("url", handleDeepLink);
    return () => subscription.remove();
  }, []);

  async function checkAuth() {
    try {
      const accessToken = await SecureStore.getItemAsync("access_token");
      if (!accessToken) {
        const refreshTokenStored = await SecureStore.getItemAsync(
          "refresh_token"
        );
        if (refreshTokenStored) {
          await refreshToken();
        }
        return;
      }

      const decoded = userFromToken(accessToken);
      if (decoded) {
        setUser(decoded);
      } else {
        await refreshToken();
      }
    } catch (err) {
      console.error("Auth check failed:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDeepLink(event: { url: string }) {
    try {
      const url = new URL(event.url);
      if (url.pathname === "/auth/callback") {
        const code = url.searchParams.get("code");
        if (code) {
          await exchangeCode(code);
        }
      }
    } catch (err) {
      console.error("Deep link handling failed:", err);
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function signIn(provider: "google" | "apple") {
    setIsSigningIn(true);
    setError(null);
    try {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      codeVerifierRef.current = verifier;

      const isWeb = Platform.OS === "web";
      const target = "rn";
      const env = isWeb ? "preview" : "native";

      const response = await fetch(`${AUTH_URL}/oauth/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_key: APP_KEY,
          provider,
          code_challenge: challenge,
          target,
          env,
        }),
      });

      if (!response.ok) {
        codeVerifierRef.current = null;
        const body = await response.json().catch(() => ({}));
        const message = body.error || `Sign in failed (${response.status})`;
        console.error(`Auth initiate failed (${response.status}):`, body);
        setError(message);
        return;
      }

      const { auth_url } = await response.json();

      if (isWeb) {
        const popup = window.open(auth_url, "_blank", "width=500,height=650");

        await new Promise<void>((resolve, reject) => {
          const onMessage = (event: MessageEvent) => {
            if (event.data?.type !== "rork_auth_callback") return;
            window.removeEventListener("message", onMessage);
            clearInterval(pollTimer);
            const code = event.data.code;
            if (code) {
              exchangeCode(code).then(resolve, reject);
            } else {
              reject(new Error("No code received"));
            }
          };
          window.addEventListener("message", onMessage);

          const pollTimer = setInterval(() => {
            if (popup?.closed) {
              clearInterval(pollTimer);
              window.removeEventListener("message", onMessage);
              codeVerifierRef.current = null;
              resolve();
            }
          }, 500);
        });
      } else {
        const result = await WebBrowser.openAuthSessionAsync(
          auth_url,
          `rork-${PROJECT_ID}://auth/callback`
        );

        if (result.type === "success") {
          const url = new URL(result.url);
          const code = url.searchParams.get("code");
          if (code) {
            await exchangeCode(code);
          }
        }
      }
    } catch (err) {
      console.error("Sign in failed:", err);
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setIsSigningIn(false);
    }
  }

  async function exchangeCode(code: string) {
    const verifier = codeVerifierRef.current;
    if (!verifier) return;
    codeVerifierRef.current = null;

    const response = await fetch(`${AUTH_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_key: APP_KEY,
        code,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message =
        body.error || `Token exchange failed (${response.status})`;
      console.error(`Token exchange failed (${response.status}):`, body);
      setError(message);
      return;
    }

    const { access_token, refresh_token, user: userData } =
      await response.json();

    await SecureStore.setItemAsync("access_token", access_token);
    await SecureStore.setItemAsync("refresh_token", refresh_token);

    setUser(userData);
  }

  async function refreshToken() {
    const storedRefreshToken = await SecureStore.getItemAsync("refresh_token");
    if (!storedRefreshToken) {
      setUser(null);
      return;
    }

    const response = await fetch(`${AUTH_URL}/oauth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_key: APP_KEY,
        refresh_token: storedRefreshToken,
      }),
    });

    if (!response.ok) {
      await signOut();
      return;
    }

    const { access_token } = await response.json();
    await SecureStore.setItemAsync("access_token", access_token);

    setUser(userFromToken(access_token));
  }

  async function signOut() {
    await SecureStore.deleteItemAsync("access_token");
    await SecureStore.deleteItemAsync("refresh_token");
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isSigningIn,
        error,
        signIn,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
