import { Router } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, budgetsTable, insertBudgetSchema, updateBudgetSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/budgets — list budgets; optional ?since=ISO for incremental pull */
router.get("/budgets", async (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    const rows = await db
      .select()
      .from(budgetsTable)
      .where(
        since
          ? and(
              eq(budgetsTable.householdId, res.locals.householdId),
              gte(budgetsTable.updatedAt, new Date(since))
            )
          : eq(budgetsTable.householdId, res.locals.householdId)
      );
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch budgets");
    res.status(500).json({ error: "Failed to fetch budgets" });
  }
});

/** POST /api/budgets — create or upsert a budget */
router.post("/budgets", validate(insertBudgetSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db
      .insert(budgetsTable)
      .values(payload)
      .onConflictDoUpdate({
        target: budgetsTable.id,
        set: { ...payload, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create budget");
    res.status(500).json({ error: "Failed to create budget" });
  }
});

/** PUT /api/budgets/:id — update a budget */
router.put("/budgets/:id", validate(updateBudgetSchema), async (req, res) => {
  try {
    const [row] = await db
      .update(budgetsTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(budgetsTable.id, String(req.params.id)),
          eq(budgetsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Budget not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update budget");
    res.status(500).json({ error: "Failed to update budget" });
  }
});

/** DELETE /api/budgets — delete ALL budgets for this household */
router.delete("/budgets", async (req, res) => {
  try {
    const rows = await db.delete(budgetsTable).where(eq(budgetsTable.householdId, res.locals.householdId)).returning();
    res.json({ success: true, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk-delete budgets");
    res.status(500).json({ error: "Failed to delete budgets" });
  }
});

/** DELETE /api/budgets/:id — delete a budget */
router.delete("/budgets/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(budgetsTable)
      .where(
        and(
          eq(budgetsTable.id, String(req.params.id)),
          eq(budgetsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Budget not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete budget");
    res.status(500).json({ error: "Failed to delete budget" });
  }
});

export default router;
