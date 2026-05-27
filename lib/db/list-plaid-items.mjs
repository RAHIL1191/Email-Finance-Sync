import pg from "pg";

const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

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
