import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, billsTable, insertBillSchema, updateBillSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/bills — list all bills for this household */
router.get("/bills", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(billsTable)
      .where(eq(billsTable.householdId, res.locals.householdId));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch bills");
    res.status(500).json({ error: "Failed to fetch bills" });
  }
});

/** POST /api/bills — create a new bill */
router.post("/bills", validate(insertBillSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db.insert(billsTable).values(payload).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create bill");
    res.status(500).json({ error: "Failed to create bill" });
  }
});

/** PUT /api/bills/:id — update a bill */
router.put("/bills/:id", validate(updateBillSchema), async (req, res) => {
  try {
    const [row] = await db
      .update(billsTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(billsTable.id, String(req.params.id)),
          eq(billsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Bill not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update bill");
    res.status(500).json({ error: "Failed to update bill" });
  }
});

/** POST /api/bills/:id/pay — mark a bill as paid */
router.post("/bills/:id/pay", async (req, res) => {
  try {
    const [row] = await db
      .update(billsTable)
      .set({ isPaid: true, updatedAt: new Date() })
      .where(
        and(
          eq(billsTable.id, String(req.params.id)),
          eq(billsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Bill not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to mark bill as paid");
    res.status(500).json({ error: "Failed to mark bill as paid" });
  }
});

/** DELETE /api/bills — delete ALL bills for this household */
router.delete("/bills", async (req, res) => {
  try {
    const rows = await db.delete(billsTable).where(eq(billsTable.householdId, res.locals.householdId)).returning();
    res.json({ success: true, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk-delete bills");
    res.status(500).json({ error: "Failed to delete bills" });
  }
});

/** DELETE /api/bills/:id — delete a bill */
router.delete("/bills/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(billsTable)
      .where(
        and(
          eq(billsTable.id, String(req.params.id)),
          eq(billsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Bill not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete bill");
    res.status(500).json({ error: "Failed to delete bill" });
  }
});

export default router;
