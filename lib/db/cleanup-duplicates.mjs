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

  console.log("Connected to Neon DB successfully!");

  // Start transaction
  await client.query("BEGIN");

  try {
    // 1. Find and delete standard transactions associated with investment accounts
    const accountsRes = await client.query(`
      SELECT id, name, bank, type FROM accounts WHERE type = 'investment'
    `);
    
    console.log(`Found ${accountsRes.rows.length} investment accounts.`);
    const accountIds = accountsRes.rows.map(r => r.id);

    if (accountIds.length > 0) {
      const deleteRes = await client.query(`
        DELETE FROM transactions WHERE account_id = ANY($1)
      `, [accountIds]);
      console.log(`Deleted ${deleteRes.rowCount} regular transactions from investment accounts.`);
    }

    // 2. Deduplicate duplicate transactions in checking/savings/credit accounts
    // Keeps only one transaction if they share the exact same account_id, amount, date, and title.
    const dupRes = await client.query(`
      DELETE FROM transactions t1
      USING transactions t2
      WHERE t1.id > t2.id
        AND t1.account_id = t2.account_id
        AND t1.amount = t2.amount
        AND t1.date = t2.date
        AND t1.title = t2.title
    `);
    
    console.log(`Deduplicated ${dupRes.rowCount} duplicate transaction entries in other accounts.`);

    await client.query("COMMIT");
    console.log("\nTransaction committed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error during cleanup, rolling back transaction:", error);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
