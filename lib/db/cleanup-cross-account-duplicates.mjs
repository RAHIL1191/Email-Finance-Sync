import pg from "pg";
import { getDatabaseUrl } from "./get-db-url.mjs";

const DATABASE_URL = getDatabaseUrl();
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL. Please set DATABASE_URL or provide it in .env");
  process.exit(1);
}

async function run() {
  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to database successfully!");

  // Start transaction
  await client.query("BEGIN");

  try {
    // 1. Fetch all plaid items (active connections)
    const plaidItemsRes = await client.query("SELECT id, item_id, bank_name FROM plaid_items");
    const activePlaidItemIds = new Set(plaidItemsRes.rows.map(item => item.id));
    console.log(`Active Plaid Items in DB: ${plaidItemsRes.rows.length}`);

    // 2. Fetch all accounts and mark active vs legacy
    const accountsRes = await client.query("SELECT id, name, bank, type, balance, plaid_item_id, plaid_account_id FROM accounts");
    const accountsMap = new Map(accountsRes.rows.map(a => [a.id, a]));
    
    // An account is active if:
    // - it has a plaid_item_id which is in the active plaid_items list, OR
    // - it's a manual/email account with active/valid usage (we'll check usage or treat all manual accounts as active, but prioritize Plaid accounts on collision)
    const isAccountLinked = (a) => a.plaid_item_id && activePlaidItemIds.has(a.plaid_item_id);

    console.log(`Accounts in DB: ${accountsRes.rows.length}`);

    // 3. Fetch all transactions
    const txRes = await client.query(`
      SELECT id, title, amount, type, category, date, account_id, source, bank, note, created_at, plaid_item_id, plaid_account_id
      FROM transactions
      ORDER BY date DESC, created_at DESC
    `);
    console.log(`Total transactions in DB: ${txRes.rows.length}`);

    // Group transactions by date + amount + cleaned title
    const grouped = {};
    txRes.rows.forEach(tx => {
      const titleKey = tx.title.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
      const key = `${tx.date}|${tx.amount.toFixed(2)}|${titleKey}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(tx);
    });

    const duplicateGroups = Object.entries(grouped)
      .filter(([_, group]) => group.length > 1);

    console.log(`\n=== PROCESSING ${duplicateGroups.length} DUPLICATE GROUPS ===`);

    const toDeleteIds = [];

    for (const [key, group] of duplicateGroups) {
      // Score each transaction in the group to find the best one to keep
      const scored = group.map(tx => {
        const acct = accountsMap.get(tx.account_id);
        let score = 0;

        if (acct) {
          score += 10; // Has a valid account in accounts table
          if (isAccountLinked(acct)) {
            score += 20; // Account is linked to an active Plaid item
          }
          if (acct.bank && acct.bank.toLowerCase().includes("tangerine")) {
            score += 5; // Tangerine credit card/checking matches specific bank interest
          }
        }

        if (tx.source === "plaid") {
          score += 15; // Has Plaid source
        } else if (tx.source === "email") {
          score += 5; // Has email source
        }

        if (tx.bank && tx.bank.trim().length > 0) {
          score += 5; // Has bank tag populated
        }

        if (tx.plaid_account_id) {
          score += 10; // Has raw Plaid account ID mapping
        }

        // De-prioritize if the account is known to be duplicate or legacy (e.g. plaid_item_id is set but item is deleted)
        if (acct && acct.plaid_item_id && !activePlaidItemIds.has(acct.plaid_item_id)) {
          score -= 15;
        }

        return { tx, score, acct };
      });

      // Sort by score descending (highest score first)
      scored.sort((a, b) => b.score - a.score);

      const keep = scored[0];
      const duplicates = scored.slice(1);

      console.log(`\nDuplicate Group for Key: ${key}`);
      console.log(`  KEEP: ID ${keep.tx.id} | Score: ${keep.score} | Acct: ${keep.acct ? keep.acct.name : 'Unknown'} (${keep.acct ? keep.acct.bank : '?'}) | Bank Field: ${keep.tx.bank} | Source: ${keep.tx.source}`);
      
      duplicates.forEach(dup => {
        console.log(`  DELETE: ID ${dup.tx.id} | Score: ${dup.score} | Acct: ${dup.acct ? dup.acct.name : 'Unknown'} (${dup.acct ? dup.acct.bank : '?'}) | Bank Field: ${dup.tx.bank} | Source: ${dup.tx.source}`);
        toDeleteIds.push(dup.tx.id);
      });
    }

    if (toDeleteIds.length > 0) {
      console.log(`\nPruning ${toDeleteIds.length} duplicate transactions from database...`);
      const pruneRes = await client.query(`
        DELETE FROM transactions WHERE id = ANY($1)
      `, [toDeleteIds]);
      console.log(`Successfully deleted ${pruneRes.rowCount} cross-account duplicate transactions.`);
    } else {
      console.log("\nNo duplicates to delete.");
    }

    await client.query("COMMIT");
    console.log("\nDatabase cleanup committed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error during database cleanup, rolled back transaction:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
