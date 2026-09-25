import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const goalsTable = pgTable("goals", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(),
  name: text("name").notNull(),
  targetAmount: real("target_amount").notNull(),
  currentAmount: real("current_amount").notNull().default(0),
  targetDate: text("target_date"),
  category: text("category"),
  color: text("color"),
  notes: text("notes"),
  lastNotifState: text("last_notif_state"), // approaching | null
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGoalSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  name: z.string().min(1),
  targetAmount: z.number(),
  currentAmount: z.number().optional().default(0),
  targetDate: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lastNotifState: z.string().nullable().optional(),
});

export const updateGoalSchema = insertGoalSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type GoalRow = typeof goalsTable.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type UpdateGoal = z.infer<typeof updateGoalSchema>;
