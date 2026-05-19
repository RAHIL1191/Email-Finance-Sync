import { Router } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, goalsTable, insertGoalSchema, updateGoalSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/goals — list goals; optional ?since=ISO for incremental pull */
router.get("/goals", async (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    const rows = await db
      .select()
      .from(goalsTable)
      .where(
        since
          ? and(
              eq(goalsTable.householdId, res.locals.householdId),
              gte(goalsTable.updatedAt, new Date(since))
            )
          : eq(goalsTable.householdId, res.locals.householdId)
      );
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch goals");
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});

/** POST /api/goals — create or upsert a goal */
router.post("/goals", validate(insertGoalSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db
      .insert(goalsTable)
      .values(payload)
      .onConflictDoUpdate({
        target: goalsTable.id,
        set: { ...payload, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create goal");
    res.status(500).json({ error: "Failed to create goal" });
  }
});

/** PUT /api/goals/:id — update a goal */
router.put("/goals/:id", validate(updateGoalSchema), async (req, res) => {
  try {
    const [row] = await db
      .update(goalsTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(goalsTable.id, String(req.params.id)),
          eq(goalsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update goal");
    res.status(500).json({ error: "Failed to update goal" });
  }
});

/** DELETE /api/goals/:id — delete a goal */
router.delete("/goals/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(goalsTable)
      .where(
        and(
          eq(goalsTable.id, String(req.params.id)),
          eq(goalsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete goal");
    res.status(500).json({ error: "Failed to delete goal" });
  }
});

export default router;
