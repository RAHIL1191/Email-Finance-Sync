import pg from "pg";
const { Client } = pg;
const c = new Client({
  connectionString: "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});
await c.connect();
const r = await c.query(`SELECT id, name, bank, type, last_four FROM accounts LIMIT 20`);
console.log(`Accounts in DB: ${r.rows.length}`);
r.rows.forEach(row => console.log(` - ${row.type} | ${row.bank} | ${row.name} | ****${row.last_four ?? ""}`));
await c.end();
