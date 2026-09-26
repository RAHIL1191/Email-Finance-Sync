import pg from "../../../lib/db/node_modules/pg/lib/index.js";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import fs from "fs";
import path from "path";

// 1. Load environment variables
const envPath = path.resolve("./.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) {
      const val = m[2].trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[m[1].trim()]) {
        process.env[m[1].trim()] = val;
      }
    }
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL in environment or .env");
  process.exit(1);
}
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || "production";

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error("Missing PLAID_CLIENT_ID or PLAID_SECRET in .env");
  process.exit(1);
}

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV] || PlaidEnvironments.production,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfig);

// Helper for clean merchant title
function cleanPlaidName(merchant, rawName) {
  let name = (merchant || rawName || "Transaction").trim();
  // Strip trailing card numbers / store numbers
  name = name.replace(/\s+#\s*\d+/g, "");
  name = name.replace(/\s+\d{4,}$/g, "");
  // Capitalize nicely if all uppercase
  if (name === name.toUpperCase() && name.length > 3) {
    name = name
      .toLowerCase()
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return name.trim();
}

async function main() {
  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to Neon DB.");
  console.log(`Using Plaid Environment: ${PLAID_ENV}`);

  // Fetch accounts and map plaid_account_id -> internal account
  const accountsRes = await client.query('SELECT id, name, bank, type, household_id, plaid_item_id, plaid_account_id FROM accounts');
  const plaidAccToAccount = new Map();
  accountsRes.rows.forEach(a => {
    if (a.plaid_account_id) {
      plaidAccToAccount.set(a.plaid_account_id, a);
    }
  });
  console.log(`Mapped ${plaidAccToAccount.size} Plaid account IDs to local accounts.`);

  // Fetch all existing transactions in DB to avoid creating any duplicates
  const existingTxRes = await client.query(`
    SELECT id, title, merchant, amount, type, category, date, account_id, source, plaid_transaction_id, pending
    FROM transactions
  `);
  console.log(`Loaded ${existingTxRes.rows.length} existing transactions from Neon DB.`);

  const existingPlaidIds = new Set(existingTxRes.rows.map(t => t.plaid_transaction_id).filter(Boolean));
  const existingIds = new Set(existingTxRes.rows.map(t => t.id));

  // Build existing content map for fuzzy settlement checking
  const existingByAccount = new Map();
  for (const t of existingTxRes.rows) {
    if (!existingByAccount.has(t.account_id)) {
      existingByAccount.set(t.account_id, []);
    }
    existingByAccount.get(t.account_id).push(t);
  }

  // Fetch Plaid items
  const itemsRes = await client.query('SELECT id, item_id, access_token, bank_name, household_id FROM plaid_items');
  console.log(`Found ${itemsRes.rows.length} connected Plaid bank items.`);

  const startDate = new Date(Date.now() - 540 * 86400000).toISOString().slice(0, 10); // 1.5 years ago
  const endDate = new Date().toISOString().slice(0, 10);
  console.log(`Backfill period: ${startDate} to ${endDate} (last 540 days / 1.5 years)\n`);

  const newTransactionsToInsert = [];

  for (const item of itemsRes.rows) {
    console.log(`Fetching history for: ${item.bank_name} (${item.item_id.slice(0, 10)}...)...`);
    let offset = 0;
    const pageSize = 500;
    let totalForItem = Infinity;
    const itemFetchedTxs = [];

    while (offset < totalForItem) {
      try {
        const txRes = await plaidClient.transactionsGet({
          access_token: item.access_token,
          start_date: startDate,
          end_date: endDate,
          options: { count: pageSize, offset },
        });

        const page = txRes.data.transactions || [];
        totalForItem = txRes.data.total_transactions || page.length;
        itemFetchedTxs.push(...page);
        offset += page.length;
        if (page.length === 0) break;
      } catch (err) {
        const errMsg = err?.response?.data?.error_message || err?.message || String(err);
        console.warn(`  Warning fetching transactions for ${item.bank_name}: ${errMsg}`);
        break;
      }
    }

    console.log(`  Received ${itemFetchedTxs.length} transactions from ${item.bank_name} API.`);

    let addedFromItem = 0;
    for (const pt of itemFetchedTxs) {
      const localAccount = plaidAccToAccount.get(pt.account_id);
      if (!localAccount) continue; // Not mapped or belongs to an unlinked account
      if (localAccount.type === "investment") continue; // Investments handled separately

      const plaidTxId = pt.transaction_id;
      if (existingPlaidIds.has(plaidTxId)) continue; // Already in DB

      const amount = Math.abs(typeof pt.amount === "number" ? pt.amount : 0);
      const txType = (pt.amount > 0 ? "expense" : "income");
      const txDate = pt.authorized_date || pt.date || new Date().toISOString().slice(0, 10);
      const merchant = pt.merchant_name || "";
      const title = cleanPlaidName(merchant, pt.name);

      // Check if duplicate of an existing transaction in this account
      const accTxs = existingByAccount.get(localAccount.id) || [];
      const isDuplicate = accTxs.some((ex) => {
        if (Math.abs(ex.amount - amount) > 0.001) return false;
        const d1 = new Date(ex.date);
        const d2 = new Date(txDate);
        const diffDays = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 3) return false;

        const s1 = (ex.merchant || ex.title || "").toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        const s2 = (merchant || title).toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
        if (s1 === s2) return true;
        if (s1.includes(s2) || s2.includes(s1)) return true;

        const w1 = s1.split(/\s+/).filter(w => w.length >= 3 && !['the','inc','ltd','llc','corp','preauthorized','debit','retail','purchase'].includes(w));
        const w2 = s2.split(/\s+/).filter(w => w.length >= 3 && !['the','inc','ltd','llc','corp','preauthorized','debit','retail','purchase'].includes(w));
        return w1.some(w => w2.includes(w));
      });

      if (isDuplicate) {
        continue;
      }

      // Check against other transactions staged in newTransactionsToInsert
      const isDuplicateInBatch = newTransactionsToInsert.some((staged) => {
        if (staged.accountId !== localAccount.id) return false;
        if (Math.abs(staged.amount - amount) > 0.001) return false;
        const d1 = new Date(staged.date);
        const d2 = new Date(txDate);
        const diffDays = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 3;
      });

      if (isDuplicateInBatch) {
        continue;
      }

      const primaryCat = pt.personal_finance_category?.primary || (Array.isArray(pt.category) ? pt.category[0] : null) || "General";
      const category = primaryCat.charAt(0).toUpperCase() + primaryCat.slice(1).toLowerCase().replace(/_/g, " ");

      const newTx = {
        id: plaidTxId,
        householdId: localAccount.household_id || item.household_id,
        deviceId: "plaid-sync",
        accountId: localAccount.id,
        title,
        amount,
        type: txType,
        category,
        date: txDate,
        source: "plaid",
        merchant: merchant || title,
        plaidItemId: item.id,
        plaidAccountId: pt.account_id,
        bank: item.bank_name,
        plaidTransactionId: plaidTxId,
        pending: pt.pending || false,
        pendingTransactionId: pt.pending_transaction_id || null,
      };

      newTransactionsToInsert.push(newTx);
      addedFromItem++;
    }

    console.log(`  -> Identified ${addedFromItem} new historical transactions to backfill for ${item.bank_name}.`);
  }

  console.log(`\nTotal new historical transactions to insert: ${newTransactionsToInsert.length}`);

  if (newTransactionsToInsert.length > 0) {
    console.log("Inserting new historical transactions into Neon DB in batches...");
    await client.query("BEGIN");
    try {
      const batchSize = 100;
      let insertedCount = 0;
      for (let i = 0; i < newTransactionsToInsert.length; i += batchSize) {
        const batch = newTransactionsToInsert.slice(i, i + batchSize);
        for (const t of batch) {
          await client.query(`
            INSERT INTO transactions (
              id, household_id, device_id, account_id, title, amount, type, category, date,
              source, merchant, plaid_item_id, plaid_account_id, bank, plaid_transaction_id, pending, pending_transaction_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
            )
            ON CONFLICT (id) DO NOTHING
          `, [
            t.id, t.householdId, t.deviceId, t.accountId, t.title, t.amount, t.type, t.category, t.date,
            t.source, t.merchant, t.plaidItemId, t.plaidAccountId, t.bank, t.plaidTransactionId, t.pending, t.pendingTransactionId
          ]);
          insertedCount++;
        }
      }
      await client.query("COMMIT");
      console.log(`SUCCESS: Inserted ${insertedCount} historical transactions into Neon DB!`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Failed to insert transactions, rolled back:", err);
    }
  } else {
    console.log("All past transactions available from the banks are already in the database!");
  }

  // Final stats
  const finalCountRes = await client.query('SELECT count(*)::int as c FROM transactions');
  const dateRangeRes = await client.query('SELECT min(date) as min_date, max(date) as max_date FROM transactions');
  console.log(`\n=== FINAL DATABASE STATUS ===`);
  console.log(`Total transactions in DB: ${finalCountRes.rows[0].c}`);
  console.log(`Transaction Date Range: ${dateRangeRes.rows[0].min_date} to ${dateRangeRes.rows[0].max_date}`);

  await client.end();
}

main().catch(console.error);
