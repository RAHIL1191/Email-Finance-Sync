import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const investmentTransactionsTable = pgTable("investment_transactions", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(),
  plaidTxId: text("plaid_tx_id").notNull().unique(),
  plaidItemId: text("plaid_item_id").notNull(),
  plaidAccountId: text("plaid_account_id").notNull(),
  accountId: text("account_id").notNull(),
  date: text("date").notNull(),
  name: text("name").notNull(),
  ticker: text("ticker"),
  type: text("type").notNull(),
  subtype: text("subtype"),
  quantity: real("quantity"),
  amount: real("amount").notNull(),
  fees: real("fees"),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertInvestmentTransactionSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  plaidTxId: z.string(),
  plaidItemId: z.string(),
  plaidAccountId: z.string(),
  accountId: z.string(),
  date: z.string(),
  name: z.string().min(1),
  ticker: z.string().nullable().optional(),
  type: z.string(),
  subtype: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  amount: z.number(),
  fees: z.number().nullable().optional(),
  currency: z.string(),
});

export const updateInvestmentTransactionSchema = insertInvestmentTransactionSchema
  .omit({ id: true, householdId: true, deviceId: true, plaidTxId: true })
  .partial();

export type InvestmentTransactionRow = typeof investmentTransactionsTable.$inferSelect;
export type InsertInvestmentTransaction = z.infer<typeof insertInvestmentTransactionSchema>;
export type UpdateInvestmentTransaction = z.infer<typeof updateInvestmentTransactionSchema>;
