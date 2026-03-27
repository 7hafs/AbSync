import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";

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
    }
  )
);

export default useThemeStore;