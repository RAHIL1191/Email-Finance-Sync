/**
 * Feature Flags Configuration
 *
 * Control which features are enabled in the app.
 * All flags read from environment variables with sensible defaults.
 * Set FEATURE_<NAME>=false in your environment to disable a feature.
 *
 * Example:
 *   FEATURE_EMAIL_SYNC=false   → disables Gmail/email sync
 *   FEATURE_BILLS=false        → hides the Bills tab
 */

function flag(envKey: string, defaultValue = true): boolean {
  const val = process.env[envKey];
  if (val === undefined) return defaultValue;
  return val.toLowerCase() !== "false" && val !== "0";
}

export const features = {
  /** Email/Gmail sync for auto-importing bank transactions */
  emailSync: flag("FEATURE_EMAIL_SYNC"),

  /** Plaid bank account sync */
  plaidSync: flag("FEATURE_PLAID_SYNC"),

  /** Manual transaction entry */
  manualTransactions: flag("FEATURE_MANUAL_TRANSACTIONS"),

  /** Accounts management */
  accounts: flag("FEATURE_ACCOUNTS"),

  /** Bills tracking */
  bills: flag("FEATURE_BILLS"),

  /** AI-powered insights tab */
  aiInsights: flag("FEATURE_AI_INSIGHTS"),

  /** Cash flow / spending insights */
  insights: flag("FEATURE_INSIGHTS"),

  /** Budget tracking */
  budget: flag("FEATURE_BUDGET"),

  /** Data export */
  export: flag("FEATURE_EXPORT"),

  /** Backend persistence (sync data to server) */
  backendSync: flag("FEATURE_BACKEND_SYNC"),
} as const;

export type Features = typeof features;
export type FeatureKey = keyof Features;
