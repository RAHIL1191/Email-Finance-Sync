import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, categoryRulesTable, insertCategoryRuleSchema, updateCategoryRuleSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/category-rules — list all rules for this household */
router.get("/category-rules", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(categoryRulesTable)
      .where(eq(categoryRulesTable.householdId, res.locals.householdId));
    res.json(rows);
  } catch (err: any) {
    if (err?.cause?.code === "42P01" || /relation .* does not exist/.test(err?.message ?? "")) {
      res.json([]);
      return;
    }
    req.log.error({ err }, "Failed to fetch category rules");
    res.status(500).json({ error: "Failed to fetch category rules" });
  }
});

/** POST /api/category-rules — create or upsert a rule */
router.post("/category-rules", validate(insertCategoryRuleSchema), async (req, res) => {
  try {
    const payload = { ...req.body, householdId: res.locals.householdId };
    const [row] = await db
      .insert(categoryRulesTable)
      .values(payload)
      .onConflictDoUpdate({
        target: categoryRulesTable.id,
        set: {
          category: payload.category,
          hitCount: payload.hitCount ?? 1,
          source: payload.source ?? "learned",
          updatedAt: new Date(),
        },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create category rule");
    res.status(500).json({ error: "Failed to create category rule" });
  }
});

/** PUT /api/category-rules/:id — update a rule */
router.put("/category-rules/:id", validate(updateCategoryRuleSchema), async (req, res) => {
  try {
    const [row] = await db
      .update(categoryRulesTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(categoryRulesTable.id, String(req.params.id)),
          eq(categoryRulesTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update category rule");
    res.status(500).json({ error: "Failed to update category rule" });
  }
});

/** DELETE /api/category-rules/:id — delete a rule */
router.delete("/category-rules/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(categoryRulesTable)
      .where(
        and(
          eq(categoryRulesTable.id, String(req.params.id)),
          eq(categoryRulesTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Rule not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete category rule");
    res.status(500).json({ error: "Failed to delete category rule" });
  }
});

export default router;
