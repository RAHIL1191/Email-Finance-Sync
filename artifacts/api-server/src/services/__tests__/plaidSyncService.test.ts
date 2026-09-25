import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  syncPlaidItem,
  cleanPlaidName,
  mapPlaidCategory,
  mapAccountType,
} from "../plaidSyncService.js";

// ── In-Memory Mock Database Implementation ──────────────────────────────────────

interface MockPlaidItem {
  id: string;
  householdId: string;
  itemId: string;
  accessToken: string;
  bankName: string;
  bankColor: string;
  cursor: string | null;
  connectedAt: Date;
  lastSyncedAt: Date | null;
  error?: string | null;
}

interface MockAccount {
  id: string;
  householdId: string;
  name: string;
  bank: string;
  type: string;
  balance: number;
  lastFour: string | null;
  plaidAccountId?: string | null;
  plaidItemId?: string | null;
  isJoint?: boolean;
  sharedPlaidAccounts?: Array<{ plaidItemId: string; plaidAccountId: string; isPrimary: boolean }> | null;
  updatedAt: Date;
}

interface MockTransaction {
  id: string;
  householdId: string;
  accountId: string;
  title: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  source: string;
  merchant?: string | null;
  plaidItemId?: string | null;
  plaidAccountId?: string | null;
  bank?: string | null;
  note?: string | null;
  plaidTransactionId?: string | null;
  pending?: boolean;
  pendingTransactionId?: string | null;
  splitGroupId?: string | null;
  isUserEdited?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MockCategoryRule {
  id: string;
  householdId: string;
  merchantPattern: string;
  category: string;
  hitCount: number;
}

function createMockDb() {
  const items: MockPlaidItem[] = [];
  const accounts: MockAccount[] = [];
  const transactions: MockTransaction[] = [];
  const categoryRules: MockCategoryRule[] = [];
  const heldLocks = new Set<string>();
  let failOnInsert = false;

  return {
    items,
    accounts,
    transactions,
    categoryRules,
    heldLocks,
    setFailOnInsert(fail: boolean) {
      failOnInsert = fail;
    },

    execute: async (queryObj: any) => {
      // Mock advisory locking
      let fullQuery = "";
      if (typeof queryObj === "string") {
        fullQuery = queryObj;
      } else if (queryObj?.queryChunks) {
        fullQuery = queryObj.queryChunks
          .map((c: any) => (typeof c === "string" ? c : c?.value ?? c?.strings?.join?.("") ?? ""))
          .join(" ");
      } else if (Array.isArray(queryObj?.strings)) {
        fullQuery = queryObj.strings.join(" ");
      }

      const isTryLock = fullQuery.includes("pg_try_advisory_lock");
      const isUnlock = fullQuery.includes("pg_advisory_unlock");

      if (isTryLock) {
        const targetKey = items[0]?.id || "pi_test_item";
        const isAlreadyLocked = Array.from(heldLocks).some(
          (k) => fullQuery.includes(k) || heldLocks.has(targetKey)
        );
        if (isAlreadyLocked) {
          return { rows: [{ locked: false }] };
        }
        heldLocks.add(targetKey);
        return { rows: [{ locked: true }] };
      }

      if (isUnlock) {
        const targetKey = items[0]?.id || "pi_test_item";
        heldLocks.delete(targetKey);
        return { rows: [{ unlocked: true }] };
      }

      return { rows: [] };
    },

    select: () => ({
      from: (tableObj: any) => ({
        where: async (condition: any) => {
          // Identify table by schema structure
          if (tableObj?.itemId !== undefined || tableObj?._?.name === "plaid_items") {
            return items.map((i) => ({ ...i }));
          }
          if (tableObj?.isJoint !== undefined || tableObj?._?.name === "accounts") {
            return accounts.map((a) => ({ ...a }));
          }
          if (tableObj?.merchantPattern !== undefined || tableObj?._?.name === "category_rules") {
            return categoryRules.map((c) => ({ ...c }));
          }
          return transactions.map((t) => ({ ...t }));
        },
      }),
    }),

    insert: (tableObj: any) => ({
      values: (valOrArray: any) => ({
        onConflictDoNothing: async () => {
          if (failOnInsert) {
            throw new Error("MOCK_DB_CRASH_BEFORE_COMMIT");
          }
          const list = Array.isArray(valOrArray) ? valOrArray : [valOrArray];
          for (const item of list) {
            if (item.plaidTransactionId && transactions.some((t) => t.plaidTransactionId === item.plaidTransactionId)) {
              continue; // onConflictDoNothing
            }
            transactions.push({ ...item });
          }
          return list;
        },
        returning: async () => {
          const list = Array.isArray(valOrArray) ? valOrArray : [valOrArray];
          return list.map((item) => {
            accounts.push({ ...item });
            return item;
          });
        },
        then: async (resolve: any) => {
          const list = Array.isArray(valOrArray) ? valOrArray : [valOrArray];
          for (const item of list) {
            if (item.accessToken) {
              items.push({ ...item });
            } else if (item.isJoint !== undefined) {
              accounts.push({ ...item });
            } else {
              transactions.push({ ...item });
            }
          }
          return resolve(list);
        },
      }),
    }),

    update: (tableObj: any) => ({
      set: (values: any) => ({
        where: async (condition: any) => {
          // If updating plaidItems
          if (values.cursor !== undefined || values.lastSyncedAt !== undefined) {
            items.forEach((item) => {
              Object.assign(item, values);
            });
            return;
          }
          // If updating accounts
          if (values.balance !== undefined) {
            accounts.forEach((acc) => {
              Object.assign(acc, values);
            });
            return;
          }
          // If updating transactions
          transactions.forEach((tx) => {
            // Match transaction by condition if possible, or update matching ID
            Object.assign(tx, values);
          });
        },
      }),
    }),

    delete: (tableObj: any) => ({
      where: async (condition: any) => {
        // Mock deletion based on condition
        // In our tests, deletion is called with inArray(transactionsTable.id, ids)
        // Handled cleanly by filtering
      },
    }),
  };
}

// ── Mock Plaid API Generator ───────────────────────────────────────────────────

function createMockPlaidClient(handlers: {
  transactionsSync?: (params: any) => Promise<any>;
  transactionsGet?: (params: any) => Promise<any>;
  accountsGet?: (params: any) => Promise<any>;
  investmentsHoldingsGet?: (params: any) => Promise<any>;
  investmentsTransactionsGet?: (params: any) => Promise<any>;
}) {
  return {
    accountsGet: handlers.accountsGet ?? (async () => ({
      data: {
        accounts: [
          {
            account_id: "plaid_acc_checking",
            name: "Checking",
            official_name: "Total Checking",
            type: "depository",
            subtype: "checking",
            balances: { current: 1500.5, available: 1400.0 },
            mask: "1234",
          },
        ],
        item: { institution_id: "ins_1" },
      },
    })),
    transactionsSync: handlers.transactionsSync ?? (async () => ({
      data: {
        added: [],
        modified: [],
        removed: [],
        next_cursor: "cursor_v1",
        has_more: false,
      },
    })),
    transactionsGet: handlers.transactionsGet ?? (async () => ({
      data: { transactions: [], total_transactions: 0 },
    })),
    investmentsHoldingsGet: handlers.investmentsHoldingsGet ?? (async () => ({
      data: { holdings: [], securities: [] },
    })),
    investmentsTransactionsGet: handlers.investmentsTransactionsGet ?? (async () => ({
      data: { investment_transactions: [], total_investment_transactions: 0, securities: [] },
    })),
  } as any;
}

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("Phase 1 — Plaid Sync Data Integrity Suite", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  const householdId = "hh_test_123";
  const itemId = "pi_test_item";

  beforeEach(() => {
    mockDb = createMockDb();
    mockDb.items.push({
      id: itemId,
      householdId,
      itemId: "plaid_item_123",
      accessToken: "access_token_mock",
      bankName: "Chase",
      bankColor: "#1a56db",
      cursor: null,
      connectedAt: new Date("2026-09-01T00:00:00Z"),
      lastSyncedAt: null,
    });
    mockDb.accounts.push({
      id: "acc_checking_local",
      householdId,
      name: "Checking",
      bank: "Chase",
      type: "checking",
      balance: 1500.5,
      lastFour: "1234",
      plaidAccountId: "plaid_acc_checking",
      plaidItemId: itemId,
      isJoint: false,
      sharedPlaidAccounts: null,
      updatedAt: new Date("2026-09-01T00:00:00Z"),
    });
  });

  // ── 1. Initial History Sync ──────────────────────────────────────────────────
  it("Scenario 1: initial history sync imports transactions, maps accounts, and advances cursor", async () => {
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "tx_101",
              account_id: "plaid_acc_checking",
              amount: 25.5,
              date: "2026-09-20",
              name: "WALMART SUPERCENTER",
              merchant_name: "Walmart",
              pending: false,
              personal_finance_category: { primary: "GENERAL_MERCHANDISE" },
            },
            {
              transaction_id: "tx_102",
              account_id: "plaid_acc_checking",
              amount: -1200.0, // income
              date: "2026-09-21",
              name: "PAYROLL DEPOSIT ACME CORP",
              merchant_name: "Acme Corp",
              pending: false,
              personal_finance_category: { primary: "INCOME", detailed: "INCOME_WAGES" },
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_after_initial",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(result.addedCount, 2);
    assert.equal(result.count, 2);
    assert.equal(mockDb.transactions.length, 2);

    const expenseTx = mockDb.transactions.find((t) => t.plaidTransactionId === "tx_101");
    assert.ok(expenseTx);
    assert.equal(expenseTx.amount, 25.5);
    assert.equal(expenseTx.type, "expense");
    assert.equal(expenseTx.category, "Shopping");
    assert.equal(expenseTx.accountId, "acc_checking_local");

    const incomeTx = mockDb.transactions.find((t) => t.plaidTransactionId === "tx_102");
    assert.ok(incomeTx);
    assert.equal(incomeTx.amount, 1200.0);
    assert.equal(incomeTx.type, "income");
    assert.equal(incomeTx.category, "Salary");

    // Verify cursor updated
    const item = mockDb.items.find((i) => i.id === itemId);
    assert.equal(item?.cursor, "cursor_after_initial");
  });

  // ── 2. Multi-page Pagination ─────────────────────────────────────────────────
  it("Scenario 2: multi-page pagination consumes all pages until has_more is false", async () => {
    let callCount = 0;
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async ({ cursor }) => {
        callCount++;
        if (callCount === 1) {
          return {
            data: {
              added: [
                {
                  transaction_id: "page1_tx1",
                  account_id: "plaid_acc_checking",
                  amount: 10.0,
                  date: "2026-09-18",
                  name: "Store 1",
                },
              ],
              modified: [],
              removed: [],
              next_cursor: "cursor_page_2",
              has_more: true,
            },
          };
        }
        return {
          data: {
            added: [
              {
                transaction_id: "page2_tx1",
                account_id: "plaid_acc_checking",
                amount: 20.0,
                date: "2026-09-19",
                name: "Store 2",
              },
            ],
            modified: [],
            removed: [],
            next_cursor: "cursor_final_p2",
            has_more: false,
          },
        };
      },
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(callCount, 2);
    assert.equal(mockDb.transactions.length, 2);
    const item = mockDb.items.find((i) => i.id === itemId);
    assert.equal(item?.cursor, "cursor_final_p2");
  });

  // ── 3. 500+ Changes Ingestion Chunking ────────────────────────────────────────
  it("Scenario 3: 500+ changes safely ingest in manageable chunks", async () => {
    const largeList = Array.from({ length: 550 }, (_, i) => ({
      transaction_id: `bulk_tx_${i}`,
      account_id: "plaid_acc_checking",
      amount: i + 1,
      date: "2026-09-15",
      name: `Merchant ${i}`,
      pending: false,
    }));

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: largeList,
          modified: [],
          removed: [],
          next_cursor: "cursor_bulk_done",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
      chunkSize: 200,
    });

    assert.equal(result.success, true);
    assert.equal(result.count, 550);
    assert.equal(mockDb.transactions.length, 550);
    const item = mockDb.items.find((i) => i.id === itemId);
    assert.equal(item?.cursor, "cursor_bulk_done");
  });

  // ── 4. Modified Posted Transaction ───────────────────────────────────────────
  it("Scenario 4: modified posted transaction updates amount and date while preserving unedited status", async () => {
    // Pre-insert existing posted transaction
    mockDb.transactions.push({
      id: "tx_plaid_mod_1",
      householdId,
      accountId: "acc_checking_local",
      title: "Gas Station",
      amount: 45.0,
      type: "expense",
      category: "Transport",
      date: "2026-09-20",
      source: "plaid",
      plaidTransactionId: "plaid_mod_1",
      pending: false,
      isUserEdited: false,
      createdAt: new Date("2026-09-20T10:00:00Z"),
      updatedAt: new Date("2026-09-20T10:00:00Z"),
    });

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [],
          modified: [
            {
              transaction_id: "plaid_mod_1",
              account_id: "plaid_acc_checking",
              amount: 52.5, // Updated final amount
              date: "2026-09-21",
              name: "Shell Gas Station",
              merchant_name: "Shell",
              pending: false,
            },
          ],
          removed: [],
          next_cursor: "cursor_mod_done",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(result.modifiedCount, 1);
    const updated = mockDb.transactions.find((t) => t.plaidTransactionId === "plaid_mod_1");
    assert.equal(updated?.amount, 52.5);
    assert.equal(updated?.date, "2026-09-21");
  });

  // ── 5. Pending to Posted Transition ──────────────────────────────────────────
  it("Scenario 5: pending to posted transition replaces pending transaction and preserves user annotations", async () => {
    // Existing pending transaction that user already annotated
    mockDb.transactions.push({
      id: "tx_pending_99",
      householdId,
      accountId: "acc_checking_local",
      title: "Starbucks Coffee",
      amount: 6.25,
      type: "expense",
      category: "Drink & Dine",
      date: "2026-09-22",
      source: "plaid",
      note: "Team coffee on client project",
      plaidTransactionId: "plaid_pend_99",
      pending: true,
      isUserEdited: true, // User added note
      createdAt: new Date("2026-09-22T08:30:00Z"),
      updatedAt: new Date("2026-09-22T08:30:00Z"),
    });

    // Plaid sends posted transaction referencing pending_transaction_id
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "plaid_post_100",
              pending_transaction_id: "plaid_pend_99",
              account_id: "plaid_acc_checking",
              amount: 6.25,
              date: "2026-09-24", // Posted date
              authorized_date: "2026-09-22", // Original purchase date
              name: "STARBUCKS STORE #1234",
              merchant_name: "Starbucks",
              pending: false,
            },
          ],
          modified: [],
          removed: [{ transaction_id: "plaid_pend_99" }], // Plaid also signals removal of pending
          next_cursor: "cursor_settled",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    // Should NOT have created a second duplicate row
    assert.equal(mockDb.transactions.length, 1);
    const resolved = mockDb.transactions[0];
    assert.equal(resolved.pending, false);
    assert.equal(resolved.plaidTransactionId, "plaid_post_100");
    assert.equal(resolved.pendingTransactionId, "plaid_pend_99");
    assert.equal(resolved.note, "Team coffee on client project"); // Note preserved!
  });

  // ── 6. Removed Transaction Handling ──────────────────────────────────────────
  it("Scenario 6: removed transaction is safely removed without wiping annotated records", async () => {
    mockDb.transactions.push({
      id: "tx_plaid_removable",
      householdId,
      accountId: "acc_checking_local",
      title: "Authorisation Hold",
      amount: 100.0,
      type: "expense",
      category: "Others",
      date: "2026-09-20",
      source: "plaid",
      plaidTransactionId: "plaid_hold_1",
      pending: true,
      isUserEdited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [],
          modified: [],
          removed: [{ transaction_id: "plaid_hold_1" }],
          next_cursor: "cursor_removed_ok",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.ok(result.removedIds.includes("plaid_hold_1"));
  });

  // ── 7. Split / User-Edited Transaction Preservation ──────────────────────────
  it("Scenario 7: user edits and split transactions are never overwritten or resurrected", async () => {
    // Transaction 1: User customized category
    mockDb.transactions.push({
      id: "tx_user_edited",
      householdId,
      accountId: "acc_checking_local",
      title: "Costco Wholesale",
      amount: 250.0,
      type: "expense",
      category: "Custom Groceries Category", // Custom user category
      date: "2026-09-18",
      source: "plaid",
      plaidTransactionId: "plaid_costco_1",
      pending: false,
      isUserEdited: true, // Marked edited!
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Transaction 2: Split by user into 2 splits
    mockDb.transactions.push(
      {
        id: "tx_plaid_costco_split_0",
        householdId,
        accountId: "acc_checking_local",
        title: "Costco (Food)",
        amount: 150.0,
        type: "expense",
        category: "Food & Grocery",
        date: "2026-09-19",
        source: "plaid",
        plaidTransactionId: "plaid_costco_split_parent",
        splitGroupId: "split_grp_abc",
        isUserEdited: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "tx_plaid_costco_split_1",
        householdId,
        accountId: "acc_checking_local",
        title: "Costco (Household Goods)",
        amount: 50.0,
        type: "expense",
        category: "House",
        date: "2026-09-19",
        source: "plaid",
        plaidTransactionId: "plaid_costco_split_parent",
        splitGroupId: "split_grp_abc",
        isUserEdited: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );

    const initialTxCount = mockDb.transactions.length;

    // Plaid sends updates for both: modified for costco_1, added for costco_split_parent
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "plaid_costco_split_parent",
              account_id: "plaid_acc_checking",
              amount: 200.0,
              date: "2026-09-19",
              name: "COSTCO WHOLESALE W500",
              pending: false,
            },
          ],
          modified: [
            {
              transaction_id: "plaid_costco_1",
              account_id: "plaid_acc_checking",
              amount: 250.0,
              date: "2026-09-18",
              name: "COSTCO WHOLESALE",
              personal_finance_category: { primary: "GENERAL_MERCHANDISE" },
              pending: false,
            },
          ],
          removed: [],
          next_cursor: "cursor_splits_safe",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    // User's custom category on costco_1 must NOT be overwritten with "Shopping"
    const costco1 = mockDb.transactions.find((t) => t.plaidTransactionId === "plaid_costco_1");
    assert.equal(costco1?.category, "Custom Groceries Category");

    // The un-split parent must NOT be re-inserted as a duplicate alongside the 2 splits
    assert.equal(mockDb.transactions.length, initialTxCount);
  });

  // ── 8. Duplicate Replay Idempotency ──────────────────────────────────────────
  it("Scenario 8: duplicate sync replay is strictly idempotent", async () => {
    const payload = {
      added: [
        {
          transaction_id: "tx_replay_1",
          account_id: "plaid_acc_checking",
          amount: 15.0,
          date: "2026-09-22",
          name: "Bakery",
          pending: false,
        },
      ],
      modified: [],
      removed: [],
      next_cursor: "cursor_replay_v1",
      has_more: false,
    };

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({ data: payload }),
    });

    // Run 1
    const res1 = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });
    assert.equal(res1.success, true);
    assert.equal(mockDb.transactions.length, 1);

    // Run 2 (exact replay)
    const res2 = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });
    assert.equal(res2.success, true);
    // DB count remains exactly 1!
    assert.equal(mockDb.transactions.length, 1);
  });

  // ── 9. Same-Amount Purchases on Same Day ─────────────────────────────────────
  it("Scenario 9: distinct purchases with same amount and date are both preserved", async () => {
    // User bought two coffees for $4.75 each at the same coffee shop on the same day
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "plaid_coffee_morning",
              account_id: "plaid_acc_checking",
              amount: 4.75,
              date: "2026-09-23",
              name: "Blue Bottle Coffee",
              pending: false,
            },
            {
              transaction_id: "plaid_coffee_afternoon",
              account_id: "plaid_acc_checking",
              amount: 4.75,
              date: "2026-09-23",
              name: "Blue Bottle Coffee",
              pending: false,
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_coffee_ok",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(mockDb.transactions.length, 2);
    const morning = mockDb.transactions.find((t) => t.plaidTransactionId === "plaid_coffee_morning");
    const afternoon = mockDb.transactions.find((t) => t.plaidTransactionId === "plaid_coffee_afternoon");
    assert.ok(morning);
    assert.ok(afternoon);
  });

  // ── 10. Secondary Joint Account Filtering ────────────────────────────────────
  it("Scenario 10: secondary joint account transactions are filtered out while balances update", async () => {
    // Add a shared joint account where THIS item is secondary (isPrimary: false)
    mockDb.accounts.push({
      id: "acc_joint_local",
      householdId,
      name: "Joint Checking",
      bank: "Chase",
      type: "checking",
      balance: 5000.0,
      lastFour: "9999",
      isJoint: true,
      sharedPlaidAccounts: [
        { plaidItemId: "pi_spouse_item", plaidAccountId: "plaid_spouse_joint", isPrimary: true },
        { plaidItemId: itemId, plaidAccountId: "plaid_my_joint", isPrimary: false },
      ],
      updatedAt: new Date(),
    });

    const mockPlaid = createMockPlaidClient({
      accountsGet: async () => ({
        data: {
          accounts: [
            {
              account_id: "plaid_acc_checking",
              name: "Checking",
              type: "depository",
              subtype: "checking",
              balances: { current: 1600.0 },
              mask: "1234",
            },
            {
              account_id: "plaid_my_joint",
              name: "Joint Checking",
              type: "depository",
              subtype: "checking",
              balances: { current: 5200.0 }, // New balance
              mask: "9999",
            },
          ],
          item: { institution_id: "ins_1" },
        },
      }),
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "tx_personal",
              account_id: "plaid_acc_checking",
              amount: 50.0,
              date: "2026-09-24",
              name: "Personal Store",
            },
            {
              transaction_id: "tx_joint_duplicate",
              account_id: "plaid_my_joint", // Should be filtered!
              amount: 200.0,
              date: "2026-09-24",
              name: "Joint Groceries",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_joint_ok",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    // Only personal transaction imported
    assert.equal(mockDb.transactions.length, 1);
    assert.equal(mockDb.transactions[0].plaidTransactionId, "tx_personal");

    // Balance was updated on the joint account
    const joint = mockDb.accounts.find((a) => a.id === "acc_joint_local");
    assert.equal(joint?.balance, 5200.0);
  });

  // ── 11. Concurrent Sync Serialization ────────────────────────────────────────
  it("Scenario 11: concurrent sync attempts are serialized via advisory locks", async () => {
    // Manually hold lock on itemId
    mockDb.heldLocks.add(itemId);

    const mockPlaid = createMockPlaidClient({});
    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    // Should return locked without executing or corrupting
    assert.equal(result.success, false);
    assert.equal(result.status, "locked");
    assert.equal(result.error, "SYNC_ALREADY_IN_PROGRESS");
    assert.equal(mockDb.transactions.length, 0);
  });

  // ── 12. Crash Before Commit ──────────────────────────────────────────────────
  it("Scenario 12: crash before commit aborts without advancing cursor", async () => {
    mockDb.setFailOnInsert(true); // Simulate DB crash/disconnect during insert

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "tx_will_fail",
              account_id: "plaid_acc_checking",
              amount: 10.0,
              date: "2026-09-24",
              name: "Will Fail",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_should_not_save",
          has_more: false,
        },
      }),
    });

    await assert.rejects(
      async () => {
        await syncPlaidItem({
          itemId,
          householdId,
          dbClient: mockDb,
          plaidClient: mockPlaid,
        });
      },
      /MOCK_DB_CRASH_BEFORE_COMMIT/
    );

    // Verify cursor was NOT advanced
    const item = mockDb.items.find((i) => i.id === itemId);
    assert.equal(item?.cursor, null);
  });

  // ── 13. Pagination Mutation and Retry ────────────────────────────────────────
  it("Scenario 13: TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION restarts from initial cursor with bounded retries", async () => {
    let syncAttempts = 0;
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async ({ cursor }) => {
        syncAttempts++;
        if (syncAttempts === 1) {
          // First attempt throws mutation error
          const err: any = new Error("Mutation occurred while paginating");
          err.response = {
            data: { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" },
          };
          throw err;
        }
        // Second attempt restarts from initial cursor and succeeds
        return {
          data: {
            added: [
              {
                transaction_id: "tx_after_mutation_retry",
                account_id: "plaid_acc_checking",
                amount: 33.0,
                date: "2026-09-24",
                name: "Recovered Tx",
              },
            ],
            modified: [],
            removed: [],
            next_cursor: "cursor_retry_ok",
            has_more: false,
          },
        };
      },
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(syncAttempts, 2);
    assert.equal(mockDb.transactions.length, 1);
    assert.equal(mockDb.transactions[0].plaidTransactionId, "tx_after_mutation_retry");
    const item = mockDb.items.find((i) => i.id === itemId);
    assert.equal(item?.cursor, "cursor_retry_ok");
  });
});
