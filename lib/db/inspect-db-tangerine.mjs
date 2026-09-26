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

  // Query bills matching amount 20 or title 'Electricity'
  const billsRes = await client.query(`
    SELECT id, title, amount, due_date, account_id, is_paid, is_recurring, frequency, created_at
    FROM bills
    WHERE amount = 20.00 OR title ILIKE '%Electricity%'
  `);

  console.log(`\n=== MATCHING BILLS (Total: ${billsRes.rows.length}) ===`);
  console.table(billsRes.rows);

  await client.end();
}

run().catch(console.error);
