/**
 * One-time script to remove duplicate transactions from the database.
 *
 * Dedup key: account_id | round(amount * 100) | date(YYYY-MM-DD)
 * Keeps the highest-priority row:  plaid > manual > email,  posted > pending
 *
 * Usage:
 *   node scripts/dedup-transactions.mjs
 * or with a specific household:
 *   HOUSEHOLD_ID=XXXX node scripts/dedup-transactions.mjs
 */

import pg from "pg";
import path from "path";
import fs from "fs";

// ── Load .env from api-server ──────────────────────────────────────────────
const envPath = path.resolve("artifacts/api-server/.env");
try {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. Check artifacts/api-server/.env");
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const SOURCE_PRIORITY = { plaid: 3, manual: 2, email: 1 };
const score = (source, pending) =>
  (SOURCE_PRIORITY[source ?? ""] ?? 0) * 10 + (pending ? 0 : 1);

// Scope to a specific household or all
const HOUSEHOLD_FILTER = process.env.HOUSEHOLD_ID
  ? `WHERE household_id = '${process.env.HOUSEHOLD_ID}'`
  : "";

// 1. Fetch all transactions
const { rows } = await client.query(
  `SELECT id, household_id, account_id, amount, date, source, pending, plaid_transaction_id
   FROM transactions ${HOUSEHOLD_FILTER}
   ORDER BY household_id, account_id, date`
);

console.log(`Loaded ${rows.length} transactions from DB`);

// 2. Group by dedup key
const groups = new Map();
for (const row of rows) {
  const cents = Math.round((row.amount ?? 0) * 100);
  const dateDay = (row.date ?? "").slice(0, 10);
  const key = `${row.household_id}|${(row.account_id ?? "").toLowerCase()}|${cents}|${dateDay}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

// 3. Also group by plaid_transaction_id (within household)
const plaidGroups = new Map();
for (const row of rows) {
  if (!row.plaid_transaction_id) continue;
  const key = `${row.household_id}|${row.plaid_transaction_id}`;
  if (!plaidGroups.has(key)) plaidGroups.set(key, []);
  plaidGroups.get(key).push(row);
}

const toDelete = new Set();

// 4. For content-key duplicates: keep highest priority, mark rest for deletion
for (const [key, group] of groups) {
  if (group.length <= 1) continue;
  group.sort((a, b) => score(b.source, b.pending) - score(a.source, a.pending));
  const [winner, ...losers] = group;
  console.log(
    `  [content] keeping ${winner.id} (${winner.source}) → deleting ${losers.map(l => l.id).join(", ")}`
  );
  losers.forEach((l) => toDelete.add(l.id));
}

// 5. For plaid-id duplicates: keep highest priority, mark rest for deletion
for (const [key, group] of plaidGroups) {
  if (group.length <= 1) continue;
  group.sort((a, b) => score(b.source, b.pending) - score(a.source, a.pending));
  const [winner, ...losers] = group;
  losers.forEach((l) => {
    if (!toDelete.has(l.id)) {
      console.log(`  [plaidId] keeping ${winner.id} → deleting ${l.id}`);
      toDelete.add(l.id);
    }
  });
}

if (toDelete.size === 0) {
  console.log("\n✅ No duplicates found — DB is clean.");
} else {
  console.log(`\nDeleting ${toDelete.size} duplicate rows...`);
  const ids = Array.from(toDelete);
  // Delete in batches of 100
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const placeholders = batch.map((_, j) => `$${j + 1}`).join(",");
    await client.query(`DELETE FROM transactions WHERE id IN (${placeholders})`, batch);
  }
  console.log(`✅ Deleted ${toDelete.size} duplicates.`);
}

await client.end();
