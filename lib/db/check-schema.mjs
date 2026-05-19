import pg from "pg";
const { Client } = pg;

const TARGET = "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const SOURCE = process.env.SOURCE_DB_URL;

const t = new Client({ connectionString: TARGET, ssl: { rejectUnauthorized: false } });
await t.connect();
const cols = await t.query("SELECT column_name FROM information_schema.columns WHERE table_name='plaid_items' ORDER BY ordinal_position");
console.log("TARGET plaid_items columns:", cols.rows.map(r => r.column_name));

if (SOURCE) {
  const s = new Client({ connectionString: SOURCE, ssl: { rejectUnauthorized: false } });
  await s.connect();
  const scols = await s.query("SELECT column_name FROM information_schema.columns WHERE table_name='plaid_items' ORDER BY ordinal_position");
  console.log("SOURCE plaid_items columns:", scols.rows.map(r => r.column_name));
  // Check transactions
  const txcols = await s.query("SELECT column_name FROM information_schema.columns WHERE table_name='transactions' ORDER BY ordinal_position");
  console.log("SOURCE transactions columns:", txcols.rows.map(r => r.column_name));
  const txrows = await s.query("SELECT * FROM transactions LIMIT 2");
  console.log("SOURCE transactions count:", (await s.query("SELECT COUNT(*) FROM transactions")).rows[0].count);
  if (txrows.rows[0]) console.log("SOURCE tx sample keys:", Object.keys(txrows.rows[0]));
  await s.end();
}

await t.end();
