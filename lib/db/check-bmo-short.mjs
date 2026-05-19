import pg from "pg";
const db = new pg.Client({ connectionString: "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require", ssl: { rejectUnauthorized: false } });
await db.connect();
const r = await db.query(`SELECT id, bank, account_id, title, amount, date FROM transactions WHERE bank='BMO' AND household_id='ZE995F'`);
console.log("BMO (short) transactions:");
r.rows.forEach(row => console.log(`  ${row.date} | ${row.title} | $${row.amount} | acct=${row.account_id}`));

// Also show all accounts
const a = await db.query(`SELECT id, bank, name, type, last_four FROM accounts WHERE household_id='ZE995F' ORDER BY bank`);
console.log("\nAll accounts:");
a.rows.forEach(row => console.log(`  ${row.id} | ${row.bank} | ${row.name} | ${row.type} | ****${row.last_four??'?'}`));
await db.end();
