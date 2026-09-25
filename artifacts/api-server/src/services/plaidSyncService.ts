import { eq, and, inArray, sql } from "drizzle-orm";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import type { Logger } from "pino";
import type pg from "pg";
import {
  db as defaultDb,
  pool as defaultPool,
  plaidItemsTable,
  accountsTable,
  transactionsTable,
  categoryRulesTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";

export function getPlaidClient(): PlaidApi {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("NOT_CONFIGURED");
  }
  const env = (process.env.PLAID_ENV || "sandbox").toLowerCase();
  const basePath =
    env === "production"
      ? PlaidEnvironments.production
      : env === "development"
        ? PlaidEnvironments.development
        : PlaidEnvironments.sandbox;

  const configuration = new Configuration({
    basePath,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": clientId,
        "PLAID-SECRET": secret,
      },
    },
  });
  return new PlaidApi(configuration);
}

type PgPool = typeof defaultPool;

// ── Strict Interfaces ─────────────────────────────────────────────────────────

export interface LockHandle {
  release(): Promise<void>;
}

export interface LockManager {
  tryAcquire(itemId: string): Promise<LockHandle | null>;
}

export class PgAdvisoryLockManager implements LockManager {
  constructor(private pool: PgPool) {}

  async tryAcquire(itemId: string): Promise<LockHandle | null> {
    const client = await this.pool.connect();
    try {
      const lockKey = `plaid_sync_${itemId}`;
      const res = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
        [lockKey]
      );
      const isLocked = Boolean(res.rows[0]?.locked);
      if (!isLocked) {
        client.release();
        return null;
      }
      let released = false;
      return {
        release: async () => {
          if (released) return;
          released = true;
          try {
            await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
          } finally {
            client.release();
          }
        },
      };
    } catch (err) {
      client.release();
      throw err;
    }
  }
}

export interface PlaidAccountOutput {
  plaidAccountId: string;
  name: string;
  type: string;
  balance: number;
  lastFour: string;
}

export interface HoldingOutput {
  plaidAccountId: string;
  ticker: string | null;
  name: string;
  securityType: string;
  quantity: number;
  value: number;
  costBasis: number | null;
  currency: string;
  asOf: string | null;
}

export interface InvestmentTransactionOutput {
  plaidTxId: string;
  plaidAccountId: string;
  date: string;
  name: string;
  ticker: string | null;
  type: string;
  subtype: string | null;
  quantity: number | null;
  amount: number;
  fees: number | null;
  currency: string;
}

export interface PlaidOutputTransaction {
  plaidTransactionId: string;
  pending: boolean;
  pendingTransactionId: string | null;
  title: string;
  merchant: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  accountId: string;
  plaidAccountId: string;
  bank: string;
}

export interface SyncDatabase {
  transaction: <T>(cb: (tx: any) => Promise<T>) => Promise<T>;
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
}

export type SyncDb = typeof defaultDb | SyncDatabase;

export interface SyncPlaidItemOptions {
  itemId: string;
  householdId: string;
  force?: boolean;
  backfill?: boolean;
  plaidClient?: PlaidApi;
  dbClient?: SyncDb;
  poolClient?: pg.Pool;
  lockManager?: LockManager;
  logger?: Logger;
  chunkSize?: number;
}

export interface SyncPlaidItemResult {
  success: boolean;
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  transactions: PlaidOutputTransaction[];
  count: number;
  removedIds: string[];
  holdings: HoldingOutput[];
  investmentTransactions: InvestmentTransactionOutput[];
  plaidAccounts: PlaidAccountOutput[];
  cursor?: string | null;
  error?: string;
  status?: string;
}

// ── Pure Utility Functions ───────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
}

export function cleanPlaidName(merchant: string | null | undefined, raw: string): string {
  let candidate = (merchant || raw || "").trim();

  // Strip prefixes
  candidate = candidate.replace(
    /^(SQ\s*\*|SQU\s*\*|TST\s*\*|PAYPAL\s*\*|PP\s*\*|AMZN\s+MKTP\s+US\*|SP\s*\*|FSP\s*\*|WPY\s*\*)/i,
    ""
  );

  // Strip pending / authorization prefixes
  candidate = candidate.replace(/^(PENDING\s*-\s*|POS\s+PURCHASE\s+|DEBIT\s+PURCHASE\s+-?\s*)/i, "");

  // Strip URLs and domains
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
      return "Debt";
    case "BANK_FEES":
      return "Fees";
    default:
      return "General";
  }
}

export function mapAccountType(type: string, subtype: string | null): string {
  if (type === "investment") return "investment";
  if (type === "credit") return "credit";
  if (subtype === "checking") return "checking";
  if (subtype === "savings") return "savings";
  if (subtype === "credit card") return "credit";
  if (subtype === "cd" || subtype === "money market") return "savings";
  if (subtype === "mortgage" || subtype === "student" || subtype === "auto") return "loan";
  return "other";
}

export function buildSecMap(securities: unknown[] = []): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  for (const s of securities) {
    const sec = s as Record<string, unknown>;
    if (sec && typeof sec.security_id === "string") {
      m.set(sec.security_id, sec);
    }
  }
  return m;
}

export function mapHolding(h: Record<string, unknown>, secMap: Map<string, Record<string, unknown>>): HoldingOutput {
  const sec = typeof h.security_id === "string" ? secMap.get(h.security_id) : undefined;
  const qty = typeof h.quantity === "number" ? h.quantity : 0;
  const instPrice = typeof h.institution_price === "number" ? h.institution_price : null;
  const instValue = typeof h.institution_value === "number" ? h.institution_value : null;
  const closePrice = typeof sec?.close_price === "number" ? (sec.close_price as number) : null;
  let value = 0;
  if (instValue != null && instValue > 0) {
    value = instValue;
  } else if (instPrice != null && instPrice > 0 && qty > 0) {
    value = qty * instPrice;
  } else if (closePrice != null && closePrice > 0 && qty > 0) {
    value = qty * closePrice;
  }
  return {
    plaidAccountId: String(h.account_id),
    ticker: (sec?.ticker_symbol as string | null) ?? null,
    name: (sec?.name as string) ?? "Unknown",
    securityType: (sec?.type as string) ?? "other",
    quantity: qty,
    value,
    costBasis: typeof h.cost_basis === "number" ? h.cost_basis : null,
    currency: String(h.iso_currency_code ?? h.unofficial_currency_code ?? "CAD"),
    asOf: (h.institution_price_as_of as string | null) ?? (sec?.close_price_as_of as string | null) ?? null,
  };
}

export function mapInvestmentTransaction(
  t: Record<string, unknown>,
  secMap: Map<string, Record<string, unknown>>
): InvestmentTransactionOutput {
  const sec = typeof t.security_id === "string" ? secMap.get(t.security_id) : undefined;
  return {
    plaidTxId: String(t.investment_transaction_id),
    plaidAccountId: String(t.account_id),
    date: String(t.date),
    name: (sec?.name as string) ?? (t.name as string) ?? "Unknown",
    ticker: (sec?.ticker_symbol as string | null) ?? null,
    type: (t.type as string) ?? "other",
    subtype: (t.subtype as string | null) ?? null,
    quantity: typeof t.quantity === "number" ? t.quantity : null,
    amount: Math.abs(typeof t.amount === "number" ? t.amount : 0),
    fees: typeof t.fees === "number" ? t.fees : null,
    currency: String(t.iso_currency_code ?? t.unofficial_currency_code ?? "CAD"),
  };
}

export function mapPlaidTransactionToOutput(
  t: Record<string, unknown>,
  bankName: string
): PlaidOutputTransaction {
  const amount = typeof t.amount === "number" ? t.amount : 0;
  const pfc = t.personal_finance_category as { primary?: string; detailed?: string } | undefined;
  const catArr = Array.isArray(t.category) ? t.category : [];
  const primary: string = pfc?.primary ?? (catArr.length > 0 ? String(catArr[0]) : "OTHER");
  const detailed: string | undefined = pfc?.detailed;
  const merchant: string = typeof t.merchant_name === "string" ? t.merchant_name : "";
  const rawName: string = typeof t.name === "string" ? t.name : "";
  const title = cleanPlaidName(merchant, rawName);

  return {
    plaidTransactionId: String(t.transaction_id),
    pending: Boolean(t.pending),
    pendingTransactionId: typeof t.pending_transaction_id === "string" ? t.pending_transaction_id : null,
    title,
    merchant: merchant || title,
    amount: Math.abs(amount),
    type: amount > 0 ? "expense" : "income",
    category: mapPlaidCategory(primary, detailed),
    date: String(t.authorized_date ?? t.date ?? new Date().toISOString().slice(0, 10)),
    accountId: String(t.account_id),
    plaidAccountId: String(t.account_id),
    bank: bankName,
  };
}

// ── Main Plaid Sync Service ───────────────────────────────────────────────────

export async function syncPlaidItem(options: SyncPlaidItemOptions): Promise<SyncPlaidItemResult> {
  const {
    itemId,
    householdId,
    force = false,
    backfill = false,
    chunkSize = 200,
  } = options;

  const db = options.dbClient ?? defaultDb;
  const pool = options.poolClient ?? defaultPool;
  const log = options.logger ?? logger;
  const client = options.plaidClient ?? getPlaidClient();

  // 1. Dedicated session-level advisory lock
  // Lock MUST be acquired on a dedicated connection and held across the entire sync.
  const lockMgr: LockManager = options.lockManager ?? new PgAdvisoryLockManager(pool);
  let lockHandle: LockHandle | null = null;

  try {
    lockHandle = await lockMgr.tryAcquire(itemId);
  } catch (lockAcquireErr) {
    log.error({ err: lockAcquireErr, itemId, householdId }, "Advisory lock acquisition failed; failing closed");
    throw new Error(`LOCK_ACQUISITION_FAILED: ${lockAcquireErr instanceof Error ? lockAcquireErr.message : String(lockAcquireErr)}`);
  }

  if (!lockHandle) {
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

  try {
    // 2. Fetch Plaid item record (scoped to household)
    const [record]: (typeof plaidItemsTable.$inferSelect | undefined)[] = await db
      .select()
      .from(plaidItemsTable)
      .where(and(eq(plaidItemsTable.id, itemId), eq(plaidItemsTable.householdId, householdId)));

    if (!record) {
      throw new Error("PLAID_ITEM_NOT_FOUND");
    }

    // 3. Fetch household accounts
    const dbAccts: (typeof accountsTable.$inferSelect)[] = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.householdId, householdId));

    // 4. Authoritative Plaid account balances via /accounts/get
    const acctRes = await client.accountsGet({ access_token: record.accessToken });
    const plaidAccounts = acctRes.data.accounts || [];

    // Build mapping: plaidAccountId -> local account id
    const plaidAccToLocalIdMap: Record<string, string> = {};
    for (const pa of plaidAccounts) {
      const match = dbAccts.find((a) => {
        if (a.plaidItemId === itemId && a.plaidAccountId === pa.account_id) return true;
        if (a.plaidItemId === itemId && a.lastFour && pa.mask && a.lastFour === pa.mask) return true;
        if (a.sharedPlaidAccounts && Array.isArray(a.sharedPlaidAccounts)) {
          const sharedList = a.sharedPlaidAccounts as Array<{ plaidItemId: string; plaidAccountId?: string }>;
          return sharedList.some((s) => s.plaidItemId === itemId && s.plaidAccountId === pa.account_id);
        }
        return false;
      });
      if (match) {
        plaidAccToLocalIdMap[pa.account_id] = match.id;
      }
    }

    // Identify secondary joint accounts to skip importing duplicate transactions
    const secondaryPlaidAccountIds = new Set<string>();
    for (const [paId, localAccId] of Object.entries(plaidAccToLocalIdMap)) {
      const acc = dbAccts.find((a) => a.id === localAccId);
      if (acc?.isJoint && acc.sharedPlaidAccounts && Array.isArray(acc.sharedPlaidAccounts)) {
        const sharedList = acc.sharedPlaidAccounts as Array<{ plaidItemId: string; isPrimary?: boolean }>;
        const entry = sharedList.find((s) => s.plaidItemId === itemId);
        if (entry && entry.isPrimary === false) {
          secondaryPlaidAccountIds.add(paId);
        }
      }
    }

    // 5. Update account balances in DB
    for (const pa of plaidAccounts) {
      const localId = plaidAccToLocalIdMap[pa.account_id];
      if (localId) {
        const rawBalance = pa.balances.current ?? pa.balances.available ?? 0;
        const acctObj = dbAccts.find((a) => a.id === localId);
        const signedBalance = acctObj?.type === "credit" ? -Math.abs(rawBalance) : rawBalance;
        await db
          .update(accountsTable)
          .set({
            balance: signedBalance,
            plaidAccountId: pa.account_id,
            plaidItemId: itemId,
            updatedAt: new Date(),
          })
          .where(and(eq(accountsTable.id, localId), eq(accountsTable.householdId, householdId)));
      }
    }

    // 6. Pagination loop with bounded retries on TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION
    const initialCursor = force ? "" : (record.cursor || "");
    let currentCursor = initialCursor;
    let nextCursor = currentCursor;
    let hasMore = true;

    const allAdded: Record<string, unknown>[] = [];
    const allModified: Record<string, unknown>[] = [];
    const allRemoved: Array<{ transaction_id: string }> = [];

    const MAX_MUTATION_RETRIES = 3;
    let mutationAttempt = 0;

    while (hasMore) {
      try {
        const syncParams: { access_token: string; cursor?: string; count: number } = {
          access_token: record.accessToken,
          count: 500,
        };
        if (currentCursor) {
          syncParams.cursor = currentCursor;
        }

        const syncRes = await client.transactionsSync(syncParams);
        const data = syncRes.data;

        if (Array.isArray(data.added)) {
          allAdded.push(...(data.added as unknown as Record<string, unknown>[]));
        }
        if (Array.isArray(data.modified)) {
          allModified.push(...(data.modified as unknown as Record<string, unknown>[]));
        }
        if (Array.isArray(data.removed)) {
          allRemoved.push(...(data.removed as Array<{ transaction_id: string }>));
        }

        hasMore = data.has_more;
        currentCursor = data.next_cursor;
        nextCursor = data.next_cursor;
      } catch (syncErr: unknown) {
        const plaidErrorCode = (syncErr as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
        if (plaidErrorCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
          mutationAttempt++;
          if (mutationAttempt > MAX_MUTATION_RETRIES) {
            log.error({ itemId, mutationAttempt }, "Exceeded max retries for TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION");
            throw syncErr;
          }
          log.warn(
            { itemId, attempt: mutationAttempt, max: MAX_MUTATION_RETRIES },
            "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION encountered. Restarting pagination from initial cursor."
          );
          currentCursor = initialCursor;
          allAdded.length = 0;
          allModified.length = 0;
          allRemoved.length = 0;
          hasMore = true;
          continue;
        }
        throw syncErr;
      }
    }

    // 7. Optional backfill using /transactions/get if requested or initial sync yielded 0
    if (backfill || (initialCursor === "" && allAdded.length === 0)) {
      try {
        const startDate = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
        const endDate = new Date().toISOString().slice(0, 10);
        let offset = 0;
        const count = 500;
        let total = Infinity;

        while (offset < total) {
          const backfillRes = await client.transactionsGet({
            access_token: record.accessToken,
            start_date: startDate,
            end_date: endDate,
            options: { count, offset },
          });
          const bData = backfillRes.data;
          total = bData.total_transactions;
          const txs = bData.transactions || [];

          const existingPlaidIds = new Set(allAdded.map((t) => String(t.transaction_id)));
          for (const tx of txs) {
            if (!existingPlaidIds.has(tx.transaction_id)) {
              allAdded.push(tx as unknown as Record<string, unknown>);
              existingPlaidIds.add(tx.transaction_id);
            }
          }

          offset += txs.length;
          if (txs.length === 0) break;
        }
      } catch (bfErr: unknown) {
        log.warn({ bfErr: (bfErr as Error)?.message }, "Optional /transactions/get backfill failed/skipped");
      }
    }

    // 8. Filter out transactions belonging to secondary joint accounts
    const validAdded = allAdded.filter((t) => !secondaryPlaidAccountIds.has(String(t.account_id)));
    const validModified = allModified.filter((t) => !secondaryPlaidAccountIds.has(String(t.account_id)));
    const validRemoved = allRemoved;

    // 9. Load category rules for auto-categorization
    const rules: (typeof categoryRulesTable.$inferSelect)[] = await db
      .select()
      .from(categoryRulesTable)
      .where(eq(categoryRulesTable.householdId, householdId));

    function applyRuleCategory(cleanTitle: string, defaultCategory: string): string {
      const lower = cleanTitle.toLowerCase();
      for (const rule of rules) {
        if (rule.merchantExact && lower === rule.merchantExact.toLowerCase()) {
          return rule.category;
        }
        if (rule.merchantPattern && lower.includes(rule.merchantPattern.toLowerCase())) {
          return rule.category;
        }
      }
      return defaultCategory;
    }

    // 10. Load existing household transactions to resolve pending->posted, splits, edits
    const existingHouseholdTxs: (typeof transactionsTable.$inferSelect)[] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.householdId, householdId));

    const existingByPlaidTxId = new Map<string, typeof transactionsTable.$inferSelect>();
    const existingSplitsByPlaidId = new Set<string>();

    for (const tx of existingHouseholdTxs) {
      if (tx.plaidTransactionId) {
        existingByPlaidTxId.set(tx.plaidTransactionId, tx);
      }
      if (tx.splitGroupId && tx.plaidTransactionId) {
        existingSplitsByPlaidId.add(tx.plaidTransactionId);
      }
    }

    // ── Prepare Operations ──────────────────────────────────────────────────

    // A. Removals
    const removedIdsToDelete: string[] = [];
    const preservedRemovalsToApply: Array<{
      id: string;
      values: Partial<typeof transactionsTable.$inferInsert>;
    }> = [];
    const actuallyRemovedPlaidIds: string[] = [];

    for (const r of validRemoved) {
      const existing = existingByPlaidTxId.get(r.transaction_id);
      if (!existing) continue;

      actuallyRemovedPlaidIds.push(r.transaction_id);

      if (existing.isUserEdited || (existing.note && existing.note.trim().length > 0)) {
        // User customized or annotated this transaction:
        // Preserve user annotation/notes while neutralizing the financial spend so it no longer counts
        const cleanTitle = existing.title.replace(/^\[Removed by Bank\]\s*/i, "");
        const originalAmountStr = existing.amount.toFixed(2);
        const originalNote = existing.note ? existing.note.trim() : "";
        const bankAnnotation = `[Removed by Bank: original amount $${originalAmountStr}]`;
        const updatedNote = originalNote
          ? (originalNote.includes("[Removed by Bank") ? originalNote : `${originalNote} ${bankAnnotation}`)
          : bankAnnotation;

        preservedRemovalsToApply.push({
          id: existing.id,
          values: {
            amount: 0,
            pending: false,
            title: `[Removed by Bank] ${cleanTitle}`,
            note: updatedNote,
            updatedAt: new Date(),
          },
        });
      } else {
        removedIdsToDelete.push(existing.id);
      }
    }

    // B. Modifications
    const updatesToApply: Array<{
      id: string;
      values: Partial<typeof transactionsTable.$inferInsert>;
    }> = [];
    const addedFromModified: Record<string, unknown>[] = [];

    for (const m of validModified) {
      const txId = String(m.transaction_id);
      const existing = existingByPlaidTxId.get(txId);
      if (existing) {
        // If split by user, do not overwrite split parts
        if (existingSplitsByPlaidId.has(txId)) {
          continue;
        }

        const plaidAccId = String(m.account_id);
        const localAccountId = plaidAccToLocalIdMap[plaidAccId];
        if (!localAccountId) {
          throw new Error(
            `UNMAPPED_PLAID_ACCOUNT: Plaid account '${plaidAccId}' is not linked to any household account`
          );
        }

        const cleanTitle = cleanPlaidName(
          typeof m.merchant_name === "string" ? m.merchant_name : null,
          typeof m.name === "string" ? m.name : ""
        );
        const pfc = m.personal_finance_category as { primary?: string; detailed?: string } | undefined;
        const catArr = Array.isArray(m.category) ? m.category : [];
        const primaryCat = pfc?.primary ?? (catArr.length > 0 ? String(catArr[0]) : null);
        const defaultCat = mapPlaidCategory(primaryCat, pfc?.detailed);

        const updatePayload: Partial<typeof transactionsTable.$inferInsert> = {
          amount: Math.abs(typeof m.amount === "number" ? m.amount : existing.amount),
          date: String(m.authorized_date ?? m.date ?? existing.date),
          pending: Boolean(m.pending),
          pendingTransactionId: typeof m.pending_transaction_id === "string" ? m.pending_transaction_id : null,
          accountId: localAccountId,
          plaidAccountId: plaidAccId,
          updatedAt: new Date(),
        };

        // If user has NOT customized this transaction, refresh title and category
        if (!existing.isUserEdited && (!existing.note || existing.note.trim().length === 0)) {
          updatePayload.title = cleanTitle;
          updatePayload.merchant = (typeof m.merchant_name === "string" ? m.merchant_name : "") || cleanTitle;
          updatePayload.category = applyRuleCategory(cleanTitle, defaultCat);
        }

        updatesToApply.push({ id: existing.id, values: updatePayload });
      } else {
        addedFromModified.push(m);
      }
    }

    // C. Additions
    const combinedAdded = [...validAdded, ...addedFromModified];
    const insertsToApply: (typeof transactionsTable.$inferInsert)[] = [];
    const pendingToResolveUpdates: Array<{
      id: string;
      values: Partial<typeof transactionsTable.$inferInsert>;
    }> = [];

    for (const a of combinedAdded) {
      const aTxId = String(a.transaction_id);

      // Check account mapping: MUST NOT fall back to arbitrary default account
      const plaidAccId = String(a.account_id);
      const localAccountId = plaidAccToLocalIdMap[plaidAccId];
      if (!localAccountId) {
        throw new Error(
          `UNMAPPED_PLAID_ACCOUNT: Plaid account '${plaidAccId}' is not linked to any household account`
        );
      }

      // Replay / idempotency check
      const existingExact = existingByPlaidTxId.get(aTxId);
      if (existingExact) {
        continue;
      }

      // User split check
      if (existingSplitsByPlaidId.has(aTxId)) {
        continue;
      }

      // Pending-to-posted resolution
      const pendingTxId = typeof a.pending_transaction_id === "string" ? a.pending_transaction_id : null;
      if (pendingTxId && existingByPlaidTxId.has(pendingTxId)) {
        const pendingTx = existingByPlaidTxId.get(pendingTxId)!;
        const cleanTitle = cleanPlaidName(
          typeof a.merchant_name === "string" ? a.merchant_name : null,
          typeof a.name === "string" ? a.name : ""
        );
        const pfc = a.personal_finance_category as { primary?: string; detailed?: string } | undefined;
        const catArr = Array.isArray(a.category) ? a.category : [];
        const primaryCat = pfc?.primary ?? (catArr.length > 0 ? String(catArr[0]) : null);
        const defaultCat = mapPlaidCategory(primaryCat, pfc?.detailed);

        const updatePayload: Partial<typeof transactionsTable.$inferInsert> = {
          plaidTransactionId: aTxId,
          pending: false,
          pendingTransactionId: pendingTxId,
          amount: Math.abs(typeof a.amount === "number" ? a.amount : pendingTx.amount),
          date: String(a.authorized_date ?? a.date ?? pendingTx.date),
          accountId: localAccountId,
          plaidAccountId: plaidAccId,
          updatedAt: new Date(),
        };

        if (!pendingTx.isUserEdited && (!pendingTx.note || pendingTx.note.trim().length === 0)) {
          updatePayload.title = cleanTitle;
          updatePayload.merchant = (typeof a.merchant_name === "string" ? a.merchant_name : "") || cleanTitle;
          updatePayload.category = applyRuleCategory(cleanTitle, defaultCat);
        }

        pendingToResolveUpdates.push({ id: pendingTx.id, values: updatePayload });
        continue;
      }

      // Fresh transaction insert
      const cleanTitle = cleanPlaidName(
        typeof a.merchant_name === "string" ? a.merchant_name : null,
        typeof a.name === "string" ? a.name : ""
      );
      const pfc = a.personal_finance_category as { primary?: string; detailed?: string } | undefined;
      const catArr = Array.isArray(a.category) ? a.category : [];
      const primaryCat = pfc?.primary ?? (catArr.length > 0 ? String(catArr[0]) : null);
      const defaultCat = mapPlaidCategory(primaryCat, pfc?.detailed);
      const mappedCategory = applyRuleCategory(cleanTitle, defaultCat);
      const rawAmount = typeof a.amount === "number" ? a.amount : 0;

      insertsToApply.push({
        id: `tx_plaid_${aTxId}`,
        householdId,
        deviceId: "server_plaid_sync",
        accountId: localAccountId,
        title: cleanTitle,
        amount: Math.abs(rawAmount),
        type: rawAmount > 0 ? "expense" : "income",
        category: mappedCategory,
        date: String(a.authorized_date ?? a.date ?? new Date().toISOString().slice(0, 10)),
        source: "plaid",
        merchant: (typeof a.merchant_name === "string" ? a.merchant_name : "") || cleanTitle,
        plaidItemId: itemId,
        plaidAccountId: plaidAccId,
        fromEmail: false,
        bank: record.bankName,
        note: null,
        plaidTransactionId: aTxId,
        pending: Boolean(a.pending),
        pendingTransactionId: pendingTxId,
        splitGroupId: null,
        isUserEdited: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // ── 11. Atomic Database Transaction ─────────────────────────────────────
    // All removals, preserved updates, modifications, chunked inserts, and cursor advance
    // execute inside a single transactional boundary. If any step fails, the entire sync
    // rolls back atomically and the cursor does NOT advance.
    await db.transaction(async (tx) => {
      // 1. Removals of unedited transactions
      if (removedIdsToDelete.length > 0) {
        await tx
          .delete(transactionsTable)
          .where(
            and(
              eq(transactionsTable.householdId, householdId),
              inArray(transactionsTable.id, removedIdsToDelete)
            )
          );
      }

      // 2. Preserved removals (user-annotated: neutralized amount = 0, title & notes preserved)
      for (const pr of preservedRemovalsToApply) {
        await tx
          .update(transactionsTable)
          .set(pr.values)
          .where(
            and(
              eq(transactionsTable.id, pr.id),
              eq(transactionsTable.householdId, householdId)
            )
          );
      }

      // 3. Modifications & pending->posted resolutions
      const allUpdates = [...updatesToApply, ...pendingToResolveUpdates];
      for (const u of allUpdates) {
        await tx
          .update(transactionsTable)
          .set(u.values)
          .where(
            and(
              eq(transactionsTable.id, u.id),
              eq(transactionsTable.householdId, householdId)
            )
          );
      }

      // 4. Inserts in bounded chunks inside the transaction
      for (let i = 0; i < insertsToApply.length; i += chunkSize) {
        const chunk = insertsToApply.slice(i, i + chunkSize);
        await tx
          .insert(transactionsTable)
          .values(chunk)
          .onConflictDoNothing();
      }

      // 5. Advance cursor and record lastSyncedAt atomically
      await tx
        .update(plaidItemsTable)
        .set({
          cursor: nextCursor ?? null,
          lastSyncedAt: new Date(),
          error: null,
        })
        .where(
          and(
            eq(plaidItemsTable.id, itemId),
            eq(plaidItemsTable.householdId, householdId)
          )
        );
    });

    // 12. Investment Data Sync (if item has investment accounts)
    let holdings: HoldingOutput[] = [];
    let investmentTransactions: InvestmentTransactionOutput[] = [];
    const hasInvestment = plaidAccounts.some(
      (a) => mapAccountType(a.type, a.subtype ?? null) === "investment"
    );

    if (hasInvestment) {
      try {
        const holdRes = await client.investmentsHoldingsGet({ access_token: record.accessToken });
        const secMap = buildSecMap(holdRes.data.securities);
        holdings = (holdRes.data.holdings || []).map((h) =>
          mapHolding(h as unknown as Record<string, unknown>, secMap)
        );
      } catch (invErr: unknown) {
        log.warn({ invErr: (invErr as Error)?.message }, "investmentsHoldingsGet skipped/failed");
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
            mapInvestmentTransaction(t as unknown as Record<string, unknown>, secMap)
          );
          investmentTransactions.push(...page);
          invOffset += page.length;
          if (page.length === 0) break;
        }
      } catch (invErr: unknown) {
        log.warn({ invErr: (invErr as Error)?.message }, "investmentsTransactionsGet skipped/failed");
      }
    }

    // 13. Map output transactions
    const allPlaidRaw = [...combinedAdded];
    const outputTransactions = allPlaidRaw.map((t) =>
      mapPlaidTransactionToOutput(t, record.bankName)
    );

    return {
      success: true,
      addedCount: insertsToApply.length + pendingToResolveUpdates.length,
      modifiedCount: updatesToApply.length,
      removedCount: removedIdsToDelete.length + preservedRemovalsToApply.length,
      transactions: outputTransactions,
      count: outputTransactions.length,
      removedIds: actuallyRemovedPlaidIds,
      holdings,
      investmentTransactions,
      plaidAccounts: plaidAccounts.map((a) => ({
        plaidAccountId: a.account_id,
        name: a.name ?? a.official_name ?? "Account",
        type: mapAccountType(a.type, a.subtype ?? null),
        balance: a.balances.current ?? a.balances.available ?? 0,
        lastFour: a.mask ?? "",
      })),
      cursor: nextCursor ?? null,
    };
  } finally {
    // Release dedicated connection advisory lock
    if (lockHandle) {
      try {
        await lockHandle.release();
      } catch (releaseErr) {
        log.error({ err: releaseErr, itemId }, "Error releasing advisory lock");
      }
    }
  }
}
