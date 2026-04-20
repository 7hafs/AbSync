import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import useStaffStore from "@/store/useStaffStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import { initializeSampleData } from "@/utils/sampleData";
import { initializeNotifications } from "@/utils/notificationService";
import Colors from "@/constants/colors";
import useAuthStore from "@/store/useAuthStore";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) {
      console.error(error);
      throw error;
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const router = useRouter();
  const segments = useSegments();
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme = isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];
  const { isAuthenticated } = useAuthStore();
  const staffStore = useStaffStore();
  const absenceStore = useAbsenceStore();
  
  useEffect(() => {
    initializeSampleData(staffStore, absenceStore);
    initializeNotifications();
  }, [staffStore, absenceStore]);

  useEffect(() => {
    const firstSegment = segments[0];
    const isAuthRoute = firstSegment === "auth";
    const isShareRoute = firstSegment === "share";

    console.log("[RootLayout] Evaluating route access", {
      isAuthenticated,
      firstSegment,
    });

    if (!isAuthenticated && !isAuthRoute && !isShareRoute) {
      router.replace("/auth" as any);
      return;
    }

    if (isAuthenticated && isAuthRoute) {
      router.replace("/(tabs)" as any);
    }
  }, [isAuthenticated, router, segments]);

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.primary,
        headerTitleStyle: {
          fontWeight: "bold",
        },
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      <Stack.Screen name="auth" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="share/manage"
        options={{
          title: "Share Calendar",
        }}
      />
      <Stack.Screen
        name="share/join"
        options={{
          title: "Join Shared Calendar",
        }}
      />
      <Stack.Screen 
        name="calendar/absence-form" 
        options={{ 
          presentation: "modal",
          title: "Absence",
        }} 
      />
      <Stack.Screen 
        name="staff/staff-form" 
        options={{ 
          presentation: "modal",
          title: "Staff",
        }} 
      />
      <Stack.Screen 
        name="settings/archived-staff" 
        options={{ 
          title: "Archived Staff",
        }} 
      />
    </Stack>
  );
}