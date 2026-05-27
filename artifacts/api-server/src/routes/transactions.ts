import { Router } from "express";
import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { db, transactionsTable, insertTransactionSchema, updateTransactionSchema, categoriesTable, accountsTable } from "@workspace/db";
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

    // Fetch valid account IDs to filter out orphaned transactions
    const validAccounts = await db
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(eq(accountsTable.householdId, householdId));
    const validAccountIds = new Set(validAccounts.map((a) => a.id));

    const now = new Date();
    const payload = transactions
      .filter((t) => validAccountIds.has(t.accountId))
      .map((t) => {
        // Strip client-supplied timestamp fields — Drizzle expects Date objects for
        // timestamp columns but the mobile client sends ISO strings, which causes
        // "value.toISOString is not a function". Let the DB defaults handle createdAt
        // and supply a fresh Date for updatedAt.
        const { createdAt: _c, updatedAt: _u, ...rest } = t as any;
        const mappedCategory = findClosestCategory(t.category || "Others", categories);
        return {
          ...rest,
          category: mappedCategory,
          householdId: householdId,
          deviceId: res.locals.deviceId || t.deviceId || "",
          updatedAt: now,
        };
      });

    if (payload.length === 0) {
      res.status(201).json({ synced: 0 });
      return;
    }

    // Fetch existing transactions for this household to perform combined de-duplication
    const existing = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.householdId, householdId));

    const SOURCE_PRIORITY: Record<string, number> = { plaid: 3, manual: 2, email: 1 };

    const dedupKey = (t: any): string => {
      const accountId = t.accountId ?? "";
      const date = t.date ?? "";
      return `${accountId.toLowerCase()}|${Math.round((t.amount ?? 0) * 100)}|${date.slice(0, 10)}`;
    };

    // To avoid mutating inputs, clone both lists into a single merged array
    const allTxs = [
      ...existing.map((t) => ({ ...t })),
      ...payload.map((t) => ({ ...t })),
    ];

    // Score based on source priority and status: Plaid > Manual > Email, Posted > Pending
    const getPriorityScore = (t: any) => {
      const srcScore = SOURCE_PRIORITY[t.source ?? ""] ?? 0;
      const pendingScore = t.pending ? 0 : 1;
      return srcScore * 10 + pendingScore;
    };

    // Sort: higher priority transactions first
    allTxs.sort((a, b) => getPriorityScore(b) - getPriorityScore(a));

    // Pass A: Strict exact ID, plaidTransactionId, and content deduplication based on priority score.
    const uniqueTxs: any[] = [];
    const byId = new Map<string, any>();
    const byContent = new Map<string, any>();
    const byPlaidTxId = new Map<string, any>();

    for (const t of allTxs) {
      const key = dedupKey(t);
      const existingById = t.id ? byId.get(t.id) : null;
      const existingByContent = byContent.get(key);
      const existingByPlaidTxId = t.plaidTransactionId ? byPlaidTxId.get(t.plaidTransactionId) : null;

      if (existingById || existingByContent || existingByPlaidTxId) {
        // Skip exact duplicate
        continue;
      }

      uniqueTxs.push(t);
      if (t.id) byId.set(t.id, t);
      byContent.set(key, t);
      if (t.plaidTransactionId) byPlaidTxId.set(t.plaidTransactionId, t);
    }

    // Pass B: Fuzzy Pending-Posted Collapsing across the combined list.
    // 1. Gather all pending transaction dates by ID and Plaid ID so we can preserve them.
    const pendingDatesMap = new Map<string, string>();
    uniqueTxs.forEach((t) => {
      if (t.pending && t.date) {
        if (t.id) pendingDatesMap.set(t.id, t.date);
        if (t.plaidTransactionId) pendingDatesMap.set(t.plaidTransactionId, t.date);
      }
    });

    // 2. Direct ID-based pending eviction: remove matching pending transactions when a posted
    // transaction references its pending transaction ID.
    const pendingTxIdsToEvict = new Set<string>();
    uniqueTxs.forEach((t) => {
      if (!t.pending && t.pendingTransactionId) {
        pendingTxIdsToEvict.add(t.pendingTransactionId);
        // Transfer the original authorization date if available
        const origDate = pendingDatesMap.get(t.pendingTransactionId);
        if (origDate) {
          t.date = origDate;
        }
      }
    });

    let remainingTxs = uniqueTxs;
    if (pendingTxIdsToEvict.size > 0) {
      remainingTxs = remainingTxs.filter((t) => {
        if (!t.pending) return true; // keep all posted
        const matchesId = t.id && pendingTxIdsToEvict.has(t.id);
        const matchesPlaidId = t.plaidTransactionId && pendingTxIdsToEvict.has(t.plaidTransactionId);
        return !matchesId && !matchesPlaidId;
      });
    }

    // 3. Smart fuzzy matching: a posted transaction replaces an older pending transaction
    // within a +/- 3 days window, having exact same amount, account, and fuzzy title match.
    const postedTxs = remainingTxs.filter((t) => !t.pending);
    const pendingTxsToEvictFuzzy = new Set<string>();

    postedTxs.forEach((postedTx) => {
      remainingTxs.forEach((pendingTx) => {
        if (!pendingTx.pending) return;
        if (pendingTxsToEvictFuzzy.has(pendingTx.id)) return; // already marked for eviction

        const isReplaced = (
          pendingTx.accountId === postedTx.accountId &&
          Math.abs(pendingTx.amount - postedTx.amount) < 0.001 &&
          Math.abs(new Date(pendingTx.date).getTime() - new Date(postedTx.date).getTime()) / (1000 * 60 * 60 * 24) <= 3
        );

        if (isReplaced) {
          const oldTitle = (pendingTx.merchant || pendingTx.title || "").toLowerCase().trim();
          const newTitle = (postedTx.merchant || postedTx.title || "").toLowerCase().trim();
          const firstWord = (str: string) => str.split(/[^a-zA-Z0-9]/)[0] || "";

          const isTitleMatch =
            oldTitle.includes(newTitle) ||
            newTitle.includes(oldTitle) ||
            (firstWord(oldTitle).length >= 4 && firstWord(oldTitle) === firstWord(newTitle));

          if (isTitleMatch) {
            postedTx.date = pendingTx.date; // copy original pending date to posted transaction
            pendingTxsToEvictFuzzy.add(pendingTx.id); // evict old pending transaction
          }
        }
      });
    });

    if (pendingTxsToEvictFuzzy.size > 0) {
      remainingTxs = remainingTxs.filter((t) => !pendingTxsToEvictFuzzy.has(t.id));
    }

    // 4. Find which pending transactions exist in the database and need to be deleted
    const idsToDelete = new Set([...pendingTxIdsToEvict, ...pendingTxsToEvictFuzzy]);
    const existingIds = new Set(existing.map((e) => e.id));
    const dbPendingIdsToDelete = Array.from(idsToDelete).filter((id) => existingIds.has(id));

    if (dbPendingIdsToDelete.length > 0) {
      await db
        .delete(transactionsTable)
        .where(
          and(
            eq(transactionsTable.householdId, householdId),
            inArray(transactionsTable.id, dbPendingIdsToDelete)
          )
        );
    }

    // 5. Clean and prepare final payload for database upsert
    // Keep only the incoming transactions that were NOT evicted and are unique
    const finalUniquePayloadIds = new Set(remainingTxs.map((u) => u.id));
    const finalPayload = payload
      .filter((t) => finalUniquePayloadIds.has(t.id) && !idsToDelete.has(t.id))
      .map((t) => {
        // Find the winning transaction in remainingTxs to get its potentially updated date
        const winner = remainingTxs.find((w) => w.id === t.id);
        return {
          ...t,
          date: winner ? winner.date : t.date,
        };
      });

    if (finalPayload.length === 0) {
      res.status(201).json({ synced: 0 });
      return;
    }

    // 6. Delete any existing DB rows whose plaidTransactionId matches an incoming tx
    //    but has a different id (handles id divergence from migration scripts, etc.)
    const incomingPlaidTxIds = finalPayload
      .map((t: any) => t.plaidTransactionId)
      .filter((id: any): id is string => !!id);
    if (incomingPlaidTxIds.length > 0) {
      const existingByPlaid = existing.filter(
        (e) => e.plaidTransactionId && incomingPlaidTxIds.includes(e.plaidTransactionId)
      );
      const conflictIds = existingByPlaid
        .filter((e) => !finalPayload.some((p: any) => p.id === e.id))
        .map((e) => e.id);
      if (conflictIds.length > 0) {
        await db
          .delete(transactionsTable)
          .where(
            and(
              eq(transactionsTable.householdId, householdId),
              inArray(transactionsTable.id, conflictIds)
            )
          );
      }
    }

    // 7. Insert or update transactions using correct sql excluded references
    const rows = await db
      .insert(transactionsTable)
      .values(finalPayload)
      .onConflictDoUpdate({
        target: transactionsTable.id,
        set: {
          title: sql`excluded.title`,
          amount: sql`excluded.amount`,
          type: sql`excluded.type`,
          category: sql`excluded.category`,
          accountId: sql`excluded.account_id`,
          date: sql`excluded.date`,
          source: sql`excluded.source`,
          merchant: sql`excluded.merchant`,
          plaidItemId: sql`excluded.plaid_item_id`,
          plaidAccountId: sql`excluded.plaid_account_id`,
          plaidTransactionId: sql`excluded.plaid_transaction_id`,
          bank: sql`excluded.bank`,
          note: sql`excluded.note`,
          pending: sql`excluded.pending`,
          pendingTransactionId: sql`excluded.pending_transaction_id`,
          updatedAt: sql`excluded.updated_at`,
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

