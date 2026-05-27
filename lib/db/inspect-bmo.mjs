import pg from "pg";

const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to Neon DB successfully!\n");

  // 1. Check all BMO accounts
  const accountsRes = await client.query(`
    SELECT id, name, bank, type, last_four, balance, plaid_item_id, plaid_account_id
    FROM accounts
    WHERE bank ILIKE '%bmo%' OR name ILIKE '%bmo%'
  `);

  console.log("=== BMO ACCOUNTS ===");
  console.table(accountsRes.rows);

  const accountIds = accountsRes.rows.map(r => r.id);
  if (accountIds.length === 0) {
    console.log("No BMO accounts found in DB!");
    await client.end();
    return;
  }

  // 2. All BMO transactions — look for duplicates
  const txRes = await client.query(`
    SELECT id, title, amount, type, category, date, account_id, plaid_account_id, plaid_item_id, source, bank, created_at
    FROM transactions
    WHERE account_id = ANY($1)
    ORDER BY date DESC, amount DESC
  `, [accountIds]);

  console.log(`\n=== BMO TRANSACTIONS (Total: ${txRes.rows.length}) ===`);

  // 3. Group by amount + date to find duplicates  
  const grouped = {};
  txRes.rows.forEach(tx => {
    const key = `${tx.date}|${tx.amount.toFixed(2)}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tx);
  });

  const duplicatesByAmountDate = Object.entries(grouped)
    .filter(([_, group]) => group.length > 1)
    .sort((a, b) => b[0].localeCompare(a[0]));

  console.log(`\n=== POTENTIAL DUPLICATES by amount+date (${duplicatesByAmountDate.length} groups) ===`);
  duplicatesByAmountDate.slice(0, 30).forEach(([key, group], idx) => {
    console.log(`\nGroup ${idx + 1}: Key=${key}`);
    group.forEach(tx => {
      const acct = accountsRes.rows.find(a => a.id === tx.account_id);
      console.log(`  ID: ${tx.id.slice(0, 20)}... | Title: ${tx.title.slice(0, 30)} | Date: ${tx.date} | $${tx.amount} | Acct: ${acct?.name || tx.account_id} | Source: ${tx.source} | Created: ${tx.created_at?.toISOString?.()}`);
    });
  });

  // 4. Look for same-title different-date pairs (pending→posted duplicates)
  const byTitleAmount = {};
  txRes.rows.forEach(tx => {
    const key = `${tx.amount.toFixed(2)}|${tx.title.trim().toLowerCase().slice(0, 20)}`;
    if (!byTitleAmount[key]) byTitleAmount[key] = [];
    byTitleAmount[key].push(tx);
  });

  const pendingPostDups = Object.entries(byTitleAmount)
    .filter(([_, group]) => {
      if (group.length < 2) return false;
      const dates = [...new Set(group.map(t => t.date))];
      return dates.length > 1; // same amount+title but DIFFERENT dates → pending/posted dup
    })
    .sort((a, b) => b[0].localeCompare(a[0]));

  console.log(`\n=== PENDING→POSTED DUPLICATES (same amount+title, DIFFERENT dates): ${pendingPostDups.length} groups ===`);
  pendingPostDups.slice(0, 30).forEach(([key, group], idx) => {
    console.log(`\nGroup ${idx + 1}: Key=${key}`);
    group.forEach(tx => {
      console.log(`  ID: ${tx.id.slice(0, 25)}... | Title: ${tx.title.slice(0, 30)} | Date: ${tx.date} | $${tx.amount} | Source: ${tx.source} | Created: ${tx.created_at?.toISOString?.()}`);
    });
  });

  // 5. Show last 20 transactions (most recent) to see what's happening
  console.log(`\n=== LAST 20 BMO TRANSACTIONS ===`);
  txRes.rows.slice(0, 20).forEach(tx => {
    console.log(`  ${tx.date} | $${tx.amount.toFixed(2).padStart(8)} | ${tx.type.padEnd(7)} | ${tx.title.slice(0, 35).padEnd(35)} | ID: ${tx.id.slice(0, 25)} | Source: ${tx.source}`);
  });

  // 6. Check total transactions vs total after dedup (by amount + date + accountId)
  const dedupKeys = new Map();
  let dupCount = 0;
  txRes.rows.forEach(tx => {
    const key = `${tx.account_id}|${tx.amount}|${tx.date}`;
    if (!dedupKeys.has(key)) {
      dedupKeys.set(key, []);
    }
    dedupKeys.get(key).push(tx);
  });

  console.log(`\n=== DEDUP SUMMARY ===`);
  console.log(`Total BMO transactions: ${txRes.rows.length}`);
  console.log(`Unique by dedupKey (accountId|amount|date): ${dedupKeys.size}`);
  
  for (const [key, txs] of dedupKeys.entries()) {
    if (txs.length > 1) {
      dupCount += txs.length - 1;
      console.log(`Duplicate Key: ${key}`);
      txs.forEach(tx => {
        console.log(`  ID: ${tx.id} | Title: ${tx.title} | Source: ${tx.source} | Created: ${tx.created_at?.toISOString?.()}`);
      });
    }
  }
  console.log(`Duplicates by dedupKey: ${dupCount}`);

  // 7. Check plaid_items for BMO
  const plaidRes = await client.query(`
    SELECT id, item_id, bank_name, cursor, connected_at, last_synced_at
    FROM plaid_items
    WHERE bank_name ILIKE '%bmo%'
  `);
  console.log(`\n=== BMO PLAID ITEMS ===`);
  console.table(plaidRes.rows);

  await client.end();
}

run().catch(console.error);
