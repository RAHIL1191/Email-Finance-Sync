import {
  Inter_300Light,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import Drawer from "@/components/Drawer";
import { AppProvider } from "@/context/AppContext";
import { AIProviderProvider } from "@/context/AIProviderContext";
import { DrawerProvider } from "@/context/DrawerContext";
import { FeatureFlagsProvider } from "@/context/FeatureFlagsContext";
import { ThemeProvider } from "@/context/ThemeContext";

// expo-keep-awake (used by Expo dev tools) lacks a .catch() on activateKeepAwakeAsync.
// On fast-refresh with the new architecture the activity is briefly absent, causing an
// unhandled promise rejection that shows the dev error overlay as a black screen.
LogBox.ignoreLogs([/Unable to activate keep awake/]);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="account/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="ai-review" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="refunds" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="projects" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="project-detail" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="notifications" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="alerts" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="data-storage" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="settings" options={{ headerShown: false, animation: "slide_from_right" }} />
      <Stack.Screen name="category-mapping" options={{ headerShown: false, animation: "slide_from_right" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const ready = fontsLoaded || fontError || timedOut;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <ThemeProvider>
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <FeatureFlagsProvider>
            <AppProvider>
              <AIProviderProvider>
              <DrawerProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    <View style={{ flex: 1 }}>
                      <RootLayoutNav />
                      <Drawer />
                    </View>
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </DrawerProvider>
              </AIProviderProvider>
            </AppProvider>
          </FeatureFlagsProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
    </ThemeProvider>
  );
}
