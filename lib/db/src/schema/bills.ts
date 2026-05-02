import { pgTable, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const billsTable = pgTable("bills", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(), // attribution: which device created this
  title: text("title").notNull(),
  amount: real("amount").notNull(),
  dueDate: text("due_date").notNull(),
  category: text("category").notNull(),
  isPaid: boolean("is_paid").default(false).notNull(),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  frequency: text("frequency"), // weekly | monthly | yearly
  accountId: text("account_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBillSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  title: z.string().min(1),
  amount: z.number(),
  dueDate: z.string(),
  category: z.string().min(1),
  isPaid: z.boolean().optional().default(false),
  isRecurring: z.boolean().optional().default(false),
  frequency: z.enum(["weekly", "monthly", "yearly"]).nullable().optional(),
  accountId: z.string().nullable().optional(),
});

export const updateBillSchema = insertBillSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type Bill = typeof billsTable.$inferSelect;
export type InsertBill = z.infer<typeof insertBillSchema>;
export type UpdateBill = z.infer<typeof updateBillSchema>;
