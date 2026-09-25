import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const plaidItemsTable = pgTable("plaid_items", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  itemId: text("item_id").notNull(),
  accessToken: text("access_token").notNull(),
  bankName: text("bank_name").notNull(),
  bankColor: text("bank_color").notNull().default("#1a56db"),
  cursor: text("cursor"),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  error: text("error"),
});

export type PlaidItemRecord = typeof plaidItemsTable.$inferSelect;
