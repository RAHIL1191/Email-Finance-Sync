import { Router } from "express";
import { eq, and, gte } from "drizzle-orm";
import { db, investmentTransactionsTable, insertInvestmentTransactionSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** GET /api/investment-transactions — list; optional ?since=ISO for incremental pull */
router.get("/investment-transactions", async (req, res) => {
  try {
    const since = req.query.since as string | undefined;
    const rows = await db
      .select()
      .from(investmentTransactionsTable)
      .where(
        since
          ? and(
              eq(investmentTransactionsTable.householdId, res.locals.householdId),
              gte(investmentTransactionsTable.updatedAt, new Date(since))
            )
          : eq(investmentTransactionsTable.householdId, res.locals.householdId)
      );
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch investment transactions");
    res.status(500).json({ error: "Failed to fetch investment transactions" });
  }
});

/** POST /api/investment-transactions — create or upsert by plaid_tx_id */
router.post("/investment-transactions", validate(insertInvestmentTransactionSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db
      .insert(investmentTransactionsTable)
      .values(payload)
      .onConflictDoUpdate({
        target: investmentTransactionsTable.id,
        set: { ...payload, updatedAt: new Date() },
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to upsert investment transaction");
    res.status(500).json({ error: "Failed to upsert investment transaction" });
  }
});

/** DELETE /api/investment-transactions — delete ALL for this household */
router.delete("/investment-transactions", async (req, res) => {
  try {
    const rows = await db
      .delete(investmentTransactionsTable)
      .where(eq(investmentTransactionsTable.householdId, res.locals.householdId))
      .returning();
    res.json({ success: true, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk-delete investment transactions");
    res.status(500).json({ error: "Failed to delete investment transactions" });
  }
});

/** DELETE /api/investment-transactions/:id — delete a single record */
router.delete("/investment-transactions/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(investmentTransactionsTable)
      .where(
        and(
          eq(investmentTransactionsTable.id, String(req.params.id)),
          eq(investmentTransactionsTable.householdId, res.locals.householdId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Investment transaction not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete investment transaction");
    res.status(500).json({ error: "Failed to delete investment transaction" });
  }
});

export default router;
