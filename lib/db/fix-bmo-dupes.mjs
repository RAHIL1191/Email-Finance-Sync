import pg from "pg";
import path from "path";
import fs from "fs";

const { Client } = pg;
const envPath = path.resolve("../../artifacts/api-server/.env");
try {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Get ALL BMO credit card transactions with full details
const { rows } = await client.query(`
  SELECT id, title, amount, date, source, pending, plaid_transaction_id, created_at
  FROM transactions
  WHERE account_id = 'mphtc4rt1ax9i4m'
  ORDER BY title, amount, date, created_at
`);

console.log(`\nTotal BMO credit card rows: ${rows.length}`);

// Find duplicates by title+amount (even if dates differ slightly)
const byTitleAmount = new Map();
for (const row of rows) {
  const key = `${row.title}|${Math.round(row.amount * 100)}`;
  if (!byTitleAmount.has(key)) byTitleAmount.set(key, []);
  byTitleAmount.get(key).push(row);
}

const toDelete = [];
console.log("\n=== DUPLICATES FOUND ===");
for (const [key, group] of byTitleAmount) {
  if (group.length <= 1) continue;
  // Sort: prefer earlier created_at (older entry), prefer non-pending
  group.sort((a, b) => {
    if (a.pending !== b.pending) return a.pending ? 1 : -1; // posted first
    return new Date(a.created_at) - new Date(b.created_at); // older first
  });
  const [winner, ...losers] = group;
  console.log(`\n  KEEP:   ${winner.id} | "${winner.title}" | $${winner.amount} | ${winner.date} | pending=${winner.pending} | plaid_id=${winner.plaid_transaction_id}`);
  losers.forEach(l => {
    console.log(`  DELETE: ${l.id} | "${l.title}" | $${l.amount} | ${l.date} | pending=${l.pending} | plaid_id=${l.plaid_transaction_id}`);
    toDelete.push(l.id);
  });
}

if (toDelete.length === 0) {
  console.log("  None found by title+amount match.");
} else {
  console.log(`\nDeleting ${toDelete.length} duplicate rows...`);
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const placeholders = batch.map((_, j) => `$${j + 1}`).join(",");
    await client.query(`DELETE FROM transactions WHERE id IN (${placeholders})`, batch);
  }
  console.log(`✅ Deleted ${toDelete.length} duplicates from BMO credit card.`);
}

await client.end();
