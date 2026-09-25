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
import {
  syncPlaidItem,
  getPlaidClient,
  cleanPlaidName,
  mapAccountType,
  mapPlaidCategory,
  mapHolding,
  mapInvestmentTransaction,
  buildSecMap,
  mapPlaidTransactionToOutput,
} from "../services/plaidSyncService.js";

const router = Router();

// ── All routes in this router require X-Household-ID header ───────────────
router.use(requireHouseholdId);

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
      const itemAccounts = accts.filter(
        (a) =>
          a.plaidItemId === r.id ||
          (a.sharedPlaidAccounts &&
            Array.isArray(a.sharedPlaidAccounts) &&
            a.sharedPlaidAccounts.some((s) => s.plaidItemId === r.id))
      );
      const plaidAccountMap: Record<string, string> = {};
      itemAccounts.forEach((a) => {
        if (a.plaidItemId === r.id && a.plaidAccountId) {
          plaidAccountMap[a.plaidAccountId] = a.id;
        }
        if (a.sharedPlaidAccounts && Array.isArray(a.sharedPlaidAccounts)) {
          const matching = a.sharedPlaidAccounts.find((s) => s.plaidItemId === r.id);
          if (matching?.plaidAccountId) {
            plaidAccountMap[matching.plaidAccountId] = a.id;
          }
        }
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
  const { item_id: rawItemId, access_token_item_id } = req.body as { item_id?: string; access_token_item_id?: string };
  const item_id = rawItemId || access_token_item_id;
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
      transactions: {
        days_requested: 730,
      },
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

    // 3. Store item in DB with null cursor initially
    const dbId = `pi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    await db.insert(plaidItemsTable).values({
      id: dbId,
      householdId: res.locals.householdId,
      itemId: item_id,
      accessToken: access_token,
      bankName: resolvedBankName,
      bankColor: resolvedBankColor,
      cursor: null,
      connectedAt: new Date(),
      lastSyncedAt: new Date(),
    });

    // 4. Durably ingest initial transactions + accounts + investments on server
    const syncResult = await syncPlaidItem({
      itemId: dbId,
      householdId: res.locals.householdId,
      backfill: true,
      logger: req.log,
    });

    // Fetch accounts now saved in DB for this item
    const existingHouseholdAccounts = await db
      .select()
      .from(accountsTable)
      .where(eq(accountsTable.householdId, res.locals.householdId));

    const itemAccounts = existingHouseholdAccounts.filter(
      (a) =>
        a.plaidItemId === dbId ||
        (a.sharedPlaidAccounts &&
          Array.isArray(a.sharedPlaidAccounts) &&
          a.sharedPlaidAccounts.some((s: any) => s.plaidItemId === dbId))
    );

    res.json({
      itemId: dbId,
      institutionName: resolvedBankName,
      accounts: itemAccounts.map((a) => ({
        id: a.id,
        plaidAccountId: a.plaidAccountId,
        name: a.name,
        type: a.type,
        balance: a.balance,
        lastFour: a.lastFour ?? "",
      })),
      transactions: syncResult.transactions,
      transactionCount: syncResult.transactions.length,
      holdings: syncResult.holdings,
      investmentTransactions: syncResult.investmentTransactions,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to exchange Plaid token");
    res.status(500).json({ error: plaidError(err) });
  }
});

// ── POST /api/plaid/sync/:itemId ──────────────────────────────────────────

router.post("/plaid/sync/:itemId", async (req, res) => {
  const { itemId } = req.params;
  const body = req.body as { force?: boolean; backfill?: boolean } | undefined;
  const force = Boolean(body?.force);
  const backfill = Boolean(body?.backfill);

  try {
    const result = await syncPlaidItem({
      itemId,
      householdId: res.locals.householdId,
      force,
      backfill,
      logger: req.log,
    });

    if (!result.success && result.status === "locked") {
      res.status(409).json({ error: "Sync already in progress for this bank connection" });
      return;
    }

    res.json({
      transactions: result.transactions,
      count: result.count,
      addedCount: result.addedCount,
      modifiedCount: result.modifiedCount,
      removedCount: result.removedCount,
      removedIds: result.removedIds,
      holdings: result.holdings,
      investmentTransactions: result.investmentTransactions,
      plaidAccounts: result.plaidAccounts,
      serverPersisted: true,
    });
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    if (errMessage.startsWith("UNMAPPED_PLAID_ACCOUNT")) {
      res.status(400).json({ error: errMessage });
      return;
    }
    if (errMessage === "PLAID_ITEM_NOT_FOUND") {
      res.status(404).json({ error: "Plaid item not found" });
      return;
    }
    if (errMessage === "NOT_CONFIGURED") {
      res.status(503).json({ error: "Plaid is not configured" });
      return;
    }
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

  // Cascade-delete non-joint accounts (and their transactions) linked to this item.
  // For joint accounts with multiple items attached, promote the surviving item instead of deleting.
  const linkedAccounts = await db
    .select()
    .from(accountsTable)
    .where(
      and(
        eq(accountsTable.plaidItemId, itemId),
        eq(accountsTable.householdId, res.locals.householdId)
      )
    );

  let removedCount = 0;
  for (const acct of linkedAccounts) {
    if (acct.isJoint && Array.isArray(acct.sharedPlaidAccounts)) {
      const surviving = acct.sharedPlaidAccounts.filter((s) => s.plaidItemId !== itemId);
      if (surviving.length > 0) {
        // Promote the next surviving item to primary
        surviving[0].isPrimary = true;
        await db
          .update(accountsTable)
          .set({
            plaidItemId: surviving[0].plaidItemId,
            plaidAccountId: surviving[0].plaidAccountId,
            sharedPlaidAccounts: surviving,
            isJoint: surviving.length > 1,
          })
          .where(eq(accountsTable.id, acct.id));
        continue;
      }
    }

    // Delete non-joint or unshared account
    await db.delete(transactionsTable).where(eq(transactionsTable.accountId, acct.id));
    await db.delete(accountsTable).where(eq(accountsTable.id, acct.id));
    removedCount++;
  }

  await db.delete(plaidItemsTable).where(eq(plaidItemsTable.id, itemId));

  res.json({ success: true, removedAccounts: removedCount });
});

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
