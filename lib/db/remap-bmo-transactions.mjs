/**
 * remap-bmo-transactions.mjs
 * Maps BMO transactions whose account_id is a raw Plaid account ID
 * to the local account id we generated in create-plaid-accounts.mjs.
 * Matches via last_four (mask) from Plaid's /accounts/get response.
 */
import pg from "pg";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(p) {
  try {
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]])
        process.env[m[1]] = m[2].replace(/^['"]/, "").replace(/['"]$/, "").trim();
    }
  } catch {}
}
loadEnv(join(__dirname, "..", "..", "artifacts", "api-server", ".env"));

const DB_URL = "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const HOUSEHOLD_ID    = "ZE995F";
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "";
const PLAID_SECRET    = process.env.PLAID_SECRET    || "";
const PLAID_ENV       = process.env.PLAID_ENV       || "production";
const PLAID_BASE      = { sandbox: "https://sandbox.plaid.com", development: "https://development.plaid.com", production: "https://production.plaid.com" }[PLAID_ENV] ?? "https://production.plaid.com";

if (!PLAID_CLIENT_ID || !PLAID_SECRET) { console.error("❌  PLAID creds missing"); process.exit(1); }

const db = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await db.connect();

// Get BMO access token
const itemRow = await db.query(
  `SELECT access_token FROM plaid_items WHERE household_id=$1 AND bank_name ILIKE '%bmo%' LIMIT 1`,
  [HOUSEHOLD_ID]
);
if (itemRow.rows.length === 0) { console.error("❌  BMO item not found"); await db.end(); process.exit(1); }
const access_token = itemRow.rows[0].access_token;

// Get accounts from Plaid
const res = await fetch(`${PLAID_BASE}/accounts/get`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "PLAID-CLIENT-ID": PLAID_CLIENT_ID, "PLAID-SECRET": PLAID_SECRET },
  body: JSON.stringify({ access_token }),
});
const data = await res.json();
if (!res.ok) { console.error("❌  Plaid error:", data?.error_message); await db.end(); process.exit(1); }

// Build map: plaid_account_id → last_four
const plaidIdToMask = {};
for (const a of data.accounts ?? []) {
  plaidIdToMask[a.account_id] = a.mask;
  console.log(`  Plaid acct: ${a.account_id} → ****${a.mask} (${a.name})`);
}

// Get local accounts by last_four
const localAccts = await db.query(
  `SELECT id, last_four, name FROM accounts WHERE household_id=$1`,
  [HOUSEHOLD_ID]
);
const maskToLocalId = {};
for (const r of localAccts.rows) {
  if (r.last_four) maskToLocalId[r.last_four] = { id: r.id, name: r.name };
}
console.log("\nLocal accounts:", maskToLocalId);

// Remap transactions
let total = 0;
for (const [plaidId, mask] of Object.entries(plaidIdToMask)) {
  const local = maskToLocalId[mask];
  if (!local) {
    console.log(`⚠️  No local account for mask ****${mask} (plaid: ${plaidId})`);
    continue;
  }
  const r = await db.query(
    `UPDATE transactions SET account_id=$1 WHERE account_id=$2 AND household_id=$3`,
    [local.id, plaidId, HOUSEHOLD_ID]
  );
  console.log(`✅  Remapped ${r.rowCount} transactions  ****${mask} (${local.name})`);
  total += r.rowCount ?? 0;
}

await db.end();
console.log(`\n✅  Total remapped: ${total} transactions`);
