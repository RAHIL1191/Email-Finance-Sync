import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod";

export const categoryRulesTable = pgTable("category_rules", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull(),
  /** Normalized merchant name (lowercased, trimmed) used for matching */
  merchantPattern: text("merchant_pattern").notNull(),
  /** Exact original merchant string from the first match */
  merchantExact: text("merchant_exact"),
  /** The category to auto-assign (e.g. "Food & Grocery" or "Food & Grocery - Groceries") */
  category: text("category").notNull(),
  /** How many times this rule has been applied */
  hitCount: integer("hit_count").default(1).notNull(),
  /** "manual" = user explicitly set, "learned" = inferred from user action */
  source: text("source").default("learned").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCategoryRuleSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  merchantPattern: z.string().min(1),
  merchantExact: z.string().nullable().optional(),
  category: z.string().min(1),
  hitCount: z.number().int().optional().default(1),
  source: z.enum(["manual", "learned"]).optional().default("learned"),
});

export const updateCategoryRuleSchema = insertCategoryRuleSchema
  .omit({ id: true, householdId: true })
  .partial();

export type CategoryRule = typeof categoryRulesTable.$inferSelect;
export type InsertCategoryRule = z.infer<typeof insertCategoryRuleSchema>;
