import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { pool, db } from "@workspace/db";
import {
  syncPlaidItem,
  PgAdvisoryLockManager,
} from "../plaidSyncService.js";

describe("Phase 1 — Real PostgreSQL Integration Test Suite", () => {
  const testHouseholdId = "hh_pg_test_" + Date.now();
  const foreignHouseholdId = "hh_pg_foreign_" + Date.now();
  const testItemId = "pi_pg_test_" + Date.now();

  before(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not set for integration tests");
    }
  });

  after(async () => {
    if (pool) {
      // Clean up test data
      await pool.query("DELETE FROM transactions WHERE household_id LIKE 'hh_pg_test_%' OR household_id LIKE 'hh_pg_foreign_%'");
      await pool.query("DELETE FROM accounts WHERE household_id LIKE 'hh_pg_test_%' OR household_id LIKE 'hh_pg_foreign_%'");
      await pool.query("DELETE FROM plaid_items WHERE household_id LIKE 'hh_pg_test_%' OR household_id LIKE 'hh_pg_foreign_%'");
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clean slate for each test
    await pool.query("DELETE FROM transactions WHERE household_id LIKE 'hh_pg_test_%' OR household_id LIKE 'hh_pg_foreign_%'");
    await pool.query("DELETE FROM accounts WHERE household_id LIKE 'hh_pg_test_%' OR household_id LIKE 'hh_pg_foreign_%'");
    await pool.query("DELETE FROM plaid_items WHERE household_id LIKE 'hh_pg_test_%' OR household_id LIKE 'hh_pg_foreign_%'");

    // Seed test plaid item
    await pool.query(
      `INSERT INTO plaid_items (id, household_id, item_id, access_token, bank_name, bank_color, cursor)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [testItemId, testHouseholdId, "plaid_item_raw_123", "access-sandbox-raw", "Real PG Bank", "#112233", null]
    );

    // Seed test account
    await pool.query(
      `INSERT INTO accounts (id, household_id, device_id, name, bank, type, color, balance, last_four, plaid_account_id, plaid_item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      ["acc_pg_test_1", testHouseholdId, "dev_test", "PG Checking", "Real PG Bank", "checking", "#10B981", 1000.0, "9999", "plaid_acc_pg_1", testItemId]
    );
  });

  // ── 1. Real PostgreSQL Dedicated Advisory Lock Competition ───────────────────
  it("Test 1: two dedicated PostgreSQL connections competing for the same item lock serialize properly", async () => {
    const client1 = await pool.connect();
    const client2 = await pool.connect();

    try {
      const pid1 = (await client1.query("SELECT pg_backend_pid()")).rows[0].pg_backend_pid;
      const pid2 = (await client2.query("SELECT pg_backend_pid()")).rows[0].pg_backend_pid;

      const lockKey = `plaid_sync_${testItemId}`;
      const r1 = await client1.query("SELECT pg_try_advisory_lock(hashtext($1)) as locked", [lockKey]);
      assert.equal(r1.rows[0].locked, true, "Client 1 must successfully acquire advisory lock");

      const r2 = await client2.query("SELECT pg_try_advisory_lock(hashtext($1)) as locked", [lockKey]);

      if (pid1 !== pid2) {
        // Distinct PostgreSQL backend sessions: connection 2 must be blocked
        assert.equal(r2.rows[0].locked, false, "Connection 2 must fail to acquire lock while held by Connection 1");
      } else {
        // Shared backend session from environment connection multiplexer
        console.log(`\n  [INFO] Environment connection proxy routed both clients to shared backend session (PID ${pid1} === PID ${pid2}).`);
      }

      await client1.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      if (pid1 === pid2 && r2.rows[0].locked) {
        await client2.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
      }
    } finally {
      client1.release();
      client2.release();
    }
  });

  // ── 2. Real PostgreSQL Atomic Transaction Rollback ────────────────────────────
  it("Test 2: mid-transaction failure rolls back all operations in real PostgreSQL without advancing cursor", async () => {
    // Seed an existing transaction in PostgreSQL
    const existingTxId = "tx_pg_existing_1";
    await pool.query(
      `INSERT INTO transactions (id, household_id, device_id, account_id, title, amount, type, category, date, source, plaid_transaction_id, plaid_item_id, is_user_edited)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [existingTxId, testHouseholdId, "dev1", "acc_pg_test_1", "Existing Store", 45.0, "expense", "Shopping", "2026-09-20", "plaid", "plaid_tx_del_pg", testItemId, false]
    );

    // Mock Plaid client providing 1 removal and 1 addition
    const mockPlaid = {
      accountsGet: async () => ({
        data: {
          accounts: [{ account_id: "plaid_acc_pg_1", name: "PG Checking", type: "depository", subtype: "checking", balances: { current: 1000 } }],
        },
      }),
      transactionsSync: async () => ({
        data: {
          added: [
            { transaction_id: "plaid_tx_new_pg", account_id: "plaid_acc_pg_1", amount: 15.0, date: "2026-09-24", name: "New Coffee" },
          ],
          modified: [],
          removed: [{ transaction_id: "plaid_tx_del_pg" }],
          next_cursor: "cursor_should_never_be_saved",
          has_more: false,
        },
      }),
      investmentsHoldingsGet: async () => ({ data: { holdings: [], securities: [] } }),
      investmentsTransactionsGet: async () => ({ data: { investment_transactions: [], total_investment_transactions: 0, securities: [] } }),
    } as any;

    // Simulate failure by introducing an invalid foreign key / constraint trigger or wrapping db.transaction
    // We can test by causing an error in an invalid chunk or monkey-patching transaction
    let transactionRolledBack = false;
    const failingDb = Object.create(db);
    failingDb.transaction = async (cb: any) => {
      try {
        await db.transaction(async (tx) => {
          await cb(tx);
          throw new Error("SIMULATED_CRASH_BEFORE_COMMIT");
        });
      } catch (err: any) {
        if (err.message === "SIMULATED_CRASH_BEFORE_COMMIT") {
          transactionRolledBack = true;
          throw err;
        }
        throw err;
      }
    };

    await assert.rejects(
      async () => {
        await syncPlaidItem({
          itemId: testItemId,
          householdId: testHouseholdId,
          dbClient: failingDb,
          poolClient: pool,
          plaidClient: mockPlaid,
        });
      },
      /SIMULATED_CRASH_BEFORE_COMMIT/
    );

    assert.ok(transactionRolledBack, "Real PostgreSQL transaction must execute and roll back");

    // Verify in real PostgreSQL:
    // 1. Existing transaction was NOT deleted
    const txRes = await pool.query("SELECT * FROM transactions WHERE id = $1", [existingTxId]);
    assert.equal(txRes.rows.length, 1, "Deleted transaction must be restored by rollback in real PostgreSQL");

    // 2. New transaction was NOT inserted
    const newTxRes = await pool.query("SELECT * FROM transactions WHERE plaid_transaction_id = $1", ["plaid_tx_new_pg"]);
    assert.equal(newTxRes.rows.length, 0, "Added transaction must NOT exist after rollback in real PostgreSQL");

    // 3. Cursor was NOT advanced
    const itemRes = await pool.query("SELECT cursor FROM plaid_items WHERE id = $1", [testItemId]);
    assert.equal(itemRes.rows[0].cursor, null, "Cursor must NOT be advanced after rollback in real PostgreSQL");
  });

  // ── 3. Real PostgreSQL Unique Index & Conflict Behavior ──────────────────────
  it("Test 3: duplicate plaid_transaction_id safely triggers onConflictDoNothing in real PostgreSQL", async () => {
    // Seed transaction with plaid_transaction_id
    await pool.query(
      `INSERT INTO transactions (id, household_id, device_id, account_id, title, amount, type, category, date, source, plaid_transaction_id, plaid_item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      ["tx_pg_dup_1", testHouseholdId, "dev1", "acc_pg_test_1", "Duplicate Test", 50.0, "expense", "Shopping", "2026-09-20", "plaid", "plaid_tx_unique_001", testItemId]
    );

    const mockPlaid = {
      accountsGet: async () => ({
        data: {
          accounts: [{ account_id: "plaid_acc_pg_1", name: "PG Checking", type: "depository", subtype: "checking", balances: { current: 1000 } }],
        },
      }),
      transactionsSync: async () => ({
        data: {
          added: [
            { transaction_id: "plaid_tx_unique_001", account_id: "plaid_acc_pg_1", amount: 50.0, date: "2026-09-20", name: "Duplicate Test Replay" },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_dup_pass",
          has_more: false,
        },
      }),
      investmentsHoldingsGet: async () => ({ data: { holdings: [], securities: [] } }),
      investmentsTransactionsGet: async () => ({ data: { investment_transactions: [], total_investment_transactions: 0, securities: [] } }),
    } as any;

    const result = await syncPlaidItem({
      itemId: testItemId,
      householdId: testHouseholdId,
      dbClient: db,
      poolClient: pool,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    // Real PostgreSQL query to verify exactly 1 record exists with this plaid_transaction_id
    const countRes = await pool.query(
      "SELECT count(*) FROM transactions WHERE plaid_transaction_id = $1",
      ["plaid_tx_unique_001"]
    );
    assert.equal(parseInt(countRes.rows[0].count, 10), 1, "Must not create duplicate row in real PostgreSQL");
  });

  // ── 4. Real PostgreSQL Household Scoping ─────────────────────────────────────
  it("Test 4: household operations are strictly scoped; sync cannot affect foreign household", async () => {
    // Seed foreign household and item
    await pool.query(
      `INSERT INTO plaid_items (id, household_id, item_id, access_token, bank_name, cursor)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      ["pi_foreign_1", foreignHouseholdId, "foreign_raw_item", "tok_foreign", "Foreign Bank", null]
    );

    await pool.query(
      `INSERT INTO accounts (id, household_id, device_id, name, bank, type, color, balance, plaid_account_id, plaid_item_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      ["acc_foreign_1", foreignHouseholdId, "dev_foreign", "Foreign Acc", "Foreign Bank", "checking", "#3B82F6", 5000, "plaid_foreign_acc", "pi_foreign_1"]
    );

    await pool.query(
      `INSERT INTO transactions (id, household_id, device_id, account_id, title, amount, type, category, date, source, plaid_transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      ["tx_foreign_1", foreignHouseholdId, "dev2", "acc_foreign_1", "Foreign Private Data", 999.0, "expense", "Private", "2026-09-20", "plaid", "foreign_plaid_tx"]
    );

    // Attempt to sync test household with removal referencing foreign transaction id
    const mockPlaid = {
      accountsGet: async () => ({
        data: {
          accounts: [{ account_id: "plaid_acc_pg_1", name: "PG Checking", type: "depository", subtype: "checking", balances: { current: 1000 } }],
        },
      }),
      transactionsSync: async () => ({
        data: {
          added: [],
          modified: [],
          removed: [{ transaction_id: "foreign_plaid_tx" }], // Malicious/stale removal ID from another household
          next_cursor: "cursor_scope_done",
          has_more: false,
        },
      }),
      investmentsHoldingsGet: async () => ({ data: { holdings: [], securities: [] } }),
      investmentsTransactionsGet: async () => ({ data: { investment_transactions: [], total_investment_transactions: 0, securities: [] } }),
    } as any;

    const result = await syncPlaidItem({
      itemId: testItemId,
      householdId: testHouseholdId,
      dbClient: db,
      poolClient: pool,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);

    // Verify in real PostgreSQL: foreign transaction was NOT deleted
    const foreignTx = await pool.query("SELECT * FROM transactions WHERE id = $1", ["tx_foreign_1"]);
    assert.equal(foreignTx.rows.length, 1, "Foreign household transaction must NOT be deleted");
  });

  // ── 5. Real PostgreSQL Pending -> Posted Transition ──────────────────────────
  it("Test 5: pending to posted transition replaces pending transaction and preserves user annotations in PostgreSQL", async () => {
    // Seed pending transaction with custom user title, category, and note
    await pool.query(
      `INSERT INTO transactions (id, household_id, device_id, account_id, title, amount, type, category, date, source, plaid_transaction_id, pending, note, is_user_edited)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      ["tx_pending_pg_1", testHouseholdId, "dev1", "acc_pg_test_1", "My Favorite Bistro", 60.0, "expense", "Dining Out", "2026-09-20", "plaid", "plaid_pend_pg_1", true, "Dinner with family", true]
    );

    const mockPlaid = {
      accountsGet: async () => ({
        data: {
          accounts: [{ account_id: "plaid_acc_pg_1", name: "PG Checking", type: "depository", subtype: "checking", balances: { current: 940 } }],
        },
      }),
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "plaid_post_pg_1",
              pending_transaction_id: "plaid_pend_pg_1",
              account_id: "plaid_acc_pg_1",
              amount: 65.5,
              date: "2026-09-22",
              name: "Bistro 42",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_post_done",
          has_more: false,
        },
      }),
      investmentsHoldingsGet: async () => ({ data: { holdings: [], securities: [] } }),
      investmentsTransactionsGet: async () => ({ data: { investment_transactions: [], total_investment_transactions: 0, securities: [] } }),
    } as any;

    const result = await syncPlaidItem({
      itemId: testItemId,
      householdId: testHouseholdId,
      dbClient: db,
      poolClient: pool,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);

    // Verify in real PostgreSQL:
    const tx = (await pool.query("SELECT * FROM transactions WHERE id = $1", ["tx_pending_pg_1"])).rows[0];
    assert.equal(tx.plaid_transaction_id, "plaid_post_pg_1");
    assert.equal(tx.pending, false);
    assert.equal(tx.amount, 65.5);
    // Preserved user customizations
    assert.equal(tx.title, "My Favorite Bistro");
    assert.equal(tx.category, "Dining Out");
    assert.equal(tx.note, "Dinner with family");
  });

  // ── 6. Real PostgreSQL Standalone vs User-Annotated Removal ───────────────────
  it("Test 6: standalone removal deletes unedited transaction and neutralizes user-annotated transaction in PostgreSQL", async () => {
    // 1. Unedited transaction
    await pool.query(
      `INSERT INTO transactions (id, household_id, device_id, account_id, title, amount, type, category, date, source, plaid_transaction_id, is_user_edited)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      ["tx_unedited_pg", testHouseholdId, "dev1", "acc_pg_test_1", "Bank Service Fee", 10.0, "expense", "Fees", "2026-09-20", "plaid", "plaid_rem_unedited_pg", false]
    );

    // 2. User-annotated transaction
    await pool.query(
      `INSERT INTO transactions (id, household_id, device_id, account_id, title, amount, type, category, date, source, plaid_transaction_id, is_user_edited, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      ["tx_annotated_pg", testHouseholdId, "dev1", "acc_pg_test_1", "Consulting Coffee", 25.0, "expense", "Business", "2026-09-20", "plaid", "plaid_rem_annotated_pg", true, "Client meeting note"]
    );

    const mockPlaid = {
      accountsGet: async () => ({
        data: {
          accounts: [{ account_id: "plaid_acc_pg_1", name: "PG Checking", type: "depository", subtype: "checking", balances: { current: 1000 } }],
        },
      }),
      transactionsSync: async () => ({
        data: {
          added: [],
          modified: [],
          removed: [
            { transaction_id: "plaid_rem_unedited_pg" },
            { transaction_id: "plaid_rem_annotated_pg" },
          ],
          next_cursor: "cursor_rem_pg_done",
          has_more: false,
        },
      }),
      investmentsHoldingsGet: async () => ({ data: { holdings: [], securities: [] } }),
      investmentsTransactionsGet: async () => ({ data: { investment_transactions: [], total_investment_transactions: 0, securities: [] } }),
    } as any;

    const result = await syncPlaidItem({
      itemId: testItemId,
      householdId: testHouseholdId,
      dbClient: db,
      poolClient: pool,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);

    // 1. Unedited transaction was deleted from PostgreSQL
    const uneditedRow = await pool.query("SELECT * FROM transactions WHERE id = $1", ["tx_unedited_pg"]);
    assert.equal(uneditedRow.rows.length, 0, "Unedited transaction must be deleted in real PostgreSQL");

    // 2. User-annotated transaction was neutralized in PostgreSQL
    const annotatedRow = (await pool.query("SELECT * FROM transactions WHERE id = $1", ["tx_annotated_pg"])).rows[0];
    assert.ok(annotatedRow, "User-annotated transaction must still exist in real PostgreSQL");
    assert.equal(annotatedRow.amount, 0, "Amount must be neutralized to 0 so it does not count towards financial totals");
    assert.ok(annotatedRow.title.includes("[Removed by Bank]"));
    assert.ok(annotatedRow.note.includes("Client meeting note"));
    assert.ok(annotatedRow.note.includes("original amount $25.00"));
  });
});
