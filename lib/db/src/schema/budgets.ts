import { pgTable, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const budgetsTable = pgTable("budgets", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  category: text("category"),
  type: text("type").notNull(), // expense | income
  period: text("period").notNull(), // weekly | monthly | yearly
  includeInOverall: boolean("include_in_overall").notNull().default(true),
  color: text("color"),
  lastNotifState: text("last_notif_state"), // warning_{periodKey} | exceeded_{periodKey} | null
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBudgetSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  name: z.string().min(1),
  amount: z.number(),
  category: z.string().nullable().optional(),
  type: z.enum(["expense", "income"]),
  period: z.enum(["weekly", "monthly", "yearly"]),
  includeInOverall: z.boolean().optional().default(true),
  color: z.string().nullable().optional(),
  lastNotifState: z.string().nullable().optional(),
});

export const updateBudgetSchema = insertBudgetSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type BudgetRow = typeof budgetsTable.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type UpdateBudget = z.infer<typeof updateBudgetSchema>;
