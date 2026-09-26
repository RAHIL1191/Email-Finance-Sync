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

  console.log("Connected to Neon DB successfully!\n");

  // Query plaid items
  const itemsRes = await client.query(`
    SELECT id, item_id, bank_name, cursor, connected_at, last_synced_at
    FROM plaid_items
  `);

  console.log("=== ALL PLAID ITEMS ===");
  console.table(itemsRes.rows);

  // Query transaction counts grouped by plaid_item_id or bank
  const txCountsRes = await client.query(`
    SELECT plaid_item_id, bank, COUNT(*)::int as count
    FROM transactions
    GROUP BY plaid_item_id, bank
  `);

  console.log("\n=== TRANSACTION COUNTS IN DB ===");
  console.table(txCountsRes.rows);

  await client.end();
}

run().catch(console.error);
