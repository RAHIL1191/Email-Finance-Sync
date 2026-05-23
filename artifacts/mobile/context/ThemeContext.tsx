import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useColorScheme } from "react-native";

type ThemePreference = "Light" | "Dark" | "System";
type ColorScheme = "light" | "dark";

const SETTINGS_KEY = "app_settings_v1";

interface ThemeContextType {
  theme: ThemePreference;
  colorScheme: ColorScheme;
  setTheme: (t: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "Dark",
  colorScheme: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const deviceScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemePreference>("Dark");

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.theme) setThemeState(parsed.theme as ThemePreference);
        } catch {}
      }
    });
  }, []);

  const setTheme = useCallback((t: ThemePreference) => {
    setThemeState(t);
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      try {
        const existing = raw ? JSON.parse(raw) : {};
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...existing, theme: t }));
      } catch {
        AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: t }));
      }
    });
  }, []);

  const colorScheme: ColorScheme =
    theme === "System"
      ? deviceScheme === "dark"
        ? "dark"
        : "light"
      : theme === "Dark"
      ? "dark"
      : "light";

  return (
    <ThemeContext.Provider value={{ theme, colorScheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
