/**
 * create-gmail-accounts.mjs
 * Creates accounts in the DB for Gmail-sourced transactions that have a bank
 * but no matching local account. Also updates transaction account_id to point
 * to the new (or existing) account.
 */
import pg from "pg";

const DB_URL = "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const HOUSEHOLD_ID = "ZE995F";

const BANK_COLORS = {
  "bmo":        "#0079C1",
  "tangerine":  "#FF6600",
  "cibc":       "#C41F3E",
  "wealthsimple": "#000000",
  "rbc":        "#003168",
  "td":         "#34A853",
  "scotiabank": "#EC111A",
  "simplii":    "#E31837",
  "national bank": "#E31837",
};

function bankColor(name) {
  const n = (name ?? "").toLowerCase();
  for (const [k, v] of Object.entries(BANK_COLORS)) {
    if (n.includes(k)) return v;
  }
  return "#6366f1";
}

function inferType(bank) {
  const b = (bank ?? "").toLowerCase();
  if (b.includes("credit") || b.includes("visa") || b.includes("mastercard") || b.includes("amex")) return "credit";
  return "checking";
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

// Find all unique banks from transactions with empty/missing account_id
const txRows = await db.query(`
  SELECT DISTINCT bank, account_id
  FROM transactions
  WHERE household_id = $1
    AND (account_id IS NULL OR account_id = '')
    AND bank IS NOT NULL AND bank != ''
  ORDER BY bank
`, [HOUSEHOLD_ID]);

console.log(`Found ${txRows.rows.length} unique bank/account combos from Gmail transactions\n`);

// Get existing accounts
const existingAccts = await db.query(
  `SELECT id, bank, last_four FROM accounts WHERE household_id=$1`, [HOUSEHOLD_ID]
);

// Map: bank_lower → account id
const bankToAcct = new Map();
for (const a of existingAccts.rows) {
  bankToAcct.set(a.bank.toLowerCase(), a);
}

let created = 0, remapped = 0;

for (const row of txRows.rows) {
  const bank = row.bank;
  const txAccountId = row.account_id; // could be empty or a random string from email parser

  // Check if we already have an account for this bank
  const existing = bankToAcct.get(bank.toLowerCase());
  let targetLocalId;

  if (existing) {
    targetLocalId = existing.id;
    console.log(`  ✔  Account already exists for "${bank}" → ${existing.id}`);
  } else {
    // Create one
    const newId = genId();
    const color = bankColor(bank);
    const type = inferType(bank);
    try {
      await db.query(
        `INSERT INTO accounts (id, household_id, device_id, name, bank, type, balance, color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [newId, HOUSEHOLD_ID, "migrate-script", bank, bank, type, 0, color]
      );
      bankToAcct.set(bank.toLowerCase(), { id: newId, bank, last_four: null });
      targetLocalId = newId;
      created++;
      console.log(`  ✅  Created account for "${bank}" (${type}) → ${newId}`);
    } catch (e) {
      console.log(`  ❌  Failed to create account for "${bank}": ${e.message}`);
      continue;
    }
  }

  // Remap transactions for this bank that have a non-matching account_id
  const r = await db.query(
    `UPDATE transactions
     SET account_id = $1
     WHERE household_id = $2
       AND bank = $3
       AND (account_id IS NULL OR account_id = '')`,
    [targetLocalId, HOUSEHOLD_ID, bank]
  );
  if (r.rowCount > 0) {
    console.log(`     ↳  Remapped ${r.rowCount} transactions to account ${targetLocalId}`);
    remapped += r.rowCount;
  }
}

await db.end();
console.log(`\n✅  Created ${created} accounts, remapped ${remapped} transactions`);
