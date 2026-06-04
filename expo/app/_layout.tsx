import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import useThemeStore from "@/store/useThemeStore";
import useStaffStore from "@/store/useStaffStore";
import useAbsenceStore from "@/store/useAbsenceStore";
import useCalendarStore from "@/store/useCalendarStore";
import useNotesStore from "@/store/useNotesStore";
import useRemindersStore from "@/store/useRemindersStore";
import useNotificationStore from "@/store/useNotificationStore";
import { initializeSampleData } from "@/utils/sampleData";
import {
  initializeNotifications,
  scheduleDailyNotifications,
} from "@/utils/notificationService";
import Colors from "@/constants/colors";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const LOCAL_USER_ID = "local-user";

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
  const systemColorScheme = useColorScheme();
  const { isDarkMode } = useThemeStore();
  const colorScheme =
    isDarkMode === null ? systemColorScheme : isDarkMode ? "dark" : "light";
  const colors = Colors[colorScheme || "light"];

  const staffStore = useStaffStore();
  const absenceStore = useAbsenceStore();
  const calendarStore = useCalendarStore();
  const notesStore = useNotesStore();
  const remindersStore = useRemindersStore();
  const notificationStore = useNotificationStore();

  // On mount: load local data and seed sample data if empty
  useEffect(() => {
    staffStore.setLoaded(true);
    absenceStore.setLoaded(true);
    calendarStore.setLoaded(true);
    notesStore.setLoaded(true);
    remindersStore.setLoaded(true);

    initializeSampleData(staffStore, absenceStore);

    // Initialize notifications with local data
    initializeNotifications(LOCAL_USER_ID);
  }, []);

  // Reschedule notifications when preferences change
  useEffect(() => {
    if (!notificationStore.isLoaded) return;

    const timeout = setTimeout(() => {
      scheduleDailyNotifications(LOCAL_USER_ID);
    }, 500);

    return () => clearTimeout(timeout);
  }, [
    notificationStore.preferences.morningEnabled,
    notificationStore.preferences.eveningEnabled,
    notificationStore.preferences.instantAlertsEnabled,
    notificationStore.isLoaded,
  ]);

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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="share/manage"
        options={{ title: "Share Calendar" }}
      />
      <Stack.Screen
        name="share/join"
        options={{ title: "Join Shared Calendar" }}
      />
      <Stack.Screen
        name="calendar/absence-form"
        options={{ presentation: "modal", title: "Absence" }}
      />
      <Stack.Screen
        name="staff/staff-form"
        options={{ presentation: "modal", title: "Staff" }}
      />
      <Stack.Screen
        name="settings/archived-staff"
        options={{ title: "Archived Staff" }}
      />
      <Stack.Screen
        name="settings/about"
        options={{ title: "Support & About" }}
      />
    </Stack>
  );
}
