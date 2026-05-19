import pg from "pg";
const db = new pg.Client({
  connectionString: "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});
await db.connect();

// Move the 2 "BMO" (short) transactions into Primary Chequing Account
const r1 = await db.query(`
  UPDATE transactions
  SET account_id = 'p2grev1dmozy0uds', bank = 'BMO Bank of Montreal'
  WHERE account_id = 'f5ffrrdgmozy9qfd'
`);
console.log(`Moved ${r1.rowCount} transactions to Primary Chequing Account`);

// Delete the stale "BMO" placeholder account
const r2 = await db.query(`DELETE FROM accounts WHERE id = 'f5ffrrdgmozy9qfd'`);
console.log(`Deleted ${r2.rowCount} stale BMO account`);

await db.end();
console.log("Done");
