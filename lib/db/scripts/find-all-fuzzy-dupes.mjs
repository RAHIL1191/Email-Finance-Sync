import pg from "pg";
import { getDatabaseUrl } from "../get-db-url.mjs";

const { Client } = pg;
const DATABASE_URL = getDatabaseUrl();
if (!DATABASE_URL) {
  console.error("Missing DATABASE_URL. Please set DATABASE_URL or provide it in .env");
  process.exit(1);
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const accountsRes = await client.query('SELECT id, name, bank FROM accounts');
  const accountsMap = new Map(accountsRes.rows.map(a => [a.id, a]));

  const txRes = await client.query(`
    SELECT id, title, merchant, amount, type, category, date, account_id, source, bank, created_at, pending, plaid_transaction_id
    FROM transactions
    ORDER BY date DESC, created_at DESC
  `);
  
  console.log(`Total transactions in DB: ${txRes.rows.length}`);

  const visited = new Set();
  const duplicatePairs = [];

  for (let i = 0; i < txRes.rows.length; i++) {
    const tx1 = txRes.rows[i];
    if (visited.has(tx1.id)) continue;

    for (let j = i + 1; j < txRes.rows.length; j++) {
      const tx2 = txRes.rows[j];
      if (visited.has(tx2.id)) continue;

      // Must be same account
      if (tx1.account_id !== tx2.account_id) continue;
      // Must be same amount
      if (Math.abs(tx1.amount - tx2.amount) > 0.001) continue;

      // Date check: within 3 days (user noted 2-3 days gap)
      const d1 = new Date(tx1.date);
      const d2 = new Date(tx2.date);
      const diffDays = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) continue;

      // Title/merchant similarity
      const title1 = (tx1.merchant || tx1.title || "").toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
      const title2 = (tx2.merchant || tx2.title || "").toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
      const words1 = title1.split(/\s+/).filter(w => w.length >= 3);
      const words2 = title2.split(/\s+/).filter(w => w.length >= 3);

      const hasWordMatch = words1.some(w => words2.includes(w));
      const isSubstring = title1.includes(title2) || title2.includes(title1);

      if (isSubstring || hasWordMatch || (title1.slice(0, 5) === title2.slice(0, 5) && title1.length >= 4)) {
        duplicatePairs.push({
          primary: tx1,
          duplicate: tx2,
          diffDays,
          exactDate: tx1.date === tx2.date
        });
        visited.add(tx2.id);
      }
    }
  }

  console.log(`\n=== FOUND ${duplicatePairs.length} DUPLICATE TRANSACTIONS (including 1-3 day date gaps) ===`);
  const exactCount = duplicatePairs.filter(p => p.exactDate).length;
  const fuzzyDateCount = duplicatePairs.filter(p => !p.exactDate).length;
  console.log(` - Same date duplicates: ${exactCount}`);
  console.log(` - Different date (1-3 days gap) duplicates: ${fuzzyDateCount}`);

  console.log('\nSample of Duplicates Found:');
  duplicatePairs.slice(0, 25).forEach((p, idx) => {
    const acct = accountsMap.get(p.primary.account_id);
    console.log(`\n[#${idx + 1}] Account: ${acct ? acct.name : p.primary.account_id} | Gap: ${p.diffDays.toFixed(0)} days | Amount: $${p.primary.amount}`);
    console.log(`  Tx1 (KEEP): Date: ${p.primary.date} | Title: "${p.primary.title}" | Source: ${p.primary.source} | Pending: ${p.primary.pending} | Created: ${p.primary.created_at.toISOString()}`);
    console.log(`  Tx2 (DUPE): Date: ${p.duplicate.date} | Title: "${p.duplicate.title}" | Source: ${p.duplicate.source} | Pending: ${p.duplicate.pending} | Created: ${p.duplicate.created_at.toISOString()}`);
  });

  await client.end();
}

main().catch(console.error);
