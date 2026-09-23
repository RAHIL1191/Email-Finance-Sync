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
  frequency: text("frequency"), // daily | weekly | biweekly | monthly | quarterly | semiannual | yearly
  accountId: text("account_id"),
  lastNotifState: text("last_notif_state"), // upcoming | due_unpaid | overdue | paid | null
  notes: text("notes"),
  remindDays: text("remind_days"),
  autoPaid: boolean("auto_paid").default(false),
  billNumber: text("bill_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBillSchema = z.object({
  id: z.string(),
  householdId: z.string().optional(),
  deviceId: z.string().optional(),
  title: z.string().min(1),
  amount: z.number(),
  dueDate: z.string(),
  category: z.string().min(1),
  isPaid: z.boolean().optional().default(false),
  isRecurring: z.boolean().optional().default(false),
  frequency: z.string().nullable().optional(),
  accountId: z.string().nullable().optional(),
  lastNotifState: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  remindDays: z.string().nullable().optional(),
  autoPaid: z.boolean().nullable().optional(),
  billNumber: z.string().nullable().optional(),
  receipts: z.array(z.string()).optional(),
  addExpenseEntry: z.boolean().optional(),
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
});

export const updateBillSchema = insertBillSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type Bill = typeof billsTable.$inferSelect;
export type InsertBill = z.infer<typeof insertBillSchema>;
export type UpdateBill = z.infer<typeof updateBillSchema>;
