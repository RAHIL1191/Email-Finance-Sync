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
  if (!target) return "Others";
  if (categories.length === 0) return target;

  const cleanTarget = target.trim().toLowerCase();

  // 1. Exact case-insensitive match across all categories
  const exact = categories.find((c) => c.name.trim().toLowerCase() === cleanTarget);
  if (exact) return exact.name;

  const subcats = categories.filter((c) => c.parentId !== null && c.parentId !== undefined);
  const parentCats = categories.filter((c) => c.parentId === null || c.parentId === undefined);

  // 2. Subcategory substring/inclusion match
  const subSub = subcats.find((c) => {
    const name = c.name.trim().toLowerCase();
    return name.includes(cleanTarget) || cleanTarget.includes(name);
  });
  if (subSub) return subSub.name;

  // 3. Parent category substring/inclusion match
  const parentSub = parentCats.find((c) => {
    const name = c.name.trim().toLowerCase();
    return name.includes(cleanTarget) || cleanTarget.includes(name);
  });
  if (parentSub) return parentSub.name;

  // 4. Fuzzy distance in subcategories (strict threshold)
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
    if (minSubDist <= 2) {
      return closestSubName;
    }
  }

  // 5. Fuzzy distance in parent categories (strict threshold)
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
    if (minParentDist <= 2) {
      return closestParentName;
    }
  }

  // Preserve the caller's target category if no close category was found in DB
  return target;
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

    const isCrossSourceTitleMatch = (titleA?: string, titleB?: string): boolean => {
      if (!titleA || !titleB) return true;
      const a = titleA.toLowerCase().trim();
      const b = titleB.toLowerCase().trim();
      if (!a || !b) return true;
      if (a.includes(b) || b.includes(a)) return true;
      const wordA = a.split(/[^a-zA-Z0-9]/)[0] || "";
      const wordB = b.split(/[^a-zA-Z0-9]/)[0] || "";
      if (wordA.length >= 3 && wordB.length >= 3 && wordA === wordB) return true;
      return false;
    };

    const dedupKey = (t: any): string => {
      const type = (t.type ?? "expense").toLowerCase();
      const accountId = t.accountId ?? "";
      const date = t.date ?? "";
      return `${type}|${accountId.toLowerCase()}|${Math.round((t.amount ?? 0) * 100)}|${date.slice(0, 10)}`;
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

    // Pass A: Strict exact ID, plaidTransactionId, and 1-to-1 cross-source deduplication based on priority score.
    const uniqueTxs: any[] = [];
    const byId = new Map<string, any>();
    const byPlaidTxId = new Map<string, any>();
    const acceptedByContentKey = new Map<string, any[]>();
    const matchedCrossSourceIds = new Set<string>();

    for (const t of allTxs) {
      if (t.id && byId.has(t.id)) {
        continue; // exact ID duplicate
      }
      if (t.plaidTransactionId && byPlaidTxId.has(t.plaidTransactionId)) {
        continue; // exact Plaid ID duplicate
      }

      // Check for content collision (same account, date, amount, matching title)
      const key = dedupKey(t);
      const candidates = acceptedByContentKey.get(key);
      if (candidates && candidates.length > 0) {
        const matchIndex = candidates.findIndex(
          (c) =>
            !matchedCrossSourceIds.has(c.id) &&
            (c.type || "expense") === (t.type || "expense") &&
            isCrossSourceTitleMatch(c.merchant || c.title, t.merchant || t.title)
        );

        if (matchIndex !== -1) {
          matchedCrossSourceIds.add(candidates[matchIndex].id);
          continue;
        }
      }

      uniqueTxs.push(t);
      if (t.id) byId.set(t.id, t);
      if (t.plaidTransactionId) byPlaidTxId.set(t.plaidTransactionId, t);
      if (!acceptedByContentKey.has(key)) {
        acceptedByContentKey.set(key, []);
      }
      acceptedByContentKey.get(key)!.push(t);
    }

    // Pass B: Fuzzy Pending-Posted & Settlement Collapsing across the combined list.
    // 1. Gather all pending transaction dates by ID so we can preserve them.
    const pendingDatesMap = new Map<string, string>();
    uniqueTxs.forEach((t) => {
      if (t.pending && t.date) {
        if (t.id) pendingDatesMap.set(t.id, t.date);
      }
    });

    // 2. Direct ID-based pending eviction: remove matching pending transactions when a posted
    // transaction references its pending transaction ID.
    const pendingTxIdsToEvict = new Set<string>();
    uniqueTxs.forEach((t) => {
      if (!t.pending && t.pendingTransactionId) {
        pendingTxIdsToEvict.add(t.pendingTransactionId);
      }
    });

    let remainingTxs = uniqueTxs;
    if (pendingTxIdsToEvict.size > 0) {
      remainingTxs = remainingTxs.filter((t) => {
        if (!t.pending) return true; // keep all posted
        const matchesId = t.id && pendingTxIdsToEvict.has(t.id);
        return !matchesId;
      });
    }

    // 3. Smart fuzzy settlement matching: a posted or newer transaction replaces an older pending or duplicate settlement transaction
    // within a +/- 3 days window, having exact same amount, account, matching type, and merchant/title match.
    const duplicatesToEvictFuzzy = new Set<string>();
    const candidatesForFuzzy = [...remainingTxs];

    for (let i = 0; i < candidatesForFuzzy.length; i++) {
      const primaryTx = candidatesForFuzzy[i];
      if (duplicatesToEvictFuzzy.has(primaryTx.id)) continue;

      for (let j = i + 1; j < candidatesForFuzzy.length; j++) {
        const otherTx = candidatesForFuzzy[j];
        if (duplicatesToEvictFuzzy.has(otherTx.id)) continue;

        // Never evict distinct Plaid transactions with different plaidTransactionIds
        if (primaryTx.plaidTransactionId && otherTx.plaidTransactionId && primaryTx.plaidTransactionId !== otherTx.plaidTransactionId) {
          continue;
        }

        // Fuzzy match should ONLY collapse pending into posted, not two distinct posted purchases!
        const hasPendingAndPosted = (primaryTx.pending && !otherTx.pending) || (!primaryTx.pending && otherTx.pending);
        if (!hasPendingAndPosted) {
          continue;
        }

        const isMatch = (
          primaryTx.accountId === otherTx.accountId &&
          (primaryTx.type || "expense") === (otherTx.type || "expense") &&
          Math.abs(primaryTx.amount - otherTx.amount) < 0.001 &&
          Math.abs(new Date(primaryTx.date).getTime() - new Date(otherTx.date).getTime()) / (1000 * 60 * 60 * 24) <= 3
        );

        if (isMatch) {
          const s1 = (primaryTx.merchant || primaryTx.title || "").toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
          const s2 = (otherTx.merchant || otherTx.title || "").toLowerCase().replace(/[^a-z0-9]/g, " ").trim();

          const isETransfer1 = s1.includes("e transfer") || s1.includes("etransfer");
          const isETransfer2 = s2.includes("e transfer") || s2.includes("etransfer");
          if (isETransfer1 && isETransfer2) {
            const name1 = s1.replace(/.*e\s*transfer\s*\d*\s*/, "").trim();
            const name2 = s2.replace(/.*e\s*transfer\s*\d*\s*/, "").trim();
            if (name1 && name2 && name1 !== name2 && !name1.includes(name2) && !name2.includes(name1)) {
              continue;
            }
          }

          const w1 = s1.split(/\s+/).filter((w: string) => w.length >= 3 && !["the","inc","ltd","llc","corp","preauthorized","debit","retail","purchase"].includes(w));
          const w2 = s2.split(/\s+/).filter((w: string) => w.length >= 3 && !["the","inc","ltd","llc","corp","preauthorized","debit","retail","purchase"].includes(w));
          const commonWords = w1.filter((w: string) => w2.includes(w));
          const isTitleMatch = s1 === s2 || (commonWords.length >= 1 && (s1.includes(s2) || s2.includes(s1) || commonWords[0].length >= 4));

          if (isTitleMatch) {
            // Evict the pending transaction in favor of the posted one
            const toEvict = primaryTx.pending ? primaryTx.id : otherTx.id;
            duplicatesToEvictFuzzy.add(toEvict);
            if (toEvict === primaryTx.id) break;
          }
        }
      }
    }

    if (duplicatesToEvictFuzzy.size > 0) {
      remainingTxs = remainingTxs.filter((t) => !duplicatesToEvictFuzzy.has(t.id));
    }

    // 4. Find which duplicate transactions exist in the database and need to be deleted
    const idsToDelete = new Set([...Array.from(pendingTxIdsToEvict), ...Array.from(duplicatesToEvictFuzzy)]);
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

    // 6. Insert or update transactions using protected sql excluded references
    // Never overwrite fields on transactions that have been user-edited or neutralized by bank removal
    const rows = await db
      .insert(transactionsTable)
      .values(finalPayload)
      .onConflictDoUpdate({
        target: transactionsTable.id,
        set: {
          title: sql`CASE WHEN ${transactionsTable.isUserEdited} THEN ${transactionsTable.title} ELSE excluded.title END`,
          amount: sql`CASE WHEN ${transactionsTable.isUserEdited} OR ${transactionsTable.title} LIKE '[Removed by Bank]%' THEN ${transactionsTable.amount} ELSE excluded.amount END`,
          type: sql`CASE WHEN ${transactionsTable.isUserEdited} THEN ${transactionsTable.type} ELSE excluded.type END`,
          category: sql`CASE WHEN ${transactionsTable.isUserEdited} THEN ${transactionsTable.category} ELSE excluded.category END`,
          merchant: sql`CASE WHEN ${transactionsTable.isUserEdited} THEN ${transactionsTable.merchant} ELSE excluded.merchant END`,
          note: sql`COALESCE(${transactionsTable.note}, excluded.note)`,
          accountId: sql`excluded.account_id`,
          date: sql`excluded.date`,
          source: sql`excluded.source`,
          plaidItemId: sql`excluded.plaid_item_id`,
          plaidAccountId: sql`excluded.plaid_account_id`,
          bank: sql`excluded.bank`,
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
    const updateBody = req.body as Partial<typeof transactionsTable.$inferInsert>;
    const [row] = await db
      .update(transactionsTable)
      .set({
        ...updateBody,
        isUserEdited: true,
        updatedAt: new Date(),
      })
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

