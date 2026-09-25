import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
  type Transaction as PlaidTransaction,
} from "plaid";
import { eq, and, sql, inArray } from "drizzle-orm";
import {
  db as defaultDb,
  plaidItemsTable,
  accountsTable,
  transactionsTable,
  categoryRulesTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";

// ── Plaid Client Factory ───────────────────────────────────────────────────────

export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = (process.env.PLAID_ENV ?? "sandbox") as keyof typeof PlaidEnvironments;

  if (!clientId || !secret) {
    throw new Error("NOT_CONFIGURED");
  }

  const config = new Configuration({
    basePath: PlaidEnvironments[env] ?? PlaidEnvironments.sandbox,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  return new PlaidApi(config);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function mapAccountType(
  type: string,
  subtype: string | null
): "checking" | "savings" | "credit" | "investment" {
  if (type === "credit" || type === "loan") return "credit";
  if (type === "investment" || type === "brokerage") return "investment";
  if (subtype === "savings" || subtype === "money market" || subtype === "cd") return "savings";
  return "checking";
}

const LOWERCASE_PREP = new Set(["from", "to", "and", "or", "of", "in", "at", "by", "for", "the", "a", "an"]);
export function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\b\w+/g, (w, offset) => {
      const lower = w.toLowerCase();
      if (offset > 0 && LOWERCASE_PREP.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
}

export function cleanPlaidName(merchantName: string | null | undefined, rawName: string | null | undefined): string {
  const raw = (rawName ?? "").trim();
  const merchant = (merchantName ?? "").trim();

  // Strip BMO / Canadian-bank bracket prefix codes e.g. [CW], [TF], [IN], [SC]
  let s = raw.replace(/^\[[A-Z]{2,3}\]\s*/i, "");

  // Empty after stripping → interest charge
  if (!s) return "Interest";

  // Interac e-Transfer received
  const interacIn = s.match(/^VIR\s+INTERAC\s+REC[UÇ]?\s+([A-Z][A-Z\s]+?)(?:\s+\d{10,})?$/i);
  if (interacIn) return `Interac from ${toTitleCase(interacIn[1])}`;

  // Interac e-Transfer sent
  const interacOut = s.match(/^VIR\s+INTERAC\s+ENV[OO]Y[EÉ]?\s+([A-Z][A-Z\s]+?)(?:\s+\d{10,})?$/i);
  if (interacOut) return `Interac to ${toTitleCase(interacOut[1])}`;

  // Wire / internal transfer (TF XXXX#ref)
  if (/^TF[\s#]/i.test(s) || /^VIREMENT/i.test(s)) {
    const clean = s
      .replace(/^TF\s*/i, "")
      .replace(/\s*#[\d\-]+/g, "")
      .replace(/\b\d+\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return clean.length >= 3 ? toTitleCase(clean) : "Wire Transfer";
  }

  // Mortgage
  if (/MTG|HYP/i.test(s)) return "Mortgage Payment";

  // Strip trailing transaction IDs and reference codes
  s = s.replace(/\s+\d{10,}$/, "").replace(/\s+#[\d\-]+$/, "").replace(/\s+\d{4}$/, "").trim();

  // French service charge refund
  if (/remboursement des frais/i.test(s)) return "Service Fee Refund";
  if (/programme performance/i.test(s)) return "Programmes & Fees";

  if (s.length <= 10 && /^[A-Z]+$/.test(s) && merchant && merchant.length > s.length) {
    s = merchant;
  }

  let candidate = (merchant && merchant.length >= 3) ? merchant : (s.length >= 3 ? s : (merchant || raw));

  // Strip payment processor prefixes
  candidate = candidate.replace(/^(SQ\s*\*|SQR\*|TST\*|SP\s*\*|PAYPAL\s*\*|PP\*|PYPL\s*\*|APL\*|AMZN\*|AMZ\*|GOOGLE\s*\*|VENMO\s*\*|STRIPE\s*\*|KLARNA\s*\*)\s*/i, "");

  // Strip phone numbers & URLs
  candidate = candidate.replace(/\b1?[-.\s]?(8\d{2}|\d{3})[-.\s]\d{3}[-.\s]\d{4}\b/g, " ");
  candidate = candidate.replace(/\b([a-zA-Z0-9-]+\.)+(com|ca|org|net|io|co)(\/[^\s]*)?/gi, " ");

  // Strip store tags, codes and symbols
  candidate = candidate.replace(/#\s*[\w\d-]+/g, " ");
  candidate = candidate.replace(/\b(store|loc|st|branch|terminal|term|pos|auth|ref|trans|id)\s*#?\s*\d+\b/gi, " ");
  candidate = candidate.replace(/[*_~^+\\/|&@$%=;]/g, " ");

  // Extract pure words (no numbers) and clamp to at most 3 words
  const words: string[] = [];
  for (const rawToken of candidate.split(/\s+/)) {
    const token = rawToken.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, "");
    if (!token || /\d/.test(token)) continue;
    if (token.length === 1 && token.toLowerCase() !== "a") continue;
    words.push(token.charAt(0).toUpperCase() + token.slice(1).toLowerCase());
    if (words.length === 3) break;
  }

  return words.length > 0 ? words.join(" ") : (toTitleCase(merchant || raw) || "Transaction");
}

export function mapPlaidCategory(primary?: string | null, detailed?: string | null): string {
  const p = (primary ?? "").toUpperCase();
  const d = (detailed ?? "").toUpperCase();
  switch (p) {
    case "FOOD_AND_DRINK":
      if (d.includes("GROCERIES") || d.includes("SUPERMARKETS")) return "Food & Grocery";
      return "Drink & Dine";
    case "GENERAL_MERCHANDISE":
      return "Shopping";
    case "TRANSPORTATION":
      return "Transport";
    case "TRAVEL":
      return "Travel & Vacation";
    case "ENTERTAINMENT":
      return "Entertainment";
    case "PERSONAL_CARE":
      return "Personal Care";
    case "MEDICAL":
      return "Health & Fitness";
    case "RENT_AND_UTILITIES":
      return "Bills & Utilities";
    case "HOME_IMPROVEMENT":
      return "House";
    case "INCOME":
      if (d.includes("WAGES") || d.includes("PAYROLL") || d.includes("SALARY")) return "Salary";
      return "Business";
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
      return "Transfer";
    case "LOAN_PAYMENTS":
      return "Loan & Debts";
    case "BANK_FEES":
      return "Fees & Charges";
    case "GOVERNMENT_AND_NON_PROFIT":
    case "GENERAL_SERVICES":
      return "Others";
    default:
      return "Others";
  }
}

export function buildSecMap(securities: any[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const s of securities || []) m.set(s.security_id, s);
  return m;
}

export function mapHolding(h: any, secMap: Map<string, any>) {
  const sec = secMap.get(h.security_id);
  const qty = (h.quantity ?? 0) as number;
  const instValue = h.institution_value as number | null;
  const instPrice = h.institution_price as number | null;
  const closePrice = sec?.close_price as number | null;
  let value = 0;
  if (instValue != null && instValue > 0) {
    value = instValue;
  } else if (instPrice != null && instPrice > 0 && qty > 0) {
    value = qty * instPrice;
  } else if (closePrice != null && closePrice > 0 && qty > 0) {
    value = qty * closePrice;
  }
  return {
    plaidAccountId: h.account_id as string,
    ticker: (sec?.ticker_symbol as string | null) ?? null,
    name: (sec?.name ?? "Unknown") as string,
    securityType: (sec?.type ?? "other") as string,
    quantity: qty,
    value,
    costBasis: (h.cost_basis ?? null) as number | null,
    currency: (h.iso_currency_code ?? h.unofficial_currency_code ?? "CAD") as string,
    asOf: (h.institution_price_as_of ?? sec?.close_price_as_of ?? null) as string | null,
  };
}

export function mapInvestmentTransaction(t: any, secMap: Map<string, any>) {
  const sec = secMap.get(t.security_id);
  return {
    plaidTxId: t.investment_transaction_id as string,
    plaidAccountId: t.account_id as string,
    date: t.date as string,
    name: (sec?.name ?? t.name ?? "Unknown") as string,
    ticker: (sec?.ticker_symbol ?? null) as string | null,
    type: (t.type ?? "other") as string,
    subtype: (t.subtype ?? null) as string | null,
    quantity: (t.quantity ?? null) as number | null,
    amount: Math.abs(t.amount ?? 0) as number,
    fees: (t.fees ?? null) as number | null,
    currency: (t.iso_currency_code ?? t.unofficial_currency_code ?? "CAD") as string,
  };
}

export function mapPlaidTransactionToOutput(t: any, bankName: string) {
  const amount = typeof t.amount === "number" ? t.amount : 0;
  const primary: string =
    t.personal_finance_category?.primary ??
    (Array.isArray(t.category) ? t.category[0] : null) ??
    "OTHER";
  const detailed: string | undefined = t.personal_finance_category?.detailed;
  const merchant: string = t.merchant_name ?? "";
  const title = cleanPlaidName(merchant, t.name);

  return {
    plaidTransactionId: t.transaction_id as string,
    pending: !!t.pending,
    pendingTransactionId: (t.pending_transaction_id as string | null) ?? null,
    title,
    merchant: merchant || title,
    amount: Math.abs(amount),
    type: amount > 0 ? ("expense" as const) : ("income" as const),
    category: mapPlaidCategory(primary, detailed),
    date: (t.authorized_date ?? t.date ?? new Date().toISOString().slice(0, 10)) as string,
    accountId: t.account_id as string,
    plaidAccountId: t.account_id as string,
    bank: bankName,
  };
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SyncPlaidItemOptions {
  itemId: string;
  householdId: string;
  force?: boolean;
  backfill?: boolean;
  plaidClient?: PlaidApi;
  dbClient?: any;
  logger?: any;
  chunkSize?: number;
}

export interface SyncPlaidItemResult {
  success: boolean;
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  transactions: any[];
  count: number;
  removedIds: string[];
  holdings: any[];
  investmentTransactions: any[];
  plaidAccounts: any[];
  cursor?: string | null;
  error?: string;
  status?: string;
}

// ── Plaid Sync Engine ──────────────────────────────────────────────────────────

export async function syncPlaidItem(options: SyncPlaidItemOptions): Promise<SyncPlaidItemResult> {
  const {
    itemId,
    householdId,
    force = false,
    backfill = false,
    chunkSize = 200,
  } = options;

  const db = options.dbClient ?? defaultDb;
  const log = options.logger ?? logger;
  const client = options.plaidClient ?? getPlaidClient();

  // 1. Cross-process / cross-instance lock using PostgreSQL advisory lock
  let lockAcquired = false;
  if (db && typeof db.execute === "function") {
    try {
      const lockRes = await db.execute(
        sql`SELECT pg_try_advisory_lock(hashtext('plaid_sync_' || ${itemId})) AS locked`
      );
      const rows = lockRes?.rows || lockRes;
      lockAcquired = !!(rows?.[0]?.locked ?? true);
      if (!lockAcquired) {
        log.warn({ itemId, householdId }, "Plaid sync already in progress for this item (advisory lock busy)");
        return {
          success: false,
          status: "locked",
          error: "SYNC_ALREADY_IN_PROGRESS",
          addedCount: 0,
          modifiedCount: 0,
          removedCount: 0,
          transactions: [],
          count: 0,
          removedIds: [],
          holdings: [],
          investmentTransactions: [],
          plaidAccounts: [],
        };
      }
    } catch (lockErr) {
      log.warn({ lockErr }, "Postgres advisory lock check skipped (non-pg or mock db)");
    }
  }

  try {
    // 2. Fetch Plaid item record
    const [record] = await db
      .select()
      .from(plaidItemsTable)
      .where(and(eq(plaidItemsTable.id, itemId), eq(plaidItemsTable.householdId, householdId)));

    if (!record) {
      throw new Error("PLAID_ITEM_NOT_FOUND");
    }

    // 3. Fetch accounts from Plaid
    const accountsRes = await client.accountsGet({ access_token: record.accessToken });
    const plaidAccounts = accountsRes.data.accounts || [];

    // 4. Fetch accounts in household from DB to map and check joint/secondary accounts
    const dbAccts = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.householdId, householdId));

    // Identify investment account IDs (filter out standard transactions for them)
    const investmentAccountIds = new Set(
      plaidAccounts
        .filter((a) => mapAccountType(a.type as string, a.subtype as string | null) === "investment")
        .map((a) => a.account_id)
    );

    // Identify secondary shared/joint account IDs (only primary item imports transactions)
    const secondarySharedAccountIds = new Set<string>();
    for (const acc of dbAccts) {
      if (acc.sharedPlaidAccounts && Array.isArray(acc.sharedPlaidAccounts)) {
        for (const spa of acc.sharedPlaidAccounts) {
          if (spa.plaidItemId === itemId && spa.isPrimary === false) {
            secondarySharedAccountIds.add(spa.plaidAccountId);
          }
        }
      }
    }

    // 5. Update / Self-heal accounts in DB
    const plaidAccToLocalIdMap: Record<string, string> = {};
    for (const pa of plaidAccounts) {
      const match = dbAccts.find(
        (a: any) =>
          a.plaidAccountId === pa.account_id ||
          (a.lastFour === (pa.mask ?? "") && !a.plaidItemId) ||
          (a.sharedPlaidAccounts && a.sharedPlaidAccounts.some((s: any) => s.plaidAccountId === pa.account_id))
      );
      const balance = pa.balances.current ?? pa.balances.available ?? 0;
      if (match) {
        plaidAccToLocalIdMap[pa.account_id] = match.id;
        const updates: any = { balance, updatedAt: new Date() };
        if (!match.isJoint && (!match.plaidItemId || !match.plaidAccountId)) {
          updates.plaidItemId = itemId;
          updates.plaidAccountId = pa.account_id;
        }
        await db.update(accountsTable).set(updates).where(eq(accountsTable.id, match.id));
      } else {
        const type = mapAccountType(pa.type as string, pa.subtype as string | null);
        const newAccId = `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        plaidAccToLocalIdMap[pa.account_id] = newAccId;
        await db.insert(accountsTable).values({
          id: newAccId,
          householdId,
          deviceId: "backend",
          name: pa.name ?? pa.official_name ?? "Account",
          bank: record.bankName,
          type,
          color: record.bankColor || "#6366f1",
          balance,
          lastFour: pa.mask ?? null,
          plaidAccountId: pa.account_id,
          plaidItemId: itemId,
          isJoint: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // 6. Pagination loop with TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION handling
    const initialCursor = force ? undefined : (record.cursor ?? undefined);
    let nextCursor = initialCursor;
    let rawAdded: PlaidTransaction[] = [];
    let rawModified: PlaidTransaction[] = [];
    let rawRemoved: { transaction_id: string }[] = [];

    const MAX_MUTATION_RETRIES = 3;
    let mutationAttempts = 0;
    let paginationSuccess = false;

    while (mutationAttempts < MAX_MUTATION_RETRIES && !paginationSuccess) {
      try {
        let cursor = initialCursor;
        let hasMore = true;
        const pageAdded: PlaidTransaction[] = [];
        const pageModified: PlaidTransaction[] = [];
        const pageRemoved: { transaction_id: string }[] = [];

        while (hasMore) {
          const syncRes = await client.transactionsSync({
            access_token: record.accessToken,
            cursor,
            options: {
              include_personal_finance_category: true,
              ...(cursor ? {} : { days_requested: 730 }),
            },
          });

          pageAdded.push(...(syncRes.data.added || []));
          pageModified.push(...(syncRes.data.modified || []));
          pageRemoved.push(...(syncRes.data.removed || []));

          cursor = syncRes.data.next_cursor;
          hasMore = syncRes.data.has_more;
        }

        // Entire pagination loop completed cleanly
        rawAdded = pageAdded;
        rawModified = pageModified;
        rawRemoved = pageRemoved;
        nextCursor = cursor;
        paginationSuccess = true;
      } catch (syncErr: any) {
        const errCode = syncErr?.response?.data?.error_code || syncErr?.error_code;
        if (errCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
          mutationAttempts++;
          log.warn(
            { itemId, attempt: mutationAttempts, max: MAX_MUTATION_RETRIES },
            "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION encountered. Restarting pagination from initial cursor."
          );
          if (mutationAttempts >= MAX_MUTATION_RETRIES) {
            throw new Error(`MUTATION_DURING_PAGINATION_LIMIT_EXCEEDED: ${syncErr.message}`);
          }
          continue;
        }
        throw syncErr;
      }
    }

    // 7. Optional / Controlled transactionsGet fallback for institutions with async link delay
    // ONLY executed if backfill is explicitly requested OR on initial link when sync returned 0 transactions
    const removedIdSet = new Set(rawRemoved.map((r) => r.transaction_id));
    if (backfill || (rawAdded.length === 0 && rawModified.length === 0 && !initialCursor)) {
      try {
        const daysBack = backfill ? 730 : 90;
        const startDate = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
        const endDate = new Date().toISOString().slice(0, 10);
        const txMap = new Map<string, any>();
        rawAdded.forEach((t) => txMap.set(t.transaction_id, t));

        let offset = 0;
        const pageSize = 500;
        let total = Infinity;
        while (offset < total) {
          const txRes = await client.transactionsGet({
            access_token: record.accessToken,
            start_date: startDate,
            end_date: endDate,
            options: { count: pageSize, offset },
          });
          const page = txRes.data.transactions ?? [];
          total = txRes.data.total_transactions ?? page.length;
          for (const t of page) {
            // NEVER resurrect a transaction that was marked as removed
            if (!removedIdSet.has(t.transaction_id)) {
              txMap.set(t.transaction_id, t);
            }
          }
          offset += page.length;
          if (!backfill || page.length === 0) break;
        }
        rawAdded = Array.from(txMap.values());
      } catch (getErr: any) {
        log.warn({ getErr: getErr?.message }, "transactionsGet backfill skipped/failed");
      }
    }

    // 8. Filter out investment accounts and secondary shared accounts
    const validAdded = rawAdded.filter(
      (t) => !investmentAccountIds.has(t.account_id) && !secondarySharedAccountIds.has(t.account_id)
    );
    const validModified = rawModified.filter(
      (t) => !investmentAccountIds.has(t.account_id) && !secondarySharedAccountIds.has(t.account_id)
    );
    const validRemoved = rawRemoved;

    // 9. Load user category rules for household
    const userRules = await db
      .select()
      .from(categoryRulesTable)
      .where(eq(categoryRulesTable.householdId, householdId));

    const applyRuleCategory = (title: string, defaultCategory: string): string => {
      const needle = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
      if (!needle || userRules.length === 0) return defaultCategory;
      const exact = userRules.find((r: any) => r.merchantPattern === needle);
      if (exact) return exact.category;
      const partial = userRules
        .filter((r: any) => r.merchantPattern && (needle.includes(r.merchantPattern) || r.merchantPattern.includes(needle)))
        .sort((a: any, b: any) => (b.hitCount ?? 0) - (a.hitCount ?? 0))[0];
      return partial?.category ?? defaultCategory;
    };

    // 10. Durable Ingestion Execution (Apply Removed, Modified, Added)
    // Gather all existing transactions for this household to match and protect user edits
    const existingTxs = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.householdId, householdId));

    const existingByPlaidTxId = new Map<string, any>();
    const existingByPendingTxId = new Map<string, any>();
    const existingSplitsByPlaidId = new Set<string>();

    for (const et of existingTxs) {
      if (et.plaidTransactionId) {
        existingByPlaidTxId.set(et.plaidTransactionId, et);
      }
      if (et.pendingTransactionId) {
        existingByPendingTxId.set(et.pendingTransactionId, et);
      }
      if (et.splitGroupId && et.plaidTransactionId) {
        existingSplitsByPlaidId.add(et.plaidTransactionId);
      }
      if (et.id && et.id.includes("_split_") && et.plaidTransactionId) {
        existingSplitsByPlaidId.add(et.plaidTransactionId);
      }
    }

    const removedIdsToDelete: string[] = [];
    const actuallyRemovedPlaidIds: string[] = [];

    // A. Process Removals
    for (const r of validRemoved) {
      actuallyRemovedPlaidIds.push(r.transaction_id);
      const existing = existingByPlaidTxId.get(r.transaction_id) || existingByPendingTxId.get(r.transaction_id);
      if (existing) {
        // Protect user-edited, user-annotated, or user-split transactions from hard deletion
        if (existing.isUserEdited || existing.splitGroupId || (existing.note && existing.note.trim().length > 0)) {
          log.info({ id: existing.id, plaidId: r.transaction_id }, "Preserving user-edited/annotated transaction on Plaid removal");
        } else {
          removedIdsToDelete.push(existing.id);
        }
      }
    }

    // B. Process Modifications
    const updatesToApply: Array<{ id: string; values: any }> = [];
    const addedFromModified: PlaidTransaction[] = [];

    for (const m of validModified) {
      const existing = existingByPlaidTxId.get(m.transaction_id) || existingByPendingTxId.get(m.transaction_id);
      if (existing) {
        const primaryCat = m.personal_finance_category?.primary ?? (Array.isArray(m.category) ? m.category[0] : null);
        const detailedCat = m.personal_finance_category?.detailed;
        const defaultCat = mapPlaidCategory(primaryCat, detailedCat);
        const cleanTitle = cleanPlaidName(m.merchant_name, m.name);
        const localAccountId = plaidAccToLocalIdMap[m.account_id] || existing.accountId;

        const updatePayload: any = {
          amount: Math.abs(m.amount ?? existing.amount),
          pending: !!m.pending,
          pendingTransactionId: m.pending_transaction_id ?? existing.pendingTransactionId,
          date: m.authorized_date ?? m.date ?? existing.date,
          accountId: localAccountId,
          plaidAccountId: m.account_id,
          updatedAt: new Date(),
        };

        // If user has NOT customized this transaction, refresh title and category
        if (!existing.isUserEdited && (!existing.note || existing.note.trim().length === 0)) {
          updatePayload.title = cleanTitle;
          updatePayload.merchant = m.merchant_name || cleanTitle;
          updatePayload.category = applyRuleCategory(cleanTitle, defaultCat);
        }

        updatesToApply.push({ id: existing.id, values: updatePayload });
      } else {
        // Plaid sent a modified transaction not yet present in DB: treat as added
        addedFromModified.push(m);
      }
    }

    // C. Process Additions
    const combinedAdded = [...validAdded, ...addedFromModified];
    const insertsToApply: any[] = [];
    const pendingToResolveUpdates: Array<{ id: string; values: any }> = [];

    for (const a of combinedAdded) {
      // 1. Check if already exists in DB by plaidTransactionId (replay / idempotency)
      const existingExact = existingByPlaidTxId.get(a.transaction_id);
      if (existingExact) {
        // Replay: already in DB, skip insert
        continue;
      }

      // 2. Check if this transaction was already split by the user
      if (existingSplitsByPlaidId.has(a.transaction_id)) {
        log.info({ plaidId: a.transaction_id }, "Skipping un-split insert for already user-split transaction");
        continue;
      }

      // 3. Check if this is a posted transaction replacing an existing pending transaction
      if (a.pending_transaction_id && existingByPlaidTxId.has(a.pending_transaction_id)) {
        const pendingTx = existingByPlaidTxId.get(a.pending_transaction_id);
        const cleanTitle = cleanPlaidName(a.merchant_name, a.name);
        const primaryCat = a.personal_finance_category?.primary ?? (Array.isArray(a.category) ? a.category[0] : null);
        const defaultCat = mapPlaidCategory(primaryCat, a.personal_finance_category?.detailed);
        const localAccountId = plaidAccToLocalIdMap[a.account_id] || pendingTx.accountId;

        const updatePayload: any = {
          plaidTransactionId: a.transaction_id,
          pending: false,
          pendingTransactionId: a.pending_transaction_id,
          amount: Math.abs(a.amount ?? pendingTx.amount),
          date: a.authorized_date ?? a.date ?? pendingTx.date,
          accountId: localAccountId,
          plaidAccountId: a.account_id,
          updatedAt: new Date(),
        };

        // Preserve user category/notes if user edited the pending transaction
        if (!pendingTx.isUserEdited && (!pendingTx.note || pendingTx.note.trim().length === 0)) {
          updatePayload.title = cleanTitle;
          updatePayload.merchant = a.merchant_name || cleanTitle;
          updatePayload.category = applyRuleCategory(cleanTitle, defaultCat);
        }

        pendingToResolveUpdates.push({ id: pendingTx.id, values: updatePayload });
        continue;
      }

      // 4. Truly new transaction -> insert into DB
      const cleanTitle = cleanPlaidName(a.merchant_name, a.name);
      const primaryCat = a.personal_finance_category?.primary ?? (Array.isArray(a.category) ? a.category[0] : null);
      const defaultCat = mapPlaidCategory(primaryCat, a.personal_finance_category?.detailed);
      const mappedCategory = applyRuleCategory(cleanTitle, defaultCat);
      const localAccountId = plaidAccToLocalIdMap[a.account_id] || (dbAccts[0]?.id ?? "acc_default");

      insertsToApply.push({
        id: `tx_plaid_${a.transaction_id}`,
        householdId,
        deviceId: "server_plaid_sync",
        accountId: localAccountId,
        title: cleanTitle,
        amount: Math.abs(a.amount ?? 0),
        type: (a.amount ?? 0) > 0 ? ("expense" as const) : ("income" as const),
        category: mappedCategory,
        date: a.authorized_date ?? a.date ?? new Date().toISOString().slice(0, 10),
        source: "plaid",
        merchant: a.merchant_name || cleanTitle,
        plaidItemId: itemId,
        plaidAccountId: a.account_id,
        fromEmail: false,
        bank: record.bankName,
        note: null,
        plaidTransactionId: a.transaction_id,
        pending: !!a.pending,
        pendingTransactionId: a.pending_transaction_id ?? null,
        splitGroupId: null,
        isUserEdited: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // 11. Chunked / Checkpointed Database Persistence
    // Execute removals
    if (removedIdsToDelete.length > 0) {
      await db
        .delete(transactionsTable)
        .where(
          and(
            eq(transactionsTable.householdId, householdId),
            inArray(transactionsTable.id, removedIdsToDelete)
          )
        );
    }

    // Execute updates (modifications and pending→posted resolutions)
    const allUpdates = [...updatesToApply, ...pendingToResolveUpdates];
    for (const u of allUpdates) {
      await db
        .update(transactionsTable)
        .set(u.values)
        .where(and(eq(transactionsTable.id, u.id), eq(transactionsTable.householdId, householdId)));
    }

    // Execute inserts in safe chunks
    for (let i = 0; i < insertsToApply.length; i += chunkSize) {
      const chunk = insertsToApply.slice(i, i + chunkSize);
      await db
        .insert(transactionsTable)
        .values(chunk)
        .onConflictDoNothing();
    }

    // Update cursor and lastSyncedAt atomically after successful ingestion
    await db
      .update(plaidItemsTable)
      .set({
        cursor: nextCursor ?? null,
        lastSyncedAt: new Date(),
        error: null,
      })
      .where(eq(plaidItemsTable.id, itemId));

    // 12. Investment Data Sync (if item has investment accounts)
    let holdings: ReturnType<typeof mapHolding>[] = [];
    let investmentTransactions: ReturnType<typeof mapInvestmentTransaction>[] = [];
    const hasInvestment = plaidAccounts.some(
      (a) => mapAccountType(a.type as string, a.subtype as string | null) === "investment"
    );

    if (hasInvestment) {
      try {
        const holdRes = await client.investmentsHoldingsGet({ access_token: record.accessToken });
        const secMap = buildSecMap(holdRes.data.securities);
        holdings = (holdRes.data.holdings || []).map((h) => mapHolding(h, secMap));
      } catch (invErr: any) {
        log.warn({ invErr: invErr?.message }, "investmentsHoldingsGet skipped/failed");
      }
      try {
        const iStartDate = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
        const iEndDate = new Date().toISOString().slice(0, 10);
        let invOffset = 0;
        const invCount = 500;
        let invTotal = Infinity;
        while (investmentTransactions.length < invTotal) {
          const invRes = await client.investmentsTransactionsGet({
            access_token: record.accessToken,
            start_date: iStartDate,
            end_date: iEndDate,
            options: { count: invCount, offset: invOffset },
          });
          invTotal = invRes.data.total_investment_transactions;
          const secMap = buildSecMap(invRes.data.securities);
          const page = (invRes.data.investment_transactions || []).map((t) =>
            mapInvestmentTransaction(t, secMap)
          );
          investmentTransactions.push(...page);
          invOffset += page.length;
          if (page.length === 0) break;
        }
      } catch (invErr: any) {
        log.warn({ invErr: invErr?.message }, "investmentsTransactionsGet skipped/failed");
      }
    }

    // 13. Map output transactions for backward compatibility with mobile client
    const allPlaidRaw = [...combinedAdded];
    const outputTransactions = allPlaidRaw.map((t) => mapPlaidTransactionToOutput(t, record.bankName));

    return {
      success: true,
      addedCount: insertsToApply.length + pendingToResolveUpdates.length,
      modifiedCount: updatesToApply.length,
      removedCount: removedIdsToDelete.length,
      transactions: outputTransactions,
      count: outputTransactions.length,
      removedIds: actuallyRemovedPlaidIds,
      holdings,
      investmentTransactions,
      plaidAccounts: plaidAccounts.map((a) => ({
        plaidAccountId: a.account_id,
        name: a.name ?? a.official_name ?? "Account",
        type: mapAccountType(a.type as string, a.subtype as string | null),
        balance: a.balances.current ?? a.balances.available ?? 0,
        lastFour: a.mask ?? "",
      })),
      cursor: nextCursor ?? null,
    };
  } finally {
    // Release PostgreSQL advisory lock
    if (lockAcquired && db && typeof db.execute === "function") {
      try {
        await db.execute(sql`SELECT pg_advisory_unlock(hashtext('plaid_sync_' || ${itemId}))`);
      } catch {}
    }
  }
}
