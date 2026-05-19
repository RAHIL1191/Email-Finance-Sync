import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const pushTokensTable = pgTable(
  "push_tokens",
  {
    householdId: text("household_id").notNull(),
    deviceId: text("device_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform"), // ios | android
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.deviceId] })]
);
