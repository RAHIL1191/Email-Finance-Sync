import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, accountsTable, insertAccountSchema, updateAccountSchema } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

/** POST /api/accounts/bulk-upsert — upsert multiple accounts in one request */
router.post("/accounts/bulk-upsert", async (req, res) => {
  try {
    const incoming: any[] = Array.isArray((req.body as any)?.accounts)
      ? (req.body as any).accounts
      : [];
    if (incoming.length === 0) { res.json({ upserted: 0 }); return; }

    const values = incoming
      .filter((a) => a.id && a.name && a.bank && a.type && a.color)
      .map((a) => ({
        id: String(a.id),
        householdId: res.locals.householdId,
        deviceId: res.locals.deviceId ?? "unknown",
        name: String(a.name),
        bank: String(a.bank),
        type: a.type as "checking" | "savings" | "credit" | "investment",
        color: String(a.color),
        balance: typeof a.balance === "number" ? a.balance : 0,
        lastFour: a.lastFour ?? null,
        plaidAccountId: a.plaidAccountId ?? null,
        plaidItemId: a.plaidItemId ?? null,
        accountHolder: a.accountHolder ?? null,
        isJoint: typeof a.isJoint === "boolean" ? a.isJoint : false,
        sharedPlaidAccounts: a.sharedPlaidAccounts ?? null,
      }));

    if (values.length === 0) { res.json({ upserted: 0 }); return; }

    await db
      .insert(accountsTable)
      .values(values)
      .onConflictDoUpdate({
        target: accountsTable.id,
        set: {
          name: sql`excluded.name`,
          bank: sql`excluded.bank`,
          type: sql`excluded.type`,
          color: sql`excluded.color`,
          balance: sql`excluded.balance`,
          lastFour: sql`excluded.last_four`,
          plaidAccountId: sql`excluded.plaid_account_id`,
          plaidItemId: sql`excluded.plaid_item_id`,
          isJoint: sql`excluded.is_joint`,
          sharedPlaidAccounts: sql`excluded.shared_plaid_accounts`,
          updatedAt: new Date(),
        },
      });

    res.json({ upserted: values.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk upsert accounts");
    res.status(500).json({ error: "Failed to bulk upsert accounts" });
  }
});

/** GET /api/accounts — list all accounts for this household */
router.get("/accounts", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.householdId, res.locals.householdId));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch accounts");
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

/** POST /api/accounts — create a new account */
router.post("/accounts", validate(insertAccountSchema), async (req, res) => {
  try {
    const payload = {
      ...req.body,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db.insert(accountsTable).values(payload).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create account");
    res.status(500).json({ error: "Failed to create account" });
  }
});

/** PUT /api/accounts/:id — update an account, or insert if missing (upsert) */
router.put("/accounts/:id", async (req, res) => {
  try {
    const id = String(req.params.id);
    const body = req.body as Record<string, unknown>;

    // Try update first
    const [row] = await db
      .update(accountsTable)
      .set({ ...body, updatedAt: new Date() } as any)
      .where(and(eq(accountsTable.id, id), eq(accountsTable.householdId, res.locals.householdId)))
      .returning();

    if (row) {
      res.json(row);
      return;
    }

    // Account missing (e.g. after DB wipe) — insert if client sent enough fields
    const { name, bank, type, color } = body as any;
    if (name && bank && type && color) {
      const [inserted] = await db
        .insert(accountsTable)
        .values({
          id,
          householdId: res.locals.householdId,
          deviceId: res.locals.deviceId ?? "unknown",
          name: String(name),
          bank: String(bank),
          type: type as "checking" | "savings" | "credit" | "investment",
          color: String(color),
          balance: typeof body.balance === "number" ? body.balance : 0,
          lastFour: body.lastFour ? String(body.lastFour) : null,
          plaidAccountId: body.plaidAccountId ? String(body.plaidAccountId) : null,
          plaidItemId: body.plaidItemId ? String(body.plaidItemId) : null,
          accountHolder: body.accountHolder ? String(body.accountHolder) : null,
          isJoint: typeof body.isJoint === "boolean" ? body.isJoint : false,
          sharedPlaidAccounts: (body.sharedPlaidAccounts as any) ?? null,
        })
        .returning();
      res.json(inserted);
      return;
    }

    res.status(404).json({ error: "Account not found" });
  } catch (err) {
    req.log.error({ err }, "Failed to update account");
    res.status(500).json({ error: "Failed to update account" });
  }
});

/** DELETE /api/accounts — delete ALL accounts for this household */
router.delete("/accounts", async (req, res) => {
  try {
    const rows = await db
      .delete(accountsTable)
      .where(eq(accountsTable.householdId, res.locals.householdId))
      .returning();
    res.json({ success: true, count: rows.length });
  } catch (err) {
    req.log.error({ err }, "Failed to bulk-delete accounts");
    res.status(500).json({ error: "Failed to delete accounts" });
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
          eq(accountsTable.householdId, res.locals.householdId)
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
