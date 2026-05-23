import { Router } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, holdingsTable, insertHoldingSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/holdings — list holdings; optional ?since=ISO for incremental pull */
router.get("/holdings", async (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    const rows = await db
      .select()
      .from(holdingsTable)
      .where(
        since
          ? and(
              eq(holdingsTable.householdId, res.locals.householdId),
              gte(holdingsTable.updatedAt, new Date(since))
            )
          : eq(holdingsTable.householdId, res.locals.householdId)
      );
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch holdings");
    res.status(500).json({ error: "Failed to fetch holdings" });
  }
});

/** POST /api/holdings — create or upsert a holding */
router.post("/holdings", validate(insertHoldingSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db
      .insert(holdingsTable)
      .values(payload)
      .onConflictDoUpdate({
        target: holdingsTable.id,
        set: { ...payload, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to upsert holding");
    res.status(500).json({ error: "Failed to upsert holding" });
  }
});

/** DELETE /api/holdings — delete ALL holdings for this household */
router.delete("/holdings", async (req, res) => {
  try {
    const rows = await db.delete(holdingsTable).where(eq(holdingsTable.householdId, res.locals.householdId)).returning();
    res.json({ success: true, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk-delete holdings");
    res.status(500).json({ error: "Failed to delete holdings" });
  }
});

/** DELETE /api/holdings/:id — delete a single holding */
router.delete("/holdings/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(holdingsTable)
      .where(
        and(
          eq(holdingsTable.id, String(req.params.id)),
          eq(holdingsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Holding not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete holding");
    res.status(500).json({ error: "Failed to delete holding" });
  }
});

export default router;
