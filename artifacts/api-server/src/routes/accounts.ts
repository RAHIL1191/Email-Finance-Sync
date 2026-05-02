import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db, accountsTable, insertAccountSchema, updateAccountSchema } from "@workspace/db";
import { validate, requireDeviceId } from "../middlewares/validate.js";

const router = Router();

router.use(requireDeviceId);

/** GET /api/accounts — list all accounts for this device */
router.get("/accounts", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.deviceId, res.locals.deviceId));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch accounts");
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

/** POST /api/accounts — create a new account */
router.post("/accounts", validate(insertAccountSchema), async (req, res) => {
  try {
    const payload = { ...req.body, deviceId: res.locals.deviceId };
    const [row] = await db.insert(accountsTable).values(payload).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create account");
    res.status(500).json({ error: "Failed to create account" });
  }
});

/** PUT /api/accounts/:id — update an account */
router.put("/accounts/:id", validate(updateAccountSchema), async (req, res) => {
  try {
    const [row] = await db
      .update(accountsTable)
      .set({ ...(req.body as Record<string, unknown>), updatedAt: new Date() } as any)
      .where(
        and(
          eq(accountsTable.id, String(req.params.id)),
          eq(accountsTable.deviceId, res.locals.deviceId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to update account");
    res.status(500).json({ error: "Failed to update account" });
  }
});

/** DELETE /api/accounts/:id — delete an account */
router.delete("/accounts/:id", async (req, res) => {
  try {
    const [row] = await db
      .delete(accountsTable)
      .where(
        and(
          eq(accountsTable.id, String(req.params.id)),
          eq(accountsTable.deviceId, res.locals.deviceId)
        )
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete account");
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
