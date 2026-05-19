import pg from 'pg';
const db = new pg.Client({
  connectionString: 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  ssl: { rejectUnauthorized: false }
});
await db.connect();
const { rows } = await db.query('SELECT household_id, COUNT(*) as items FROM plaid_items GROUP BY household_id');
console.log('Plaid items by householdId:', JSON.stringify(rows, null, 2));
const { rows: txRows } = await db.query('SELECT household_id, COUNT(*) as txns FROM transactions GROUP BY household_id ORDER BY txns DESC LIMIT 5');
console.log('Transactions by householdId:', JSON.stringify(txRows, null, 2));
await db.end();
