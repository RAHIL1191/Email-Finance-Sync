import pg from "pg";
const { Client } = pg;
const c = new Client({
  connectionString: "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});
await c.connect();
const r = await c.query(`SELECT title, bank, amount, date FROM transactions WHERE device_id='migrate-script' ORDER BY date DESC LIMIT 30`);
r.rows.forEach(row => console.log(`${row.date}  $${row.amount}  title="${row.title}"  bank="${row.bank}"`));
await c.end();
