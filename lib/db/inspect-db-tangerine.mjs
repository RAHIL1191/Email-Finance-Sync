import pg from "pg";

const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

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
