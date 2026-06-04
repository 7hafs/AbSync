import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import { DB_VERSION } from "@/lib/storageManager";

interface ThemeState {
  isDarkMode: boolean | null; // null means follow system
  toggleDarkMode: () => void;
  setDarkMode: (isDark: boolean | null) => void;
  getIsDarkMode: () => boolean;
}

const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDarkMode: null,
      
      toggleDarkMode: () => set((state) => ({ 
        isDarkMode: state.isDarkMode === null ? true : !state.isDarkMode 
      })),
      
      setDarkMode: (isDark) => set({ 
        isDarkMode: isDark 
      }),
      
      getIsDarkMode: () => {
        const state = get().isDarkMode;
        if (state === null) {
          // Follow system
          return useColorScheme() === "dark";
        }
        return state;
      },
    }),
    {
      name: "theme-storage",
      storage: createJSONStorage(() => AsyncStorage),
      version: DB_VERSION,
      migrate: (persisted) => persisted,
    }
  )
);

export default useThemeStore;