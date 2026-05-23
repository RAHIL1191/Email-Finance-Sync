import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const holdingsTable = pgTable("holdings", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(),
  plaidItemId: text("plaid_item_id").notNull(),
  plaidAccountId: text("plaid_account_id").notNull(),
  accountId: text("account_id").notNull(),
  ticker: text("ticker"),
  name: text("name").notNull(),
  securityType: text("security_type").notNull(),
  quantity: real("quantity").notNull(),
  value: real("value").notNull(),
  costBasis: real("cost_basis"),
  currency: text("currency").notNull(),
  asOf: text("as_of"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertHoldingSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  plaidItemId: z.string(),
  plaidAccountId: z.string(),
  accountId: z.string(),
  ticker: z.string().nullable().optional(),
  name: z.string().min(1),
  securityType: z.string(),
  quantity: z.number(),
  value: z.number(),
  costBasis: z.number().nullable().optional(),
  currency: z.string(),
  asOf: z.string().nullable().optional(),
});

export const updateHoldingSchema = insertHoldingSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type HoldingRow = typeof holdingsTable.$inferSelect;
export type InsertHolding = z.infer<typeof insertHoldingSchema>;
export type UpdateHolding = z.infer<typeof updateHoldingSchema>;
