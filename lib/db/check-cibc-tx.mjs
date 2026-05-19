import pg from "pg";
const db = new pg.Client({
  connectionString: "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});
await db.connect();

// Show all columns for CIBC transactions
const r = await db.query(`
  SELECT id, title, amount, date, account_id, bank, note, device_id, from_email
  FROM transactions
  WHERE household_id = 'ZE995F' AND bank ILIKE '%cibc%'
  ORDER BY date DESC
`);
console.log(`CIBC transactions (${r.rows.length}):`);
r.rows.forEach(row => console.log(`  ${String(row.date).slice(0,10)} | ${row.title} | $${row.amount} | acct=${row.account_id} | note=${row.note} | device=${row.device_id} | email=${row.from_email}`));

await db.end();
