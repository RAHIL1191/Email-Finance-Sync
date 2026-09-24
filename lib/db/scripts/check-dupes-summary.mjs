import pg from "pg";
const { Client } = pg;
const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const count = await client.query('SELECT count(*)::int as c FROM transactions');
  console.log('Total transactions in DB:', count.rows[0].c);

  // 1. Same account exact duplicates: same account_id, amount, date, title
  const sameAccDupes = await client.query(`
    SELECT count(*)::int as c FROM (
      SELECT account_id, date, amount, title, count(*)
      FROM transactions
      GROUP BY account_id, date, amount, title
      HAVING count(*) > 1
    ) sub
  `);
  console.log('Duplicate groups within SAME account (exact same account_id, date, amount, title):', sameAccDupes.rows[0].c);

  const redundantSameAcc = await client.query(`
    SELECT sum(cnt - 1)::int as redundant FROM (
      SELECT account_id, date, amount, title, count(*) as cnt
      FROM transactions
      GROUP BY account_id, date, amount, title
      HAVING count(*) > 1
    ) sub
  `);
  console.log('Total redundant duplicate rows within SAME account to remove:', redundantSameAcc.rows[0].redundant);

  // 2. Breakdown by account for same-account duplicates
  const perAccountDupes = await client.query(`
    SELECT a.name, a.bank, count(t.id) as dupe_count
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    WHERE EXISTS (
      SELECT 1 FROM transactions t2
      WHERE t2.id < t.id
        AND t2.account_id = t.account_id
        AND t2.amount = t.amount
        AND t2.date = t.date
        AND t2.title = t.title
    )
    GROUP BY a.name, a.bank
    ORDER BY dupe_count DESC
  `);
  console.log('\nDuplicates by Account:');
  perAccountDupes.rows.forEach(r => {
    console.log(` - ${r.name} (${r.bank}): ${r.dupe_count} duplicates`);
  });

  // 3. Date range of transactions in DB
  const dateRange = await client.query(`
    SELECT MIN(date) as min_date, MAX(date) as max_date FROM transactions
  `);
  console.log(`\nTransaction Date Range in DB: from ${dateRange.rows[0].min_date} to ${dateRange.rows[0].max_date}`);

  // 4. Sources in DB
  const sources = await client.query(`
    SELECT source, count(*)::int as cnt FROM transactions GROUP BY source
  `);
  console.log('\nTransactions by Source:');
  sources.rows.forEach(s => {
    console.log(` - ${s.source || 'null'}: ${s.cnt}`);
  });

  // 5. Plaid Items in DB
  const plaidItems = await client.query(`
    SELECT item_id, bank_name, status, last_synced, (cursor IS NOT NULL AND cursor != '') as has_cursor
    FROM plaid_items
  `);
  console.log('\nPlaid Items in DB:');
  plaidItems.rows.forEach(p => {
    console.log(` - ${p.bank_name} | item: ${p.item_id} | status: ${p.status} | lastSynced: ${p.last_synced} | hasCursor: ${p.has_cursor}`);
  });

  await client.end();
}

main().catch(console.error);
