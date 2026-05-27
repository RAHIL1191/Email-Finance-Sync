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

// 1. Show all distinct account_ids and banks so we know what accounts exist
console.log("\n=== ACCOUNTS ===");
const accts = await client.query(`SELECT id, name, bank, last_four, type, plaid_account_id FROM accounts ORDER BY bank`);
accts.rows.forEach(a => console.log(`  ${a.id} | ${a.bank} | ${a.name} | lastFour=${a.last_four} | plaidAccId=${a.plaid_account_id}`));

// 2. Show BMO transaction counts per account_id
console.log("\n=== BMO TX COUNT PER ACCOUNT ===");
const counts = await client.query(`
  SELECT t.account_id, a.name, a.bank, a.last_four, count(*) as cnt
  FROM transactions t
  LEFT JOIN accounts a ON a.id = t.account_id
  WHERE lower(coalesce(t.bank,'') || coalesce(a.bank,'')) LIKE '%bmo%'
     OR lower(coalesce(a.name,'')) LIKE '%bmo%'
  GROUP BY t.account_id, a.name, a.bank, a.last_four
  ORDER BY cnt DESC
`);
counts.rows.forEach(r => console.log(`  account_id=${r.account_id} | ${r.bank} | ${r.name} | lastFour=${r.last_four} | count=${r.cnt}`));

// 3. Find duplicates by title+amount+date (ignoring account_id — catches cross-account dupes)
console.log("\n=== POTENTIAL DUPES (same title+amount+date across any account) ===");
const dupes = await client.query(`
  SELECT title, amount, date, count(*) as cnt, array_agg(id) as ids, array_agg(account_id) as acct_ids, array_agg(source) as sources
  FROM transactions
  WHERE lower(coalesce(bank,'')) LIKE '%bmo%'
     OR account_id IN (SELECT id FROM accounts WHERE lower(coalesce(bank,'')) LIKE '%bmo%')
  GROUP BY title, amount, date
  HAVING count(*) > 1
  ORDER BY date DESC
`);
if (dupes.rows.length === 0) {
  console.log("  No title+amount+date dupes found.");
} else {
  dupes.rows.forEach(r => console.log(`  "${r.title}" | $${r.amount} | ${r.date} | count=${r.cnt}\n    ids=${r.ids}\n    accts=${r.acct_ids}\n    sources=${r.sources}`));
}

// 4. Find dupes by amount+date only (catches title differences)
console.log("\n=== POTENTIAL DUPES (same amount+date, any title) ===");
const dupes2 = await client.query(`
  SELECT amount, date, count(*) as cnt, array_agg(id) as ids, array_agg(title) as titles, array_agg(account_id) as acct_ids
  FROM transactions
  WHERE lower(coalesce(bank,'')) LIKE '%bmo%'
     OR account_id IN (SELECT id FROM accounts WHERE lower(coalesce(bank,'')) LIKE '%bmo%')
  GROUP BY amount, date
  HAVING count(*) > 1
  ORDER BY date DESC
  LIMIT 30
`);
if (dupes2.rows.length === 0) {
  console.log("  None found.");
} else {
  dupes2.rows.forEach(r => console.log(`  $${r.amount} | ${r.date} | count=${r.cnt}\n    titles=${r.titles}\n    accts=${r.acct_ids}`));
}

// 5. Show all distinct plaid_transaction_ids to see if any are null
console.log("\n=== PLAID TX ID COVERAGE (BMO) ===");
const plaidCov = await client.query(`
  SELECT 
    count(*) as total,
    count(plaid_transaction_id) as with_plaid_id,
    count(*) - count(plaid_transaction_id) as without_plaid_id
  FROM transactions
  WHERE lower(coalesce(bank,'')) LIKE '%bmo%'
     OR account_id IN (SELECT id FROM accounts WHERE lower(coalesce(bank,'')) LIKE '%bmo%')
`);
console.log(`  total=${plaidCov.rows[0].total} | with_plaid_id=${plaidCov.rows[0].with_plaid_id} | without_plaid_id=${plaidCov.rows[0].without_plaid_id}`);

await client.end();
