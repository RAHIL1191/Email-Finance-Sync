import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const categoriesTable = pgTable("categories", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type").notNull(), // "expense" | "income" | "both"
  icon: text("icon"), // feather icon name or emoji
  iconType: text("icon_type").default("icon"), // "icon" | "image" | "emoji"
  color: text("color").default("#94a3b8"),
  parentId: text("parent_id"), // null = top-level category, set = subcategory
  providerType: text("provider_type"),
  merchantType: text("merchant_type"),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCategorySchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  type: z.enum(["expense", "income", "both"]),
  icon: z.string().nullable().optional(),
  iconType: z.enum(["icon", "image", "emoji"]).optional().default("icon"),
  color: z.string().optional().default("#94a3b8"),
  parentId: z.string().nullable().optional(),
  providerType: z.string().nullable().optional(),
  merchantType: z.string().nullable().optional(),
  isDefault: z.boolean().optional().default(false),
});

export const updateCategorySchema = insertCategorySchema
  .omit({ id: true, householdId: true })
  .partial();

export type Category = typeof categoriesTable.$inferSelect;
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type UpdateCategory = z.infer<typeof updateCategorySchema>;
