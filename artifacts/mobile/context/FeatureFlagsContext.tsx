import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export interface Features {
  emailSync: boolean;
  manualTransactions: boolean;
  accounts: boolean;
  bills: boolean;
  aiInsights: boolean;
  insights: boolean;
  budget: boolean;
  export: boolean;
  backendSync: boolean;
}

const DEFAULT_FEATURES: Features = {
  emailSync: true,
  manualTransactions: true,
  accounts: true,
  bills: true,
  aiInsights: true,
  insights: true,
  budget: false,
  export: false,
  backendSync: true,
};

const CACHE_KEY = "@fintrack/featureFlags";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface FeatureFlagsContextType {
  features: Features;
  isLoaded: boolean;
  isEnabled: (key: keyof Features) => boolean;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType>({
  features: DEFAULT_FEATURES,
  isLoaded: false,
  isEnabled: (key) => DEFAULT_FEATURES[key],
});

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "http://localhost:80";
}

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [features, setFeatures] = useState<Features>(DEFAULT_FEATURES);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      // Try to load cached flags first (instant display)
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, ts } = JSON.parse(cached);
          if (Date.now() - ts < CACHE_TTL_MS) {
            setFeatures({ ...DEFAULT_FEATURES, ...data });
            setIsLoaded(true);
          }
        }
      } catch {}

      // Fetch fresh flags from server
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${getApiBase()}/api/config/features`, {
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) {
          const { features: serverFlags } = await res.json();
          const merged = { ...DEFAULT_FEATURES, ...serverFlags };
          setFeatures(merged);
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data: serverFlags, ts: Date.now() }));
        }
      } catch {
        // Use defaults / cached value — server may be offline
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const isEnabled = (key: keyof Features) => features[key];

  return (
    <FeatureFlagsContext.Provider value={{ features, isLoaded, isEnabled }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

export function useFeature(key: keyof Features): boolean {
  const { features } = useContext(FeatureFlagsContext);
  return features[key];
}
