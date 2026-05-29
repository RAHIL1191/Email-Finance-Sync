import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  email: text("email"),
  paymentMode: text("payment_mode"),
  dueDate: text("due_date").notNull(),
  notes: text("notes"),
  priority: text("priority").notNull(), // low | medium | high
  isCompleted: boolean("is_completed").notNull().default(false),
  reminderEnabled: boolean("reminder_enabled").notNull().default(false),
  reminderDate: text("reminder_date"),
  reminderFrequency: text("reminder_frequency"), // once | daily | weekly | monthly
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTaskSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  title: z.string().min(1),
  category: z.string(),
  email: z.string().nullable().optional(),
  paymentMode: z.string().nullable().optional(),
  dueDate: z.string(),
  notes: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high"]),
  isCompleted: z.boolean().optional().default(false),
  reminderEnabled: z.boolean().optional().default(false),
  reminderDate: z.string().nullable().optional(),
  reminderFrequency: z.enum(["once", "daily", "weekly", "monthly"]).nullable().optional(),
});

export const updateTaskSchema = insertTaskSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type TaskRow = typeof tasksTable.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type UpdateTask = z.infer<typeof updateTaskSchema>;
