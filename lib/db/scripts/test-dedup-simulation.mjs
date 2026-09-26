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

  // 1. Exact duplicates: same account_id, date, amount, title
  const exactDupesToDelete = new Set();
  const exactSeen = new Map();
  for (const t of txRes.rows) {
    const key = `${t.account_id}|${t.date}|${t.amount.toFixed(2)}|${t.title.trim().toLowerCase()}`;
    if (exactSeen.has(key)) {
      exactDupesToDelete.add(t.id);
    } else {
      exactSeen.set(key, t.id);
    }
  }

  // 2. Pending vs posted / 1-3 day settlement duplicates
  const nonExact = txRes.rows.filter(t => !exactDupesToDelete.has(t.id));
  const settlementDupesToDelete = new Set();
  const visited = new Set();

  for (let i = 0; i < nonExact.length; i++) {
    const t1 = nonExact[i];
    if (visited.has(t1.id) || settlementDupesToDelete.has(t1.id)) continue;

    for (let j = i + 1; j < nonExact.length; j++) {
      const t2 = nonExact[j];
      if (visited.has(t2.id) || settlementDupesToDelete.has(t2.id)) continue;

      if (t1.account_id !== t2.account_id) continue;
      if (Math.abs(t1.amount - t2.amount) > 0.001) continue;

      const d1 = new Date(t1.date);
      const d2 = new Date(t2.date);
      const diffDays = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 3) continue;

      const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, " ").trim();
      const s1 = norm(t1.merchant || t1.title);
      const s2 = norm(t2.merchant || t2.title);

      // Clean check: exclude generic titles like "e-transfer" where names differ
      const isETransfer1 = s1.includes("e transfer") || s1.includes("etransfer");
      const isETransfer2 = s2.includes("e transfer") || s2.includes("etransfer");
      if (isETransfer1 && isETransfer2 && diffDays > 0) {
        // Only duplicate if the recipient/sender name matches
        const name1 = s1.replace(/.*e\s*transfer\s*\d*\s*/, "").trim();
        const name2 = s2.replace(/.*e\s*transfer\s*\d*\s*/, "").trim();
        if (name1 && name2 && name1 !== name2 && !name1.includes(name2) && !name2.includes(name1)) {
          continue; // Different persons!
        }
      }

      // Check merchant match
      const w1 = s1.split(/\s+/).filter(w => w.length >= 3 && !['the','inc','ltd','llc','corp','preauthorized','debit','retail','purchase'].includes(w));
      const w2 = s2.split(/\s+/).filter(w => w.length >= 3 && !['the','inc','ltd','llc','corp','preauthorized','debit','retail','purchase'].includes(w));
      
      const commonWords = w1.filter(w => w2.includes(w));
      const match = s1 === s2 || (commonWords.length >= 1 && (s1.includes(s2) || s2.includes(s1) || commonWords[0].length >= 4));

      if (match) {
        // Keep posted or more recent created_at
        let keep = t1;
        let discard = t2;
        if (t1.pending && !t2.pending) {
          keep = t2;
          discard = t1;
        } else if (t1.created_at < t2.created_at) {
          keep = t2;
          discard = t1;
        }

        settlementDupesToDelete.add(discard.id);
        visited.add(discard.id);
        const acct = accountsMap.get(keep.account_id);
        console.log(`Settlement match (${diffDays.toFixed(0)}d gap, $${keep.amount}, ${acct?.name}):`);
        console.log(`  KEEP : [${keep.date}] "${keep.title}"`);
        console.log(`  DUPE : [${discard.date}] "${discard.title}"`);
      }
    }
  }

  console.log(`\n=== SUMMARY OF DUPLICATES TO REMOVE ===`);
  console.log(`Total DB transactions: ${txRes.rows.length}`);
  console.log(`Exact same-date duplicates: ${exactDupesToDelete.size}`);
  console.log(`Settlement (1-3 day gap) duplicates: ${settlementDupesToDelete.size}`);
  console.log(`Total duplicate rows to remove: ${exactDupesToDelete.size + settlementDupesToDelete.size}`);
  console.log(`Clean transactions remaining: ${txRes.rows.length - (exactDupesToDelete.size + settlementDupesToDelete.size)}`);

  await client.end();
}

main().catch(console.error);
