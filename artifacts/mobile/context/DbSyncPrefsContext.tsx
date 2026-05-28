import React from "react";

/** @deprecated — all data syncs automatically. This context is a no-op stub. */
export type SyncableType = "budgets" | "goals" | "tasks" | "projects" | "bills" | "holdings" | "investmentTransactions";

export function DbSyncPrefsProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useDbSyncPrefs() {
  return {
    prefs: {} as any,
    isLoaded: true,
    toggleDbSync: async () => {},
    setLastSync: async () => {},
  };
}
