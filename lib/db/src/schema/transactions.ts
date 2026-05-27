import { pgTable, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const transactionsTable = pgTable("transactions", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(), // attribution: which device created this
  accountId: text("account_id").notNull(),
  title: text("title").notNull(),
  amount: real("amount").notNull(),
  type: text("type").notNull(), // income | expense
  category: text("category").notNull(),
  date: text("date").notNull(),
  source: text("source"), // "plaid" | "email" | "manual"
  merchant: text("merchant"),
  plaidItemId: text("plaid_item_id"),
  plaidAccountId: text("plaid_account_id"),
  fromEmail: boolean("from_email").default(false),
  bank: text("bank"),
  note: text("note"),
  pending: boolean("pending").default(false),
  pendingTransactionId: text("pending_transaction_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTransactionSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  accountId: z.string(),
  title: z.string().min(1),
  amount: z.number(),
  type: z.enum(["income", "expense"]),
  category: z.string().min(1),
  date: z.string(),
  source: z.enum(["plaid", "email", "manual"]).nullable().optional(),
  merchant: z.string().nullable().optional(),
  plaidItemId: z.string().nullable().optional(),
  plaidAccountId: z.string().nullable().optional(),
  fromEmail: z.boolean().optional().default(false),
  bank: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  pending: z.boolean().optional().default(false),
  pendingTransactionId: z.string().nullable().optional(),
});

export const updateTransactionSchema = insertTransactionSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type Transaction = typeof transactionsTable.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type UpdateTransaction = z.infer<typeof updateTransactionSchema>;
