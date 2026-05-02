import { Router } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, transactionsTable, insertTransactionSchema, updateTransactionSchema } from "@workspace/db";
import { validate, requireDeviceId } from "../middlewares/validate.js";

const router = Router();

router.use(requireDeviceId);

/** GET /api/transactions — list all transactions for this device */
router.get("/transactions", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.deviceId, res.locals.deviceId))
      .orderBy(desc(transactionsTable.date));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch transactions");
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

/** POST /api/transactions — create a new transaction */
router.post("/transactions", validate(insertTransactionSchema), async (req, res) => {
  try {
    const payload = { ...req.body, deviceId: res.locals.deviceId };
    const [row] = await db.insert(transactionsTable).values(payload).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create transaction");
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

/** POST /api/transactions/bulk — upsert many transactions at once (used for sync) */
router.post("/transactions/bulk", async (req, res) => {
  try {
    const { transactions } = req.body as { transactions: any[] };
    if (!Array.isArray(transactions) || transactions.length === 0) {
      res.status(400).json({ error: "transactions array is required" });
      return;
    }
    const deviceId = res.locals.deviceId;
    const payload = transactions.map((t) => ({ ...t, deviceId }));
    const rows = await db
      .insert(transactionsTable)
      .values(payload)
      .onConflictDoUpdate({
        target: transactionsTable.id,
        set: {
          title: transactionsTable.title,
          amount: transactionsTable.amount,
          type: transactionsTable.type,
          category: transactionsTable.category,
          date: transactionsTable.date,
          note: transactionsTable.note,
          updatedAt: new Date(),
        },
      })
      .returning();
    res.status(201).json({ synced: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk sync transactions");
    res.status(500).json({ error: "Failed to bulk sync transactions" });
  }
});

/** PUT /api/transactions/:id — update a transaction */
router.put("/transactions/:id", validate(updateTransactionSchema), async (req, res) => {
  try {
    const [row] = await db
      .update(transactionsTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(transactionsTable.id, String(req.params.id)),
          eq(transactionsTable.deviceId, res.locals.deviceId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update transaction");
    res.status(500).json({ error: "Failed to update transaction" });
  }
});

/** DELETE /api/transactions/:id — delete a transaction */
router.delete("/transactions/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(transactionsTable)
      .where(
        and(
          eq(transactionsTable.id, String(req.params.id)),
          eq(transactionsTable.deviceId, res.locals.deviceId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete transaction");
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

export default router;
