import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const accountsTable = pgTable("accounts", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  deviceId: text("device_id").notNull(), // attribution: which device created this
  name: text("name").notNull(),
  bank: text("bank").notNull(),
  balance: real("balance").notNull().default(0),
  type: text("type").notNull(), // checking | savings | credit | investment
  color: text("color").notNull(),
  lastFour: text("last_four"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAccountSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  deviceId: z.string(),
  name: z.string().min(1),
  bank: z.string().min(1),
  balance: z.number().default(0),
  type: z.enum(["checking", "savings", "credit", "investment"]),
  color: z.string().min(1),
  lastFour: z.string().nullable().optional(),
});

export const updateAccountSchema = insertAccountSchema
  .omit({ id: true, householdId: true, deviceId: true })
  .partial();

export type Account = typeof accountsTable.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
