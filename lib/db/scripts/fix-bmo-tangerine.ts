/**
 * One-time data fix: rename every "BMO / Bank of Montreal" reference → "Tangerine"
 * across plaid_items, accounts, and transactions tables.
 *
 * Run from workspace root:
 *   npx tsx lib/db/scripts/fix-bmo-tangerine.ts
 */
import path from "path";
import fs from "fs";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { ilike, or, sql } from "drizzle-orm";
import {
  plaidItemsTable,
  accountsTable,
  transactionsTable,
} from "../src/schema/index.js";

// ── Load DATABASE_URL from api-server .env if not already set ────────────────
if (!process.env.DATABASE_URL) {
  const envPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
    "../../../artifacts/api-server/.env"
  );
  try {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([^#][^=]*?)\s*=\s*(.*)\s*$/);
      if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // .env not found — DATABASE_URL must already be in environment
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set and could not be loaded from .env");
}

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const BMO_FILTER = (col: any) =>
  or(ilike(col, "%BMO%"), ilike(col, "%Bank of Montreal%"))!;

async function run() {
  console.log("Starting BMO → Tangerine data fix...\n");

  // ── 1. plaid_items ────────────────────────────────────────────────────────
  const items = await db
    .update(plaidItemsTable)
    .set({ bankName: "Tangerine", bankColor: "#FF6A00" })
    .where(BMO_FILTER(plaidItemsTable.bankName))
    .returning({ id: plaidItemsTable.id, bankName: plaidItemsTable.bankName });

  console.log(`plaid_items  : ${items.length} row(s) updated`);
  items.forEach((r) => console.log(`  id=${r.id}  bankName="${r.bankName}"`));

  // ── 2. accounts ───────────────────────────────────────────────────────────
  // Also flip BMO blue (#0079C1) → Tangerine orange (#FF6A00) when applicable
  const accts = await db
    .update(accountsTable)
    .set({
      bank: "Tangerine",
      color: sql`CASE WHEN lower(color) = lower('#0079C1') THEN '#FF6A00' ELSE color END`,
    })
    .where(BMO_FILTER(accountsTable.bank))
    .returning({ id: accountsTable.id, name: accountsTable.name, bank: accountsTable.bank });

  console.log(`\naccounts     : ${accts.length} row(s) updated`);
  accts.forEach((r) => console.log(`  id=${r.id}  name="${r.name}"  bank="${r.bank}"`));

  // ── 3. transactions (safety net for email-sourced rows) ───────────────────
  const txs = await db
    .update(transactionsTable)
    .set({ bank: "Tangerine" })
    .where(BMO_FILTER(transactionsTable.bank))
    .returning({ id: transactionsTable.id });

  console.log(`\ntransactions : ${txs.length} row(s) updated`);

  console.log("\nDone. Restart the API server to serve fresh data.");
  await pool.end();
}

run().catch(async (err) => {
  console.error("Fix failed:", err);
  await pool.end();
  process.exit(1);
});
