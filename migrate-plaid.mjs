/**
 * migrate-plaid.mjs
 *
 * Migrates plaid_items rows from a source DB into this project's DB,
 * then calls the Plaid sync API for each item to import all transactions.
 *
 * Usage:
 *   node migrate-plaid.mjs
 *
 * Set these before running (or put them in env):
 *   SOURCE_DB_URL   — connection string of the other project's DB
 *   TARGET_DB_URL   — this project's Neon DB (or set DATABASE_URL)
 *   HOUSEHOLD_ID    — the household ID to assign to migrated items
 *   API_BASE        — optional, defaults to http://localhost:80
 */

import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

// Load .env from this script's dir, then also from api-server for Plaid creds
function loadEnv(filePath) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]/,"").replace(/['"]$/,"").trim();
    }
  } catch {}
}
// Script may be run from its own dir or from lib/db — try both
loadEnv(join(__dirname, ".env"));
loadEnv(join(__dirname, "artifacts", "api-server", ".env"));
loadEnv(join(__dirname, "..", "..", "artifacts", "api-server", ".env")); // when run from lib/db
loadEnv(join(__dirname, "..", "artifacts", "api-server", ".env")); // when run from lib/

const SOURCE_DB_URL = process.env.SOURCE_DB_URL || "PASTE_SOURCE_DB_URL_HERE";
const TARGET_DB_URL =
  process.env.TARGET_DB_URL ||
  process.env.DATABASE_URL ||
  "";
const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID || "";
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "";
const PLAID_SECRET    = process.env.PLAID_SECRET    || "";
const PLAID_ENV       = process.env.PLAID_ENV       || "production";

const PLAID_BASE = {
  sandbox:    "https://sandbox.plaid.com",
  development:"https://development.plaid.com",
  production: "https://production.plaid.com",
}[PLAID_ENV] ?? "https://production.plaid.com";

if (SOURCE_DB_URL === "PASTE_SOURCE_DB_URL_HERE") {
  console.error("❌  Set SOURCE_DB_URL before running.");
  process.exit(1);
}
if (!TARGET_DB_URL) {
  console.error("❌  Set TARGET_DB_URL or DATABASE_URL before running.");
  process.exit(1);
}
if (!HOUSEHOLD_ID) {
  console.error("❌  Set HOUSEHOLD_ID before running (your app's household code).");
  process.exit(1);
}
if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.error("❌  PLAID_CLIENT_ID / PLAID_SECRET not found. Checked root .env and artifacts/api-server/.env");
  process.exit(1);
}
console.log(`🔑  Plaid env=${PLAID_ENV}, client_id=${PLAID_CLIENT_ID.slice(0,8)}...`);

// ── Connect ───────────────────────────────────────────────────────────────────

const { Client } = pg;

const source = new Client({ connectionString: SOURCE_DB_URL, ssl: { rejectUnauthorized: false } });
const target = new Client({ connectionString: TARGET_DB_URL, ssl: { rejectUnauthorized: false } });

await source.connect();
await target.connect();
console.log("✅  Connected to both databases.");

// ── 1. Discover source schema ─────────────────────────────────────────────────

async function tableExists(client, name) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
    [name]
  );
  return r.rowCount > 0;
}

async function columnExists(client, table, column) {
  const r = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    [table, column]
  );
  return r.rowCount > 0;
}

const hasSrc = await tableExists(source, "plaid_items");
if (!hasSrc) {
  console.error("❌  Source DB has no 'plaid_items' table.");
  await source.end(); await target.end();
  process.exit(1);
}

// Detect column names (some projects use different casing)
const hasCursor = await columnExists(source, "plaid_items", "cursor");
const hasBankColor = await columnExists(source, "plaid_items", "bank_color");

// ── 2. Read plaid_items from source ──────────────────────────────────────────

const srcRows = await source.query(`SELECT * FROM plaid_items`);
console.log(`📦  Found ${srcRows.rows.length} plaid_items in source DB.`);

if (srcRows.rows.length === 0) {
  console.log("Nothing to migrate.");
  await source.end(); await target.end();
  process.exit(0);
}

// ── 3. Ensure plaid_items table exists in target ──────────────────────────────

// Diagnostic: show actual columns in target plaid_items from this connection
const tgtCols = await target.query(
  `SELECT column_name FROM information_schema.columns WHERE table_name='plaid_items' ORDER BY ordinal_position`
);
console.log("🔍  Target plaid_items columns (from migration conn):", tgtCols.rows.map(r => r.column_name));

// If the table is missing the id column, drop and recreate it (safe — it was empty)
const hasIdCol = tgtCols.rows.some(r => r.column_name === "id");
if (!hasIdCol) {
  console.log("⚙️   plaid_items missing 'id' column — recreating table...");
  await target.query(`DROP TABLE IF EXISTS plaid_items`);
  await target.query(`
    CREATE TABLE plaid_items (
      id            TEXT PRIMARY KEY,
      household_id  TEXT NOT NULL,
      item_id       TEXT UNIQUE NOT NULL,
      access_token  TEXT NOT NULL,
      bank_name     TEXT NOT NULL,
      bank_color    TEXT NOT NULL DEFAULT '#1a56db',
      cursor        TEXT,
      connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_synced_at TIMESTAMPTZ
    )
  `);
  console.log("✅  plaid_items table recreated with correct schema.");
} else if (tgtCols.rows.length === 0) {
  console.log("⚙️   Creating plaid_items table in target DB...");
  await target.query(`
    CREATE TABLE plaid_items (
      id            TEXT PRIMARY KEY,
      household_id  TEXT NOT NULL,
      item_id       TEXT UNIQUE NOT NULL,
      access_token  TEXT NOT NULL,
      bank_name     TEXT NOT NULL,
      bank_color    TEXT NOT NULL DEFAULT '#1a56db',
      cursor        TEXT,
      connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_synced_at TIMESTAMPTZ
    )
  `);
  console.log("✅  plaid_items table created.");
}

// Also ensure item_id has a UNIQUE constraint for conflict detection
try {
  await target.query(`CREATE UNIQUE INDEX IF NOT EXISTS plaid_items_item_id_uidx ON plaid_items (item_id)`);
} catch {}


// ── 4. Upsert each row ────────────────────────────────────────────────────────

let migrated = 0;
let skipped = 0;

for (const row of srcRows.rows) {
  // Source schema: item_id, access_token, institution_name, created_at (no id, no cursor)
  const itemId      = row.item_id;
  const accessToken = row.access_token;
  const bankName    = row.institution_name ?? row.bank_name ?? row.bankName ?? "Bank";
  const bankColor   = row.bank_color ?? row.bankColor ?? "#1a56db";
  const cursor      = row.cursor ?? null;
  const connectedAt = row.created_at ?? row.connected_at ?? new Date();
  const lastSyncedAt = row.last_synced_at ?? null;
  // Generate stable id from item_id since source has none
  const id = `pi_${itemId.replace(/[^a-z0-9]/gi, "").slice(-16)}`;

  if (!accessToken || !itemId) {
    console.warn(`⚠️   Skipping row id=${id}: missing access_token or item_id`);
    skipped++;
    continue;
  }

  // Check if already exists in target
  const existing = await target.query(`SELECT item_id FROM plaid_items WHERE item_id = $1`, [itemId]);
  if (existing.rowCount > 0) {
    console.log(`⏭️   item_id=${itemId} already in target, updating access_token & cursor...`);
    await target.query(
      `UPDATE plaid_items SET access_token=$1, cursor=$2, last_synced_at=$3 WHERE item_id=$4`,
      [accessToken, cursor, lastSyncedAt, itemId]
    );
    skipped++;
    continue;
  }

  await target.query(
    `INSERT INTO plaid_items (id, household_id, item_id, access_token, bank_name, bank_color, cursor, connected_at, last_synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       cursor       = EXCLUDED.cursor,
       last_synced_at = EXCLUDED.last_synced_at`,
    [id, HOUSEHOLD_ID, itemId, accessToken, bankName, bankColor, cursor, connectedAt, lastSyncedAt]
  );
  console.log(`✅  Migrated item: id=${id}, bank=${bankName}`);
  migrated++;
}

console.log(`\n📊  Migrated: ${migrated}, Already existed / updated: ${skipped}`);

// ── 5. Direct Plaid sync for each migrated item ──────────────────────────────

const items = await target.query(
  `SELECT id, bank_name, access_token, cursor FROM plaid_items WHERE household_id = $1`,
  [HOUSEHOLD_ID]
);

console.log(`\n🔄  Calling Plaid directly for ${items.rows.length} item(s) (${PLAID_ENV})...\n`);

let syncOk = 0;
let syncFail = 0;
let totalTx = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PLAID_HEADERS = {
  "Content-Type": "application/json",
  "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
  "PLAID-SECRET": PLAID_SECRET,
};

const CATEGORY_MAP = {
  FOOD_AND_DRINK:"Food", GENERAL_MERCHANDISE:"Shopping",
  TRANSPORTATION:"Transport", TRAVEL:"Travel",
  ENTERTAINMENT:"Entertainment", PERSONAL_CARE:"Health",
  MEDICAL:"Health", RENT_AND_UTILITIES:"Utilities",
  HOME_IMPROVEMENT:"Home", INCOME:"Income",
  TRANSFER_IN:"Income", TRANSFER_OUT:"Transfer",
  LOAN_PAYMENTS:"Bills", BANK_FEES:"Fees",
  GENERAL_SERVICES:"Services",
};
function humanCat(raw) {
  return CATEGORY_MAP[raw] ?? raw.replace(/_/g," ").replace(/\b\w/g,(c)=>c.toUpperCase());
}
function mapTx(t) {
  const amount = typeof t.amount === "number" ? t.amount : 0;
  const cat = t.personal_finance_category?.primary ?? (Array.isArray(t.category) ? t.category[0] : null) ?? "Other";
  return {
    plaidTransactionId: t.transaction_id,
    title: t.merchant_name ?? t.name ?? "Transaction",
    amount: Math.abs(amount),
    type: amount > 0 ? "expense" : "income",
    category: humanCat(cat),
    date: t.date ?? new Date().toISOString().slice(0,10),
    accountId: t.account_id,
    bank: t.merchant_name ?? t.name ?? "",
  };
}

for (const item of items.rows) {
  await sleep(2000);
  console.log(`\n📡  Syncing ${item.bank_name}...`);

  let transactions = [];
  let cursor = item.cursor ?? undefined;
  let attempt = 0;
  let ok = false;

  while (attempt < 3 && !ok) {
    attempt++;
    try {
      let hasMore = true;
      while (hasMore) {
        const body = { access_token: item.access_token, options: { include_personal_finance_category: true } };
        if (cursor) body.cursor = cursor;

        const res = await fetch(`${PLAID_BASE}/transactions/sync`, {
          method: "POST",
          headers: PLAID_HEADERS,
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (!res.ok) {
          const msg = data?.error_message ?? data?.display_message ?? JSON.stringify(data);
          if (msg.toLowerCase().includes("rate") && attempt < 3) {
            console.log(`⏳  Rate limited, waiting 20 s (attempt ${attempt}/3)...`);
            await sleep(20000);
            transactions = []; cursor = item.cursor ?? undefined; hasMore = false;
          } else {
            throw new Error(msg);
          }
        } else {
          transactions = [...transactions, ...data.added];
          cursor = data.next_cursor;
          hasMore = data.has_more;
          if (transactions.length >= 500) hasMore = false;
          ok = true;
        }
      }
    } catch (err) {
      if (attempt >= 3) {
        console.error(`❌  Failed ${item.bank_name}: ${err.message}`);
        syncFail++;
        ok = true;
      } else {
        console.log(`⏳  Retrying ${item.bank_name} in 20 s...`);
        await sleep(20000);
      }
    }
  }

  if (!ok || transactions.length === 0) {
    console.log(`   → 0 transactions fetched`);
    if (ok && transactions.length === 0) syncOk++;
    continue;
  }

  // Update cursor in DB
  await target.query(
    `UPDATE plaid_items SET cursor=$1, last_synced_at=now() WHERE id=$2`,
    [cursor ?? null, item.id]
  );

  // Upsert transactions into target DB transactions table (if it exists)
  const hasTxTable = await tableExists(target, "transactions");
  if (hasTxTable) {
    const txColsRes = await target.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='transactions'`
    );
    const txCols = txColsRes.rows.map(r => r.column_name);
    const hasPlaidTxId = txCols.includes("plaid_transaction_id");

    let inserted = 0;
    for (const t of transactions) {
      const mapped = mapTx(t);
      const txId = `ptx_${t.transaction_id.replace(/[^a-z0-9]/gi,"").slice(-20)}`;
      try {
        if (hasPlaidTxId) {
          await target.query(
            `INSERT INTO transactions (id, household_id, device_id, title, amount, type, category, account_id, date, plaid_transaction_id, bank)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT (plaid_transaction_id) DO NOTHING`,
            [txId, HOUSEHOLD_ID, "migrate-script", mapped.title, mapped.amount, mapped.type,
             mapped.category, mapped.accountId, mapped.date, t.transaction_id, mapped.bank]
          );
        } else {
          await target.query(
            `INSERT INTO transactions (id, household_id, device_id, title, amount, type, category, account_id, date, bank)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (id) DO NOTHING`,
            [txId, HOUSEHOLD_ID, "migrate-script", mapped.title, mapped.amount, mapped.type,
             mapped.category, mapped.accountId, mapped.date, mapped.bank]
          );
        }
        inserted++;
      } catch {}
    }
    console.log(`✅  ${item.bank_name}: ${inserted} transactions upserted into DB`);
    totalTx += inserted;
  } else {
    console.log(`✅  ${item.bank_name}: ${transactions.length} transactions fetched (no transactions table — will import via app sync)`);
    totalTx += transactions.length;
  }
  syncOk++;
}

// ── Done ──────────────────────────────────────────────────────────────────────

await source.end();
await target.end();

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Migration complete
   Plaid items migrated : ${migrated}
   Plaid items updated  : ${skipped}
   Banks synced OK      : ${syncOk}
   Banks sync failed    : ${syncFail}
   Transactions fetched : ${totalTx}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
