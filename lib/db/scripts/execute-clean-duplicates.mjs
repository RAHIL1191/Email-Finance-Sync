import pg from "pg";
const { Client } = pg;
const DATABASE_URL = 'postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

async function main() {
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log("Connected to Neon DB.");

  const txRes = await client.query(`
    SELECT id, title, merchant, amount, type, category, date, account_id, source, bank, created_at, pending, plaid_transaction_id
    FROM transactions
    ORDER BY date DESC, created_at DESC
  `);

  console.log(`Current total transactions in DB: ${txRes.rows.length}`);

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
      }
    }
  }

  const allToDelete = Array.from(new Set([...Array.from(exactDupesToDelete), ...Array.from(settlementDupesToDelete)]));
  console.log(`Found ${allToDelete.length} duplicates to delete (${exactDupesToDelete.size} exact + ${settlementDupesToDelete.size} settlement gap).`);

  if (allToDelete.length === 0) {
    console.log("No duplicates to delete. Exiting.");
    await client.end();
    return;
  }

  await client.query("BEGIN");
  try {
    const chunkSize = 50;
    let totalDeleted = 0;
    for (let i = 0; i < allToDelete.length; i += chunkSize) {
      const chunk = allToDelete.slice(i, i + chunkSize);
      const res = await client.query(`
        DELETE FROM transactions
        WHERE id = ANY($1)
      `, [chunk]);
      totalDeleted += res.rowCount;
    }

    await client.query("COMMIT");
    console.log(`SUCCESS: Successfully deleted ${totalDeleted} duplicate transaction records from Neon DB!`);

    const finalCountRes = await client.query('SELECT count(*)::int as c FROM transactions');
    console.log(`Final remaining verified transactions in DB: ${finalCountRes.rows[0].c}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Failed to delete duplicates, rolled back:", err);
  } finally {
    await client.end();
  }
}

main().catch(console.error);
