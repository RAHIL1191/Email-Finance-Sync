/**
 * One-time dedup script — removes duplicate transactions from the DB.
 * Run from lib/db:  node dedup-transactions.mjs
 */
import pg from "pg";
import path from "path";
import fs from "fs";

const { Client } = pg;

// Load DATABASE_URL from api-server .env
const envPath = path.resolve("../../artifacts/api-server/.env");
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

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
console.log("Connected to DB");

const SOURCE_PRIORITY = { plaid: 3, manual: 2, email: 1 };
const score = (source, pending) =>
  (SOURCE_PRIORITY[source ?? ""] ?? 0) * 10 + (pending ? 0 : 1);

const { rows } = await client.query(
  `SELECT id, household_id, account_id, amount, date, source, pending, plaid_transaction_id
   FROM transactions ORDER BY household_id, account_id, date`
);
console.log(`Loaded ${rows.length} transactions`);

const toDelete = new Set();

// Group by content key and mark lower-priority dupes
const contentGroups = new Map();
for (const row of rows) {
  const cents = Math.round((row.amount ?? 0) * 100);
  const key = `${row.household_id}|${(row.account_id ?? "").toLowerCase()}|${cents}|${(row.date ?? "").slice(0, 10)}`;
  if (!contentGroups.has(key)) contentGroups.set(key, []);
  contentGroups.get(key).push(row);
}
for (const [, group] of contentGroups) {
  if (group.length <= 1) continue;
  group.sort((a, b) => score(b.source, b.pending) - score(a.source, a.pending));
  const [winner, ...losers] = group;
  console.log(`[content-key] keep ${winner.id} (${winner.source}) — delete: ${losers.map(l => l.id).join(", ")}`);
  losers.forEach(l => toDelete.add(l.id));
}

// Group by plaid_transaction_id and mark lower-priority dupes
const plaidGroups = new Map();
for (const row of rows) {
  if (!row.plaid_transaction_id) continue;
  const key = `${row.household_id}|${row.plaid_transaction_id}`;
  if (!plaidGroups.has(key)) plaidGroups.set(key, []);
  plaidGroups.get(key).push(row);
}
for (const [, group] of plaidGroups) {
  if (group.length <= 1) continue;
  group.sort((a, b) => score(b.source, b.pending) - score(a.source, a.pending));
  const [winner, ...losers] = group;
  losers.forEach(l => {
    if (!toDelete.has(l.id)) {
      console.log(`[plaid-id]    keep ${winner.id} — delete: ${l.id}`);
      toDelete.add(l.id);
    }
  });
}

if (toDelete.size === 0) {
  console.log("\n✅ No duplicates found — DB is already clean.");
} else {
  console.log(`\nDeleting ${toDelete.size} duplicate rows...`);
  const ids = Array.from(toDelete);
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const placeholders = batch.map((_, j) => `$${j + 1}`).join(",");
    await client.query(`DELETE FROM transactions WHERE id IN (${placeholders})`, batch);
  }
  console.log(`✅ Done — deleted ${toDelete.size} duplicates.`);
}

await client.end();
