import pg from "pg";

const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function run() {
  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to Neon DB successfully!");

  // Query accounts
  const accountsRes = await client.query(`
    SELECT id, name, bank, type, last_four FROM accounts
  `);
  const accountsMap = new Map(accountsRes.rows.map(a => [a.id, a]));

  // Query all transactions
  const txRes = await client.query(`
    SELECT id, title, amount, type, category, date, account_id, source, bank, note, created_at
    FROM transactions
    ORDER BY date DESC
  `);

  console.log(`Total transactions in DB: ${txRes.rows.length}`);

  // Find duplicates across different accounts or same account
  // Key by amount + date + title (cleaned)
  const grouped = {};
  txRes.rows.forEach(tx => {
    const titleKey = tx.title.toLowerCase().replace(/[^a-z0-9]/g, "").trim().slice(0, 10);
    const key = `${tx.date}|${tx.amount.toFixed(2)}|${titleKey}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tx);
  });

  const duplicateGroups = Object.entries(grouped)
    .filter(([_, group]) => group.length > 1)
    .sort((a, b) => b[0].localeCompare(a[0]));

  console.log(`\n=== FOUND ${duplicateGroups.length} DUPLICATE GROUPS IN DB ===`);
  
  duplicateGroups.slice(0, 30).forEach(([key, group], idx) => {
    console.log(`\nGroup ${idx + 1}: Key: ${key}`);
    group.forEach(tx => {
      const acct = accountsMap.get(tx.account_id);
      console.log(`  - ID: ${tx.id} | Acct: ${acct ? acct.name : tx.account_id} (${acct ? acct.bank : '?'}) | Source: ${tx.source} | Bank Field: ${tx.bank} | Created: ${tx.created_at.toISOString()}`);
    });
  });

  await client.end();
}

run().catch(console.error);
