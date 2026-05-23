import { Router } from "express";
import { eq, and, desc, gte, lte, inArray } from "drizzle-orm";
import { db, transactionsTable, insertTransactionSchema, updateTransactionSchema, categoriesTable } from "@workspace/db";
import { validate, requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

router.use(requireHouseholdId);

function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function findClosestCategory(target: string, categories: Array<{ id: string; name: string; parentId: string | null }>): string {
  if (!target || categories.length === 0) return target || "Others";

  const cleanTarget = target.trim().toLowerCase();

  const subcats = categories.filter((c) => c.parentId !== null && c.parentId !== undefined);
  const parentCats = categories.filter((c) => c.parentId === null || c.parentId === undefined);

  // 1. Subcategory exact case-insensitive match
  const subExact = subcats.find((c) => c.name.trim().toLowerCase() === cleanTarget);
  if (subExact) return subExact.name;

  // 2. Subcategory substring/inclusion match
  const subSub = subcats.find((c) => {
    const name = c.name.trim().toLowerCase();
    return name.includes(cleanTarget) || cleanTarget.includes(name);
  });
  if (subSub) return subSub.name;

  // 3. Parent category exact case-insensitive match
  const parentExact = parentCats.find((c) => c.name.trim().toLowerCase() === cleanTarget);
  if (parentExact) return parentExact.name;

  // 4. Parent category substring/inclusion match
  const parentSub = parentCats.find((c) => {
    const name = c.name.trim().toLowerCase();
    return name.includes(cleanTarget) || cleanTarget.includes(name);
  });
  if (parentSub) return parentSub.name;

  // 5. Fuzzy distance in subcategories
  if (subcats.length > 0) {
    let closestSubName = subcats[0].name;
    let minSubDist = Infinity;
    for (const c of subcats) {
      const dist = getLevenshteinDistance(cleanTarget, c.name.trim().toLowerCase());
      if (dist < minSubDist) {
        minSubDist = dist;
        closestSubName = c.name.trim();
      }
    }
    // Accept fuzzy subcategory if it is relatively close (e.g. distance <= 4)
    if (minSubDist <= 4) {
      return closestSubName;
    }
  }

  // 6. Fuzzy distance in parent categories
  if (parentCats.length > 0) {
    let closestParentName = parentCats[0].name;
    let minParentDist = Infinity;
    for (const c of parentCats) {
      const dist = getLevenshteinDistance(cleanTarget, c.name.trim().toLowerCase());
      if (dist < minParentDist) {
        minParentDist = dist;
        closestParentName = c.name.trim();
      }
    }
    return closestParentName;
  }

  return target || "Others";
}

/** GET /api/transactions — list all transactions for this household */
router.get("/transactions", async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.householdId, res.locals.householdId))
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
    const householdId = res.locals.householdId;
    const categories = await db
      .select({ id: categoriesTable.id, name: categoriesTable.name, parentId: categoriesTable.parentId })
      .from(categoriesTable)
      .where(eq(categoriesTable.householdId, householdId));

    const mappedCategory = findClosestCategory(req.body.category || "Others", categories);

    const payload = {
      ...req.body,
      category: mappedCategory,
      householdId: res.locals.householdId,
      deviceId: res.locals.deviceId,
    };
    const [row] = await db.insert(transactionsTable).values(payload).returning();
    res.status(201).json(row);
  } catch (err) {
    req.log.error({ err }, "Failed to create transaction");
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

/** POST /api/transactions/bulk — upsert many transactions at once (used for email sync) */
router.post("/transactions/bulk", async (req, res) => {
  try {
    const { transactions } = req.body as { transactions: any[] };
    if (!Array.isArray(transactions) || transactions.length === 0) {
      res.status(400).json({ error: "transactions array is required" });
      return;
    }
    const householdId = res.locals.householdId;
    const categories = await db
      .select({ id: categoriesTable.id, name: categoriesTable.name, parentId: categoriesTable.parentId })
      .from(categoriesTable)
      .where(eq(categoriesTable.householdId, householdId));

    const now = new Date();
    const payload = transactions.map((t) => {
      // Strip client-supplied timestamp fields — Drizzle expects Date objects for
      // timestamp columns but the mobile client sends ISO strings, which causes
      // "value.toISOString is not a function". Let the DB defaults handle createdAt
      // and supply a fresh Date for updatedAt.
      const { createdAt: _c, updatedAt: _u, ...rest } = t as any;
      const mappedCategory = findClosestCategory(t.category || "Others", categories);
      return {
        ...rest,
        category: mappedCategory,
        householdId: res.locals.householdId,
        deviceId: res.locals.deviceId,
        updatedAt: now,
      };
    });
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
          accountId: transactionsTable.accountId,
          date: transactionsTable.date,
          source: transactionsTable.source,
          merchant: transactionsTable.merchant,
          plaidItemId: transactionsTable.plaidItemId,
          plaidAccountId: transactionsTable.plaidAccountId,
          bank: transactionsTable.bank,
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
          eq(transactionsTable.householdId, res.locals.householdId)
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

/** DELETE /api/transactions — delete all transactions for this household with optional filters */
router.delete("/transactions", async (req, res) => {
  try {
    const { type, startDate, endDate, accountIds } = req.query;
    const conds = [eq(transactionsTable.householdId, res.locals.householdId)];

    if (type) {
      conds.push(eq(transactionsTable.type, String(type)));
    }
    if (startDate) {
      conds.push(gte(transactionsTable.date, String(startDate)));
    }
    if (endDate) {
      // Append maximum timestamp bound so same-day transactions are correctly included
      const endString = String(endDate).includes("T") ? String(endDate) : `${endDate}T23:59:59.999Z`;
      conds.push(lte(transactionsTable.date, endString));
    }
    if (accountIds) {
      const ids = String(accountIds).split(",");
      if (ids.length > 0) {
        conds.push(inArray(transactionsTable.accountId, ids));
      }
    }

    const rows = await db
      .delete(transactionsTable)
      .where(and(...conds))
      .returning();
    res.json({ success: true, count: rows.length });
  } catch (err: any) {
    // If the table doesn't exist yet, treat as 0 deletions
    if (err?.cause?.code === "42P01" || /relation .* does not exist/.test(err?.message ?? "")) {
      res.json({ success: true, count: 0 });
      return;
    }
    req.log.error({ err }, "Failed to wipe transactions");
    res.status(500).json({ error: "Failed to wipe transactions" });
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
          eq(transactionsTable.householdId, res.locals.householdId)
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

