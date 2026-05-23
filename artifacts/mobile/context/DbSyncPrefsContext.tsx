import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

export type SyncableType = "budgets" | "goals" | "tasks" | "projects" | "bills" | "holdings" | "investmentTransactions";

export interface DbSyncPrefs {
  budgets: boolean;
  goals: boolean;
  tasks: boolean;
  projects: boolean;
  bills: boolean;
  holdings: boolean;
  investmentTransactions: boolean;
  budgets_lastSync?: string;
  goals_lastSync?: string;
  tasks_lastSync?: string;
  projects_lastSync?: string;
  bills_lastSync?: string;
  holdings_lastSync?: string;
  investmentTransactions_lastSync?: string;
  /** Timestamp recorded when sync was turned OFF — used to pull delta on resume */
  budgets_stoppedAt?: string;
  goals_stoppedAt?: string;
  tasks_stoppedAt?: string;
  projects_stoppedAt?: string;
  bills_stoppedAt?: string;
  holdings_stoppedAt?: string;
  investmentTransactions_stoppedAt?: string;
}

const DEFAULT_PREFS: DbSyncPrefs = {
  budgets: false,
  goals: false,
  tasks: false,
  projects: false,
  bills: false,
  holdings: false,
  investmentTransactions: false,
};

const STORAGE_KEY = "@fintrack/dbSyncPrefs";

interface DbSyncPrefsContextType {
  prefs: DbSyncPrefs;
  isLoaded: boolean;
  /** Enable or disable DB sync for a data type. On disable, records stoppedAt. */
  toggleDbSync: (type: SyncableType, enable: boolean) => Promise<void>;
  /** Update the lastSync timestamp for a type after a successful sync. */
  setLastSync: (type: SyncableType, ts: string) => Promise<void>;
}

const DbSyncPrefsContext = createContext<DbSyncPrefsContextType>({
  prefs: DEFAULT_PREFS,
  isLoaded: false,
  toggleDbSync: async () => {},
  setLastSync: async () => {},
});

export function DbSyncPrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<DbSyncPrefs>(DEFAULT_PREFS);
  const [isLoaded, setIsLoaded] = useState(false);
  const prefsRef = useRef<DbSyncPrefs>(DEFAULT_PREFS);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved: DbSyncPrefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
          prefsRef.current = saved;
          setPrefs(saved);
        }
      } catch {}
      setIsLoaded(true);
    })();
  }, []);

  const persist = async (next: DbSyncPrefs) => {
    prefsRef.current = next;
    setPrefs(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const toggleDbSync = async (type: SyncableType, enable: boolean) => {
    const now = new Date().toISOString();
    const current = prefsRef.current;
    const next: DbSyncPrefs = {
      ...current,
      [type]: enable,
    };
    if (!enable) {
      // Record when sync stopped so we can pull delta on resume
      (next as any)[`${type}_stoppedAt`] = now;
    } else {
      // Clear stoppedAt once re-enabled (caller will handle pulling delta)
      (next as any)[`${type}_stoppedAt`] = undefined;
      (next as any)[`${type}_lastSync`] = now;
    }
    await persist(next);
  };

  const setLastSync = async (type: SyncableType, ts: string) => {
    const next: DbSyncPrefs = { ...prefsRef.current, [`${type}_lastSync`]: ts };
    await persist(next);
  };

  return (
    <DbSyncPrefsContext.Provider value={{ prefs, isLoaded, toggleDbSync, setLastSync }}>
      {children}
    </DbSyncPrefsContext.Provider>
  );
}

export function useDbSyncPrefs() {
  return useContext(DbSyncPrefsContext);
}
