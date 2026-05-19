import pg from "pg";
const db = new pg.Client({
  connectionString: "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});
await db.connect();

const { rows: txRows } = await db.query(`SELECT COUNT(*) as count FROM transactions WHERE household_id = 'ZE995F'`);
console.log('Transactions for ZE995F:', txRows[0].count);

const { rows: plaidRows } = await db.query(`SELECT id, bank_name, item_id FROM plaid_items WHERE household_id = 'ZE995F'`);
console.log('Plaid items for ZE995F:', JSON.stringify(plaidRows));

const { rows: acctRows } = await db.query(`SELECT COUNT(*) as count FROM accounts WHERE household_id = 'ZE995F'`);
console.log('Accounts for ZE995F:', acctRows[0].count);

await db.end();
