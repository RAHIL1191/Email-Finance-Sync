import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const projectsTable = pgTable("projects", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProjectSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  color: z.string().min(1),
});

export const updateProjectSchema = insertProjectSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type ProjectRow = typeof projectsTable.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type UpdateProject = z.infer<typeof updateProjectSchema>;
