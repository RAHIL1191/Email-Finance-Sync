import { Router, type Request, type Response } from "express";
import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  Products,
  CountryCode,
} from "plaid";
import { eq, and } from "drizzle-orm";
import { db, plaidItemsTable } from "@workspace/db";
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

// ── POST /api/plaid/create-link-token ─────────────────────────────────────

router.post("/plaid/create-link-token", async (req, res) => {
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
    const response = await client.linkTokenCreate({
      user: { client_user_id: res.locals.householdId },
      client_name: "Finance Tracker",
      products: [Products.Transactions],
      country_codes: [CountryCode.Ca, CountryCode.Us],
      language: "en",
    });
    res.json({ link_token: response.data.link_token });
  } catch (err) {
    req.log.error({ err }, "Failed to create Plaid link token");
    res.status(500).json({ error: plaidError(err) });
  }
});

// ── POST /api/plaid/exchange-token ────────────────────────────────────────

router.post("/plaid/exchange-token", async (req, res) => {
  const { public_token, bank_name, bank_color } = req.body as {
    public_token?: string;
    bank_name?: string;
    bank_color?: string;
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

    // 2. Fetch accounts
    const accountsRes = await client.accountsGet({ access_token });
    const plaidAccounts = accountsRes.data.accounts;

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
        if (transactions.length >= 200) break;
      }
    } catch {
      // Fall back to /transactions/get if sync fails
      try {
        const startDate = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        const endDate = new Date().toISOString().slice(0, 10);
        const txRes = await client.transactionsGet({
          access_token,
          start_date: startDate,
          end_date: endDate,
          options: { count: 100 },
        });
        transactions = txRes.data.transactions;
      } catch {}
    }

    // 4. Store item in DB
    const dbId = `pi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    await db.insert(plaidItemsTable).values({
      id: dbId,
      householdId: res.locals.householdId,
      itemId: item_id,
      accessToken: access_token,
      bankName: bank_name ?? "Bank",
      bankColor: bank_color ?? "#1a56db",
      cursor: cursor ?? null,
      connectedAt: new Date(),
      lastSyncedAt: new Date(),
    });

    res.json({
      itemId: dbId,
      accounts: plaidAccounts.map((a) => ({
        plaidAccountId: a.account_id,
        name: a.name ?? a.official_name ?? "Account",
        type: mapAccountType(a.type as string, a.subtype as string | null),
        balance: a.balances.current ?? a.balances.available ?? 0,
        lastFour: a.mask ?? "",
      })),
      transactions: transactions.map(mapPlaidTransaction),
      transactionCount: transactions.length,
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
    let transactions: any[] = [];
    let cursor = record.cursor ?? undefined;

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
      if (transactions.length >= 500) break;
    }

    // Update cursor + last synced timestamp
    await db
      .update(plaidItemsTable)
      .set({ cursor: cursor ?? null, lastSyncedAt: new Date() })
      .where(eq(plaidItemsTable.id, itemId));

    res.json({
      transactions: transactions.map(mapPlaidTransaction),
      count: transactions.length,
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

  await db.delete(plaidItemsTable).where(eq(plaidItemsTable.id, itemId));

  res.json({ success: true });
});

// ── Helpers ───────────────────────────────────────────────────────────────

function mapAccountType(
  type: string,
  subtype: string | null
): "checking" | "savings" | "credit" | "investment" {
  if (type === "credit") return "credit";
  if (type === "investment" || type === "brokerage") return "investment";
  if (subtype === "savings" || subtype === "money market" || subtype === "cd") return "savings";
  return "checking";
}

function mapPlaidTransaction(t: any) {
  const amount = typeof t.amount === "number" ? t.amount : 0;
  const category =
    t.personal_finance_category?.primary ??
    (Array.isArray(t.category) ? t.category[0] : null) ??
    "Other";

  return {
    plaidTransactionId: t.transaction_id as string,
    title: (t.merchant_name ?? t.name ?? "Transaction") as string,
    amount: Math.abs(amount),
    type: amount > 0 ? "expense" : "income",
    category: humanCategory(category),
    date: (t.date ?? new Date().toISOString().slice(0, 10)) as string,
    accountId: t.account_id as string,
    bank: (t.merchant_name ?? t.name ?? "") as string,
  };
}

const CATEGORY_MAP: Record<string, string> = {
  FOOD_AND_DRINK: "Food",
  GENERAL_MERCHANDISE: "Shopping",
  TRANSPORTATION: "Transport",
  TRAVEL: "Travel",
  ENTERTAINMENT: "Entertainment",
  PERSONAL_CARE: "Health",
  MEDICAL: "Health",
  RENT_AND_UTILITIES: "Utilities",
  HOME_IMPROVEMENT: "Home",
  INCOME: "Income",
  TRANSFER_IN: "Income",
  TRANSFER_OUT: "Transfer",
  LOAN_PAYMENTS: "Bills",
  BANK_FEES: "Fees",
  GENERAL_SERVICES: "Services",
};

function humanCategory(raw: string): string {
  return CATEGORY_MAP[raw] ?? raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
