import pg from "pg";

const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to Neon DB successfully!");

  // Query accounts
  const accountsRes = await client.query(`
    SELECT id, name, bank, type, last_four, balance, plaid_item_id, plaid_account_id
    FROM accounts
    WHERE bank ILIKE '%wealth%' OR name ILIKE '%wealth%'
  `);

  console.log("\n=== WEALTHSIMPLE ACCOUNTS ===");
  console.table(accountsRes.rows);

  const accountIds = accountsRes.rows.map(r => r.id);
  if (accountIds.length === 0) {
    console.log("No Wealthsimple accounts found in DB!");
    await client.end();
    return;
  }

  // Query transactions for these accounts
  const txRes = await client.query(`
    SELECT id, title, amount, type, category, date, account_id, plaid_account_id, source
    FROM transactions
    WHERE account_id = ANY($1)
    ORDER BY date DESC, amount DESC
  `, [accountIds]);

  console.log(`\n=== WEALTHSIMPLE TRANSACTIONS (Total: ${txRes.rows.length}) ===`);
  
  // Group by title, amount, date to find duplicates
  const grouped = {};
  txRes.rows.forEach(tx => {
    const key = `${tx.date}|${tx.amount}|${tx.title.trim().toLowerCase()}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tx);
  });

  const duplicates = Object.values(grouped).filter(group => group.length > 1);
  console.log(`\n=== FOUND DUPLICATE BUNDLES (Total duplicate groups: ${duplicates.length}) ===`);
  duplicates.forEach((group, idx) => {
    console.log(`\nGroup ${idx + 1}: ${group[0].date} | $${group[0].amount} | ${group[0].title}`);
    group.forEach(tx => {
      const acct = accountsRes.rows.find(a => a.id === tx.account_id);
      console.log(`  - Tx ID: ${tx.id} | Acct: ${acct ? acct.name : tx.account_id} (${acct ? acct.type : '?'}) | Plaid Account ID: ${tx.plaid_account_id} | Source: ${tx.source}`);
    });
  });

  await client.end();
}

run().catch(console.error);
