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

  console.log("Connected to database.");

  // Query all transactions
  const txRes = await client.query(`
    SELECT id, title, amount, type, category, date, account_id, source, bank, created_at
    FROM transactions
  `);

  const grouped = {};
  txRes.rows.forEach(tx => {
    const titleKey = tx.title.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
    const key = `${tx.date}|${tx.amount.toFixed(2)}|${titleKey}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tx);
  });

  const dupGroups = Object.entries(grouped).filter(([_, group]) => group.length > 1);

  console.log(`\n=== REMAINING DUPLICATE GROUPS IN ENTIRE DATABASE: ${dupGroups.length} ===`);
  
  if (dupGroups.length > 0) {
    dupGroups.slice(0, 10).forEach(([key, group], idx) => {
      console.log(`\nGroup ${idx + 1}: ${key}`);
      group.forEach(tx => {
        console.log(`  - ID: ${tx.id} | Acct ID: ${tx.account_id} | Source: ${tx.source} | Bank Field: ${tx.bank}`);
      });
    });
  } else {
    console.log("🎉 SUCCESS: No duplicate transactions found anywhere in the database!");
  }

  await client.end();
}

run().catch(console.error);
