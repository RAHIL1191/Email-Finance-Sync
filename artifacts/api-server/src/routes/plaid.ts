import { Router, type Request, type Response } from "express";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { eq, and } from "drizzle-orm";
import { db, plaidItemsTable, accountsTable, transactionsTable } from "@workspace/db";
import { requireHouseholdId } from "../middlewares/validate.js";

const router = Router();

// ── All routes in this router require X-Household-ID header ───────────────
router.use(requireHouseholdId);

// ── Plaid client factory ───────────────────────────────────────────────────

function getPlaidClient(): PlaidApi {
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

function plaidError(err: unknown): string {
  const e = err as any;
  return (
    e?.response?.data?.error_message ??
    e?.response?.data?.display_message ??
    e?.message ??
    "Unknown error"
  );
}

// ── GET /api/plaid/items ──────────────────────────────────────────────────

router.get("/plaid/items", async (req, res) => {
  const [rows, accts] = await Promise.all([
    db.select().from(plaidItemsTable).where(eq(plaidItemsTable.householdId, res.locals.householdId)),
    db.select().from(accountsTable).where(eq(accountsTable.householdId, res.locals.householdId)),
  ]);

  res.json(
    rows.map((r) => {
      const itemAccounts = accts.filter((a) => a.plaidItemId === r.id);
      const plaidAccountMap: Record<string, string> = {};
      itemAccounts.forEach((a) => {
        if (a.plaidAccountId) plaidAccountMap[a.plaidAccountId] = a.id;
      });
      return {
        itemId: r.id,
        bankName: r.bankName,
        bankColor: r.bankColor,
        connectedAt: r.connectedAt?.toISOString() ?? new Date().toISOString(),
        lastSynced: r.lastSyncedAt?.toISOString() ?? undefined,
        accountIds: itemAccounts.map((a) => a.id),
        plaidAccountMap,
      };
    })
  );
});

// ── POST /api/plaid/create-link-token ─────────────────────────────────────

router.post("/plaid/create-link-token", async (req, res) => {
  const { item_id } = req.body as { item_id?: string };
  let client: PlaidApi;
  try {
    client = getPlaidClient();
  } catch {
    res.status(503).json({
      error: "Plaid is not configured. Add PLAID_CLIENT_ID and PLAID_SECRET in your environment secrets.",
    });
    return;
  }

  try {
    const base = {
      user: { client_user_id: res.locals.householdId },
      client_name: "Finance Tracker",
      country_codes: [CountryCode.Ca, CountryCode.Us],
      language: "en",
    };

    if (item_id) {
      // Update mode — relink an existing item without creating a new one
      const rows = await db.select().from(plaidItemsTable)
        .where(and(eq(plaidItemsTable.id, item_id), eq(plaidItemsTable.householdId, res.locals.householdId)))
        .limit(1);
      if (!rows[0]) {
        res.status(404).json({ error: "Plaid item not found" });
        return;
      }
      try {
        const response = await client.linkTokenCreate({ ...base, access_token: rows[0].accessToken });
        res.json({ link_token: response.data.link_token, update_mode: true });
      } catch {
        // Access token is invalid (item was removed from Plaid) — fall back to fresh link.
        // The client will pass existing_item_id on exchange so we update rather than insert.
        const response = await client.linkTokenCreate({ ...base, products: [Products.Transactions], optional_products: [Products.Investments] });
        res.json({ link_token: response.data.link_token, update_mode: false, stale_item: true });
      }
    } else {
      const response = await client.linkTokenCreate({ ...base, products: [Products.Transactions], optional_products: [Products.Investments] });
      res.json({ link_token: response.data.link_token, update_mode: false });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to create Plaid link token");
    res.status(500).json({ error: plaidError(err) });
  }
});

// ── POST /api/plaid/exchange-token ────────────────────────────────────────

router.post("/plaid/exchange-token", async (req, res) => {
  const { public_token, bank_name, bank_color, existing_item_id } = req.body as {
    public_token?: string;
    bank_name?: string;
    bank_color?: string;
    existing_item_id?: string;
  };

  if (!public_token) {
    res.status(400).json({ error: "public_token is required" });
    return;
  }

  let client: PlaidApi;
  try {
    client = getPlaidClient();
  } catch {
    res.status(503).json({ error: "Plaid is not configured" });
    return;
  }

  try {
    // 1. Exchange public token for access token
    const exchangeRes = await client.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeRes.data;

    // Relink mode: just update the stored access_token — do NOT create a duplicate item
    if (existing_item_id) {
      await db
        .update(plaidItemsTable)
        .set({ accessToken: access_token, lastSyncedAt: new Date() })
        .where(
          and(
            eq(plaidItemsTable.id, existing_item_id),
            eq(plaidItemsTable.householdId, res.locals.householdId)
          )
        );
      res.json({ updated: true, itemId: existing_item_id });
      return;
    }

    // 2. Fetch accounts
    const accountsRes = await client.accountsGet({ access_token });
    const plaidAccounts = accountsRes.data.accounts;

    // Resolve real institution name from Plaid (ignore client-provided bank_name)
    let resolvedBankName = bank_name ?? "Bank";
    let resolvedBankColor = bank_color ?? "#1a56db";
    const institutionId = accountsRes.data.item.institution_id;
    if (institutionId) {
      try {
        const instRes = await client.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Ca, CountryCode.Us],
        });
        resolvedBankName = instRes.data.institution.name;
      } catch {
        // fall back to client-provided name
      }
    }

    // 3. Fetch initial transactions via sync cursor
    let transactions: any[] = [];
    let cursor: string | undefined;
    try {
      let hasMore = true;
      while (hasMore) {
        const syncRes = await client.transactionsSync({
          access_token,
          cursor,
          options: { include_personal_finance_category: true },
        });
        transactions = [...transactions, ...syncRes.data.added];
        cursor = syncRes.data.next_cursor;
        hasMore = syncRes.data.has_more;
      }
    } catch {
      // Fall back to /transactions/get if sync throws
    }

    // Some institutions (e.g. Wealthsimple Canada) return 0 via transactionsSync
    // on first link because transactions are processed asynchronously. Additionally,
    // we always call transactionsGet to pull in Credit Card / depository transactions,
    // merging them by transaction_id to ensure complete historical backfill.
    try {
      const startDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const endDate = new Date().toISOString().slice(0, 10);
      const txRes = await client.transactionsGet({
        access_token,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500 },
      });
      const getTxs = txRes.data.transactions ?? [];
      const txMap = new Map();
      transactions.forEach((t) => txMap.set(t.transaction_id, t));
      getTxs.forEach((t) => txMap.set(t.transaction_id, t));
      transactions = Array.from(txMap.values());
    } catch {}

    // Filter out standard transactions that belong to investment accounts.
    // Investment accounts sync holdings + investment transactions separately.
    const investmentAccountIds = new Set(
      plaidAccounts
        .filter((a) => mapAccountType(a.type as string, a.subtype as string | null) === "investment")
        .map((a) => a.account_id)
    );
    transactions = transactions.filter((t) => !investmentAccountIds.has(t.account_id));

    // 4. Fetch investment holdings + transactions (best-effort)
    let holdings: ReturnType<typeof mapHolding>[] = [];
    let investmentTransactions: ReturnType<typeof mapInvestmentTransaction>[] = [];
    try {
      const holdRes = await client.investmentsHoldingsGet({ access_token });
      const secMap = buildSecMap(holdRes.data.securities);
      holdings = holdRes.data.holdings.map((h) => mapHolding(h, secMap));
    } catch (invErr) {
      req.log.warn({ invErr }, "investmentsHoldingsGet failed (product may not be enabled for this item)");
    }
    try {
      const iStartDate = new Date(Date.now() - 730 * 86400000).toISOString().slice(0, 10);
      const iEndDate = new Date().toISOString().slice(0, 10);
      let invOffset = 0;
      const invCount = 500;
      let invTotal = Infinity;
      while (investmentTransactions.length < invTotal) {
        const invRes = await client.investmentsTransactionsGet({
          access_token,
          start_date: iStartDate,
          end_date: iEndDate,
          options: { count: invCount, offset: invOffset },
        });
        invTotal = invRes.data.total_investment_transactions;
        const secMap = buildSecMap(invRes.data.securities);
        const page = invRes.data.investment_transactions.map((t) => mapInvestmentTransaction(t, secMap));
        investmentTransactions = [...investmentTransactions, ...page];
        invOffset += page.length;
        if (page.length === 0) break;
      }
    } catch (invErr: any) {
      req.log.warn({
        err: invErr?.message || String(invErr),
        code: invErr?.response?.data?.error_code,
        type: invErr?.response?.data?.error_type,
        msg: invErr?.response?.data?.error_message
      }, "investmentTransactionsGet failed (product may not be enabled for this item)");
    }

    // 5. Store item in DB
    const dbId = `pi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    await db.insert(plaidItemsTable).values({
      id: dbId,
      householdId: res.locals.householdId,
      itemId: item_id,
      accessToken: access_token,
      bankName: resolvedBankName,
      bankColor: resolvedBankColor,
      cursor: cursor ?? null,
      connectedAt: new Date(),
      lastSyncedAt: new Date(),
    });

    res.json({
      itemId: dbId,
      institutionName: resolvedBankName,
      accounts: plaidAccounts.map((a) => ({
        plaidAccountId: a.account_id,
        name: a.name ?? a.official_name ?? "Account",
        type: mapAccountType(a.type as string, a.subtype as string | null),
        balance: a.balances.current ?? a.balances.available ?? 0,
        lastFour: a.mask ?? "",
      })),
      transactions: transactions.map((t) => mapPlaidTransaction(t, resolvedBankName)),
      transactionCount: transactions.length,
      holdings,
      investmentTransactions,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to exchange Plaid token");
    res.status(500).json({ error: plaidError(err) });
  }
});

// ── POST /api/plaid/sync/:itemId ──────────────────────────────────────────

router.post("/plaid/sync/:itemId", async (req, res) => {
  const { itemId } = req.params;

  const [record] = await db
    .select()
    .from(plaidItemsTable)
    .where(
      and(
        eq(plaidItemsTable.id, itemId),
        eq(plaidItemsTable.householdId, res.locals.householdId)
      )
    );

  if (!record) {
    res.status(404).json({ error: "Plaid item not found" });
    return;
  }

  let client: PlaidApi;
  try {
    client = getPlaidClient();
  } catch {
    res.status(503).json({ error: "Plaid is not configured" });
    return;
  }

  try {
    const force = !!(req.body as any)?.force;
    let transactions: any[] = [];
    let cursor = force ? undefined : (record.cursor ?? undefined);

    // Optionally trigger on-demand refresh (paid Plaid add-ons, set PLAID_REFRESH_ENABLED=true to enable).
    // Fired without await so the refresh runs in the background and never blocks the response.
    // Plaid will push a webhook when fresh data is ready; the next sync will pick it up.
    if (process.env.PLAID_REFRESH_ENABLED === "true") {
      Promise.allSettled([
        client.transactionsRefresh({ access_token: record.accessToken }),
        client.investmentsRefresh({ access_token: record.accessToken }),
      ]).then(([txR, invR]) => {
        if (txR.status === "rejected") req.log.warn({ err: (txR as any).reason?.message }, "transactionsRefresh skipped");
        if (invR.status === "rejected") req.log.warn({ err: (invR as any).reason?.message }, "investmentsRefresh skipped");
      });
    }

    // Fetch accounts + transactions in parallel
    const [accountsRes] = await Promise.all([
      client.accountsGet({ access_token: record.accessToken }),
    ]);
    const plaidAccounts = accountsRes.data.accounts;

    let hasMore = true;
    while (hasMore) {
      const syncRes = await client.transactionsSync({
        access_token: record.accessToken,
        cursor,
        options: { include_personal_finance_category: true },
      });
      transactions = [...transactions, ...syncRes.data.added];
      cursor = syncRes.data.next_cursor;
      hasMore = syncRes.data.has_more;
    }

    // When sync returns 0 (e.g. Wealthsimple Canada async processing or exhausted cursor),
    // we always call transactionsGet to pick up and backfill whatever is currently available.
    try {
      const startDate = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
      const endDate   = new Date().toISOString().slice(0, 10);
      const txRes = await client.transactionsGet({
        access_token: record.accessToken,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500 },
      });
      const getTxs = txRes.data.transactions ?? [];
      const txMap = new Map();
      transactions.forEach((t) => txMap.set(t.transaction_id, t));
      getTxs.forEach((t) => txMap.set(t.transaction_id, t));
      transactions = Array.from(txMap.values());
    } catch {}

    // Filter out standard transactions that belong to investment accounts.
    // Investment accounts sync holdings + investment transactions separately.
    const investmentAccountIds = new Set(
      plaidAccounts
        .filter((a) => mapAccountType(a.type as string, a.subtype as string | null) === "investment")
        .map((a) => a.account_id)
    );
    transactions = transactions.filter((t) => !investmentAccountIds.has(t.account_id));

    // Backfill plaid_item_id + plaid_account_id on DB accounts that are missing them.
    // This self-heals accounts created before these columns existed.
    const dbAccts = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.householdId, res.locals.householdId));
    for (const pa of plaidAccounts) {
      const match = dbAccts.find(
        (a) => a.plaidAccountId === pa.account_id ||
               (a.lastFour === (pa.mask ?? "") && !a.plaidItemId)
      );
      if (match && (!match.plaidItemId || !match.plaidAccountId)) {
        await db
          .update(accountsTable)
          .set({ plaidItemId: itemId, plaidAccountId: pa.account_id })
          .where(eq(accountsTable.id, match.id));
      }
    }

    // Update cursor + last synced timestamp
    await db
      .update(plaidItemsTable)
      .set({ cursor: cursor ?? null, lastSyncedAt: new Date() })
      .where(eq(plaidItemsTable.id, itemId));

    // Fetch investment holdings + transactions alongside regular sync
    let holdings: ReturnType<typeof mapHolding>[] = [];
    let investmentTransactions: ReturnType<typeof mapInvestmentTransaction>[] = [];
    try {
      const holdRes = await client.investmentsHoldingsGet({ access_token: record.accessToken });
      const secMap = buildSecMap(holdRes.data.securities);
      holdings = holdRes.data.holdings.map((h) => mapHolding(h, secMap));
    } catch (invErr) {
      req.log.warn({ invErr }, "investmentsHoldingsGet failed during sync");
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
        const page = invRes.data.investment_transactions.map((t) => mapInvestmentTransaction(t, secMap));
        investmentTransactions = [...investmentTransactions, ...page];
        invOffset += page.length;
        if (page.length === 0) break;
      }
    } catch (invErr: any) {
      req.log.warn({
        err: invErr?.message || String(invErr),
        code: invErr?.response?.data?.error_code,
        type: invErr?.response?.data?.error_type,
        msg: invErr?.response?.data?.error_message
      }, "investmentTransactionsGet failed during sync");
    }

    res.json({
      transactions: transactions.map((t) => mapPlaidTransaction(t, record.bankName)),
      count: transactions.length,
      holdings,
      investmentTransactions,
      // Return Plaid accounts so client can self-heal accountIds / plaidAccMap
      plaidAccounts: plaidAccounts.map((a) => ({
        plaidAccountId: a.account_id,
        name: a.name ?? a.official_name ?? "Account",
        type: mapAccountType(a.type as string, a.subtype as string | null),
        balance: a.balances.current ?? a.balances.available ?? 0,
        lastFour: a.mask ?? "",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to sync Plaid transactions");
    res.status(500).json({ error: plaidError(err) });
  }
});

// ── DELETE /api/plaid/disconnect/:itemId ──────────────────────────────────

router.delete("/plaid/disconnect/:itemId", async (req, res) => {
  const { itemId } = req.params;

  const [record] = await db
    .select()
    .from(plaidItemsTable)
    .where(
      and(
        eq(plaidItemsTable.id, itemId),
        eq(plaidItemsTable.householdId, res.locals.householdId)
      )
    );

  if (!record) {
    res.status(404).json({ error: "Plaid item not found" });
    return;
  }

  // Best-effort: remove from Plaid's servers
  try {
    const client = getPlaidClient();
    await client.itemRemove({ access_token: record.accessToken });
  } catch {}

  // Cascade-delete all accounts (and their transactions) linked to this item
  const linkedAccounts = await db
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.plaidItemId, itemId),
        eq(accountsTable.householdId, res.locals.householdId)
      )
    );

  if (linkedAccounts.length > 0) {
    for (const acct of linkedAccounts) {
      await db.delete(transactionsTable).where(eq(transactionsTable.accountId, acct.id));
    }
    for (const acct of linkedAccounts) {
      await db.delete(accountsTable).where(eq(accountsTable.id, acct.id));
    }
  }

  await db.delete(plaidItemsTable).where(eq(plaidItemsTable.id, itemId));

  res.json({ success: true, removedAccounts: linkedAccounts.length });
});

// ── Helpers ───────────────────────────────────────────────────────────────

function buildSecMap(securities: any[]): Map<string, any> {
  const m = new Map<string, any>();
  for (const s of securities) m.set(s.security_id, s);
  return m;
}

function mapHolding(h: any, secMap: Map<string, any>) {
  const sec = secMap.get(h.security_id);
  const qty = (h.quantity ?? 0) as number;
  const instValue = h.institution_value as number | null;
  const instPrice = h.institution_price as number | null;
  const closePrice = sec?.close_price as number | null;
  // Best-effort value: institution_value → institution_price*qty → close_price*qty
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

function mapInvestmentTransaction(t: any, secMap: Map<string, any>) {
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

function mapAccountType(
  type: string,
  subtype: string | null
): "checking" | "savings" | "credit" | "investment" {
  if (type === "credit" || type === "loan") return "credit";
  if (type === "investment" || type === "brokerage") return "investment";
  if (subtype === "savings" || subtype === "money market" || subtype === "cd") return "savings";
  return "checking";
}

const LOWERCASE_PREP = new Set(["from","to","and","or","of","in","at","by","for","the","a","an"]);
function toTitleCase(str: string): string {
  return str
    .trim()
    .replace(/\b\w+/g, (w, offset) => {
      const lower = w.toLowerCase();
      if (offset > 0 && LOWERCASE_PREP.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    });
}

function cleanPlaidName(merchantName: string | null | undefined, rawName: string | null | undefined): string {
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

  // If raw still looks like a garbled abbreviation (all-caps run-together ≤ 10 chars)
  // prefer merchant_name if it's longer and more readable
  if (s.length <= 10 && /^[A-Z]+$/.test(s) && merchant && merchant.length > s.length) {
    s = merchant;
  }

  // If cleaned raw is meaningful use it; otherwise fall back to merchant_name or raw
  const candidate = s.length >= 3 ? s : (merchant || raw);
  return toTitleCase(candidate) || "Transaction";
}

/** Map Plaid primary + optional detailed category → exact app category name */
function mapPlaidCategory(primary: string, detailed?: string): string {
  const d = (detailed ?? "").toUpperCase();
  switch (primary) {
    case "FOOD_AND_DRINK":
      if (d.includes("GROCERIES") || d.includes("SUPERMARKETS")) return "Food & Grocery";
      return "Drink & Dine"; // restaurants, fast food, coffee, bars
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
      return "Others";
    case "GENERAL_SERVICES":
      return "Others";
    default:
      return "Others";
  }
}

function mapPlaidTransaction(t: any, bankName: string) {
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
    pending: t.pending as boolean,
    pendingTransactionId: t.pending_transaction_id as string | null,
    title,
    merchant: merchant || title,
    amount: Math.abs(amount),
    type: amount > 0 ? ("expense" as const) : ("income" as const),
    category: mapPlaidCategory(primary, detailed),
    // Prefer authorized_date (actual purchase day) over the posted date
    date: (t.authorized_date ?? t.date ?? new Date().toISOString().slice(0, 10)) as string,
    accountId: t.account_id as string,
    plaidAccountId: t.account_id as string,
    bank: bankName,
  };
}

// ── GET /api/plaid/link-page (exported for public registration in routes/index.ts) ──
// Served as a popup window — no household auth needed since the browser
// opens it directly without custom headers.
export function plaidLinkPageHandler(req: Request, res: Response): void {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).send("token query param is required");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.removeHeader("X-Frame-Options");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connect Bank</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f9fafb;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      flex-direction: column;
      gap: 16px;
      color: #374151;
    }
    .spinner {
      width: 44px; height: 44px;
      border: 3px solid #e5e7eb;
      border-top-color: #1a56db;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { font-size: 15px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>Opening secure bank link…</p>
  <script src="https://cdn.plaid.com/link/v2/stable/link.js"></script>
  <script>
    function postMsg(data) {
      var target = window.opener || window.parent;
      if (target) target.postMessage(data, '*');
    }

    var handler = Plaid.create({
      token: ${JSON.stringify(token)},
      onSuccess: function(publicToken, metadata) {
        postMsg({ type: 'plaid_success', publicToken: publicToken, metadata: metadata });
        setTimeout(function() { window.close(); }, 300);
      },
      onExit: function(err, metadata) {
        postMsg({ type: 'plaid_exit', error: err, metadata: metadata });
        setTimeout(function() { window.close(); }, 300);
      },
      onEvent: function(eventName, metadata) {
        postMsg({ type: 'plaid_event', eventName: eventName, metadata: metadata });
      }
    });

    handler.open();
  </script>
</body>
</html>`);
}

export default router;
