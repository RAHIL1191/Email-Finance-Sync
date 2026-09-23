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

/** POST /api/bills — create or upsert a new bill */
router.post("/bills", validate(insertBillSchema), async (req, res) => {
  try {
    const payload = {
      id: req.body.id,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId || req.body.deviceId || "unknown",
      title: req.body.title,
      amount: req.body.amount,
      dueDate: req.body.dueDate,
      category: req.body.category,
      isPaid: req.body.isPaid ?? false,
      isRecurring: req.body.isRecurring ?? false,
      frequency: req.body.frequency ?? null,
      accountId: req.body.accountId ?? null,
      lastNotifState: req.body.lastNotifState ?? null,
      notes: req.body.notes ?? null,
      remindDays: req.body.remindDays ?? null,
      autoPaid: req.body.autoPaid ?? false,
      billNumber: req.body.billNumber ?? null,
    };
    const [row] = await db
      .insert(billsTable)
      .values(payload)
      .onConflictDoUpdate({
        target: billsTable.id,
        set: { ...payload, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create bill");
    res.status(500).json({ error: "Failed to create bill" });
  }
});

/** POST /api/bills/batch — bulk upsert bills */
router.post("/bills/batch", async (req, res) => {
  try {
    const bills = Array.isArray(req.body) ? req.body : req.body?.bills;
    if (!Array.isArray(bills) || bills.length === 0) {
      res.json({ success: true, count: 0 });
      return;
    }
    const saved = [];
    for (const b of bills) {
      if (!b.id || !b.title || b.amount === undefined || !b.dueDate || !b.category) continue;
      const payload = {
        id: b.id,
        householdId: res.locals.householdId,
        deviceId: res.locals.deviceId || b.deviceId || "unknown",
        title: b.title,
        amount: Number(b.amount),
        dueDate: String(b.dueDate),
        category: String(b.category),
        isPaid: b.isPaid ?? false,
        isRecurring: b.isRecurring ?? false,
        frequency: b.frequency ?? null,
        accountId: b.accountId ?? null,
        lastNotifState: b.lastNotifState ?? null,
        notes: b.notes ?? null,
        remindDays: b.remindDays ?? null,
        autoPaid: b.autoPaid ?? false,
        billNumber: b.billNumber ?? null,
      };
      const [row] = await db
        .insert(billsTable)
        .values(payload)
        .onConflictDoUpdate({
          target: billsTable.id,
          set: { ...payload, updatedAt: new Date() },
        })
        .returning();
      saved.push(row);
    }
    res.json({ success: true, count: saved.length, bills: saved });
  } catch (err) {
    req.log.error({ err }, "Failed to batch save bills");
    res.status(500).json({ error: "Failed to batch save bills" });
  }
});

/** PUT /api/bills/:id — update a bill */
router.put("/bills/:id", validate(updateBillSchema), async (req, res) => {
  try {
    const updates: Record<string, unknown> = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.amount !== undefined) updates.amount = req.body.amount;
    if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate;
    if (req.body.category !== undefined) updates.category = req.body.category;
    if (req.body.isPaid !== undefined) updates.isPaid = req.body.isPaid;
    if (req.body.isRecurring !== undefined) updates.isRecurring = req.body.isRecurring;
    if (req.body.frequency !== undefined) updates.frequency = req.body.frequency;
    if (req.body.accountId !== undefined) updates.accountId = req.body.accountId;
    if (req.body.lastNotifState !== undefined) updates.lastNotifState = req.body.lastNotifState;
    if (req.body.notes !== undefined) updates.notes = req.body.notes;
    if (req.body.remindDays !== undefined) updates.remindDays = req.body.remindDays;
    if (req.body.autoPaid !== undefined) updates.autoPaid = req.body.autoPaid;
    if (req.body.billNumber !== undefined) updates.billNumber = req.body.billNumber;
    updates.updatedAt = new Date();

    const [row] = await db
      .update(billsTable)
      .set(updates as any)
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
