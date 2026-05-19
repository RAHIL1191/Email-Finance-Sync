import pg from "pg";
const db = new pg.Client({
  connectionString: "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});
await db.connect();

// Count by source and from_email
const counts = await db.query(`
  SELECT device_id, from_email, COUNT(*) as cnt,
         COUNT(DISTINCT bank) as banks,
         STRING_AGG(DISTINCT bank, ', ' ORDER BY bank) as bank_list
  FROM transactions
  GROUP BY device_id, from_email
  ORDER BY cnt DESC
`);
console.log("Transactions by device_id/from_email:");
for (const r of counts.rows) {
  console.log(`  device=${r.device_id} | from_email=${r.from_email} | count=${r.cnt} | banks=${r.bank_list}`);
}

// Show sample of non-BMO transactions
const samples = await db.query(`
  SELECT id, device_id, bank, account_id, from_email, title, amount, date
  FROM transactions
  WHERE bank NOT ILIKE '%bmo%' OR bank IS NULL
  LIMIT 10
`);
console.log(`\nSample non-BMO transactions (${samples.rows.length}):`);
for (const r of samples.rows) {
  console.log(`  [${r.date}] ${r.bank} | ${r.title} | $${r.amount} | acct=${r.account_id} | from_email=${r.from_email}`);
}

await db.end();
