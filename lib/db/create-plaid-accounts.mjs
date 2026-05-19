/**
 * create-plaid-accounts.mjs
 * Calls Plaid /accounts/get for each plaid_item that has a valid token,
 * then inserts the accounts into the accounts table.
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
loadEnv(join(__dirname, "..", "..", ".env"));

const TARGET = "postgresql://neondb_owner:npg_3t5CBrbWcxQe@ep-autumn-rice-aqzo5tfa-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";
const HOUSEHOLD_ID = process.env.HOUSEHOLD_ID || "ZE995F";
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "";
const PLAID_SECRET    = process.env.PLAID_SECRET    || "";
const PLAID_ENV       = process.env.PLAID_ENV       || "production";
const PLAID_BASE      = { sandbox: "https://sandbox.plaid.com", development: "https://development.plaid.com", production: "https://production.plaid.com" }[PLAID_ENV] ?? "https://production.plaid.com";
if (!PLAID_CLIENT_ID || !PLAID_SECRET) { console.error("❌  PLAID creds missing"); process.exit(1); }
console.log(`🔑  client_id=${PLAID_CLIENT_ID.slice(0,8)}... env=${PLAID_ENV}`);

const TYPE_MAP = {
  depository: (sub) => sub === "savings" ? "savings" : "checking",
  credit:     ()    => "credit",
  investment: ()    => "investment",
  brokerage:  ()    => "investment",
};

const BANK_COLORS = {
  "bmo bank of montreal": "#0079C1",
  "bmo":                  "#0079C1",
  tangerine:              "#FF6600",
  cibc:                   "#C41F3E",
  wealthsimple:           "#000000",
  rbc:                    "#003168",
  td:                     "#34A853",
  scotiabank:             "#EC111A",
};

function bankColor(name) {
  const n = (name ?? "").toLowerCase();
  for (const [k, v] of Object.entries(BANK_COLORS)) {
    if (n.includes(k)) return v;
  }
  return "#6366f1";
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const db = new pg.Client({ connectionString: TARGET, ssl: { rejectUnauthorized: false } });
await db.connect();

const items = await db.query(
  `SELECT id, bank_name, access_token FROM plaid_items WHERE household_id = $1`,
  [HOUSEHOLD_ID]
);
console.log(`Found ${items.rows.length} plaid_items\n`);

let total = 0;
for (const item of items.rows) {
  console.log(`📡  Fetching accounts for ${item.bank_name}...`);
  try {
    const res = await fetch(`${PLAID_BASE}/accounts/get`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
        "PLAID-SECRET": PLAID_SECRET,
      },
      body: JSON.stringify({ access_token: item.access_token }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.log(`   ⚠️  Skipped (${data?.error_message ?? data?.error_code ?? "unknown error"})`);
      continue;
    }

    for (const acct of data.accounts ?? []) {
      const type = (TYPE_MAP[acct.type] ?? (() => "checking"))(acct.subtype);
      const lastFour = acct.mask ?? undefined;
      const name = acct.official_name ?? acct.name ?? item.bank_name;
      const color = bankColor(item.bank_name);
      const id = genId();

      try {
        await db.query(
          `INSERT INTO accounts (id, household_id, device_id, name, bank, type, balance, color, last_four)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (id) DO NOTHING`,
          [id, HOUSEHOLD_ID, "migrate-script", name, item.bank_name, type,
           acct.balances?.current ?? 0, color, lastFour ?? null]
        );
        console.log(`   ✅  ${type.padEnd(10)} | ${item.bank_name} | ${name} | ****${lastFour ?? "?"}`);
        total++;
      } catch (e) {
        console.log(`   ❌  DB insert failed: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`   ❌  Fetch error: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 1000));
}

await db.end();
console.log(`\n✅  Created ${total} accounts`);
