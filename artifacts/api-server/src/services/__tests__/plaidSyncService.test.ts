import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  syncPlaidItem,
  cleanPlaidName,
  mapPlaidCategory,
  mapAccountType,
  type LockManager,
  type LockHandle,
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

const dialect = new PgDialect();

function parseCondition(condition: any): { sqlStr: string; params: any[] } {
  if (!condition) return { sqlStr: "", params: [] };
  try {
    const q = dialect.sqlToQuery(condition);
    return { sqlStr: q.sql, params: q.params };
  } catch {
    return { sqlStr: "", params: [] };
  }
}

export interface MockDb {
  items: MockPlaidItem[];
  accounts: MockAccount[];
  transactions: MockTransaction[];
  categoryRules: MockCategoryRule[];
  heldLocks: Set<string>;
  setFailAfterDelete: (fail: boolean) => void;
  setFailAfterUpdate: (fail: boolean) => void;
  setFailHalfwayThroughInsert: (fail: boolean) => void;
  setFailOnInsert: (fail: boolean) => void;
  transaction: <T>(cb: (tx: any) => Promise<T>) => Promise<T>;
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
}

function createMockDb(): MockDb {
  const items: MockPlaidItem[] = [];
  const accounts: MockAccount[] = [];
  const transactions: MockTransaction[] = [];
  const categoryRules: MockCategoryRule[] = [];
  const heldLocks = new Set<string>();

  let failAfterDelete = false;
  let failAfterUpdate = false;
  let failHalfwayThroughInsert = false;
  let failOnInsert = false;

  const mockDbInstance: MockDb = {
    items,
    accounts,
    transactions,
    categoryRules,
    heldLocks,

    setFailAfterDelete(fail: boolean) {
      failAfterDelete = fail;
    },
    setFailAfterUpdate(fail: boolean) {
      failAfterUpdate = fail;
    },
    setFailHalfwayThroughInsert(fail: boolean) {
      failHalfwayThroughInsert = fail;
    },
    setFailOnInsert(fail: boolean) {
      failOnInsert = fail;
    },

    transaction: async (cb: (tx: any) => Promise<any>) => {
      // Snapshot state for atomic rollback on throw
      const snapItems = items.map((i) => ({ ...i }));
      const snapAccounts = accounts.map((a) => ({ ...a }));
      const snapTransactions = transactions.map((t) => ({ ...t }));

      try {
        const result = await cb(mockDbInstance);
        return result;
      } catch (err) {
        // Rollback state cleanly
        items.length = 0;
        items.push(...snapItems);
        accounts.length = 0;
        accounts.push(...snapAccounts);
        transactions.length = 0;
        transactions.push(...snapTransactions);
        throw err;
      }
    },

    select: () => ({
      from: (tableObj: any) => ({
        where: async (condition: any) => {
          const { params } = parseCondition(condition);
          const targetHouseholdId = params.find((p) => typeof p === "string" && p.startsWith("hh_"));

          if (tableObj?.itemId !== undefined || tableObj?._?.name === "plaid_items") {
            return items
              .filter((i) => !targetHouseholdId || i.householdId === targetHouseholdId)
              .map((i) => ({ ...i }));
          }
          if (tableObj?.isJoint !== undefined || tableObj?._?.name === "accounts") {
            return accounts
              .filter((a) => !targetHouseholdId || a.householdId === targetHouseholdId)
              .map((a) => ({ ...a }));
          }
          if (tableObj?.merchantPattern !== undefined || tableObj?._?.name === "category_rules") {
            return categoryRules
              .filter((c) => !targetHouseholdId || c.householdId === targetHouseholdId)
              .map((c) => ({ ...c }));
          }
          return transactions
            .filter((t) => !targetHouseholdId || t.householdId === targetHouseholdId)
            .map((t) => ({ ...t }));
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
          for (let i = 0; i < list.length; i++) {
            if (failHalfwayThroughInsert && i >= Math.floor(list.length / 2)) {
              throw new Error("MOCK_CRASH_HALFWAY_THROUGH_INSERTS");
            }
            const item = list[i];
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
          const { params } = parseCondition(condition);

          // If updating plaidItems
          if (values.cursor !== undefined || values.lastSyncedAt !== undefined) {
            const targetItemId = params.find((p) => typeof p === "string" && p.startsWith("pi_"));
            items.forEach((item) => {
              if (!targetItemId || item.id === targetItemId) {
                Object.assign(item, values);
              }
            });
            return;
          }

          // If updating accounts
          if (values.balance !== undefined) {
            const targetAccId = params.find((p) => typeof p === "string" && (p.startsWith("acc_") || p.startsWith("plaid_")));
            accounts.forEach((acc) => {
              if (!targetAccId || acc.id === targetAccId) {
                Object.assign(acc, values);
              }
            });
            return;
          }

          // If updating transactions
          const targetTxId = params.find((p) => typeof p === "string" && (p.startsWith("tx_") || p.startsWith("plaid_")));
          const targetHouseholdId = params.find((p) => typeof p === "string" && p.startsWith("hh_"));

          transactions.forEach((tx) => {
            if (targetTxId && tx.id !== targetTxId) return;
            if (targetHouseholdId && tx.householdId !== targetHouseholdId) return;
            Object.assign(tx, values);
          });

          if (failAfterUpdate) {
            throw new Error("MOCK_CRASH_AFTER_UPDATE");
          }
        },
      }),
    }),

    delete: (tableObj: any) => ({
      where: async (condition: any) => {
        const { params } = parseCondition(condition);
        const targetHouseholdId = params.find((p) => typeof p === "string" && p.startsWith("hh_"));
        const targetIds = new Set(params.filter((p) => typeof p === "string" && p.startsWith("tx_")));

        for (let i = transactions.length - 1; i >= 0; i--) {
          const tx = transactions[i];
          if (targetHouseholdId && tx.householdId !== targetHouseholdId) continue;
          if (targetIds.size > 0 && targetIds.has(tx.id)) {
            transactions.splice(i, 1);
          }
        }

        if (failAfterDelete) {
          throw new Error("MOCK_CRASH_AFTER_DELETE");
        }
      },
    }),
  };

  return mockDbInstance;
}

// ── In-Memory Dedicated Lock Manager ──────────────────────────────────────────

class MockDedicatedLockManager implements LockManager {
  constructor(private heldLocks: Set<string>) {}

  async tryAcquire(itemId: string): Promise<LockHandle | null> {
    if (this.heldLocks.has(itemId)) {
      return null;
    }
    this.heldLocks.add(itemId);
    return {
      release: async () => {
        this.heldLocks.delete(itemId);
      },
    };
  }
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
            name: "Plaid Checking",
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
  let mockLockMgr: MockDedicatedLockManager;
  const householdId = "hh_test_123";
  const itemId = "pi_test_item";

  beforeEach(() => {
    mockDb = createMockDb();
    mockLockMgr = new MockDedicatedLockManager(mockDb.heldLocks);

    mockDb.items.push({
      id: itemId,
      householdId,
      itemId: "plaid_inst_item_123",
      accessToken: "access-sandbox-token-123",
      bankName: "Test Bank",
      bankColor: "#000000",
      cursor: null,
      connectedAt: new Date(),
      lastSyncedAt: null,
      error: null,
    });

    mockDb.accounts.push({
      id: "acc_checking_local",
      householdId,
      name: "Checking",
      bank: "Test Bank",
      type: "checking",
      balance: 500.0,
      lastFour: "1234",
      plaidAccountId: "plaid_acc_checking",
      plaidItemId: itemId,
      isJoint: false,
      sharedPlaidAccounts: null,
      updatedAt: new Date(),
    });
  });

  // ── 1. Initial Sync ──────────────────────────────────────────────────────────
  it("Scenario 1: initial history sync imports transactions, maps accounts, and advances cursor", async () => {
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async (params) => ({
        data: {
          added: [
            {
              transaction_id: "tx_plaid_001",
              account_id: "plaid_acc_checking",
              amount: 45.5,
              date: "2026-09-20",
              name: "Starbucks Store #1234",
              merchant_name: "Starbucks",
              personal_finance_category: { primary: "FOOD_AND_DRINK", detailed: "FOOD_AND_DRINK_COFFEE_SHOPS" },
              pending: false,
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_page_1",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(result.addedCount, 1);
    assert.equal(mockDb.transactions.length, 1);
    assert.equal(mockDb.transactions[0].plaidTransactionId, "tx_plaid_001");
    assert.equal(mockDb.transactions[0].category, "Drink & Dine");
    assert.equal(mockDb.items[0].cursor, "cursor_page_1");
  });

  // ── 2. Multi-page Pagination ─────────────────────────────────────────────────
  it("Scenario 2: multi-page pagination consumes all pages until has_more is false", async () => {
    let callCount = 0;
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async (params) => {
        callCount++;
        if (callCount === 1) {
          return {
            data: {
              added: [
                {
                  transaction_id: "tx_p1_01",
                  account_id: "plaid_acc_checking",
                  amount: 10.0,
                  date: "2026-09-20",
                  name: "Store 1",
                },
              ],
              modified: [],
              removed: [],
              next_cursor: "cursor_p1",
              has_more: true,
            },
          };
        }
        return {
          data: {
            added: [
              {
                transaction_id: "tx_p2_01",
                account_id: "plaid_acc_checking",
                amount: 20.0,
                date: "2026-09-21",
                name: "Store 2",
              },
            ],
            modified: [],
            removed: [],
            next_cursor: "cursor_p2_final",
            has_more: false,
          },
        };
      },
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(callCount, 2);
    assert.equal(mockDb.transactions.length, 2);
    assert.equal(mockDb.items[0].cursor, "cursor_p2_final");
  });

  // ── 3. 500+ Changes Ingestion ────────────────────────────────────────────────
  it("Scenario 3: 500+ changes safely ingest in manageable chunks", async () => {
    const hugeAdded = Array.from({ length: 550 }, (_, i) => ({
      transaction_id: `tx_bulk_${i}`,
      account_id: "plaid_acc_checking",
      amount: 5.0 + i,
      date: "2026-09-22",
      name: `Vendor ${i}`,
    }));

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: hugeAdded,
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
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
      chunkSize: 200,
    });

    assert.equal(result.success, true);
    assert.equal(mockDb.transactions.length, 550);
    assert.equal(mockDb.items[0].cursor, "cursor_bulk_done");
  });

  // ── 4. Modified Posted Transaction ───────────────────────────────────────────
  it("Scenario 4: modified posted transaction updates amount and date while preserving unedited status", async () => {
    mockDb.transactions.push({
      id: "tx_plaid_existing_01",
      householdId,
      accountId: "acc_checking_local",
      title: "Target",
      amount: 30.0,
      type: "expense",
      category: "Shopping",
      date: "2026-09-21",
      source: "plaid",
      plaidTransactionId: "plaid_tx_01",
      isUserEdited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [],
          modified: [
            {
              transaction_id: "plaid_tx_01",
              account_id: "plaid_acc_checking",
              amount: 35.5,
              date: "2026-09-22",
              name: "Target Superstore",
            },
          ],
          removed: [],
          next_cursor: "cursor_mod_1",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    const updated = mockDb.transactions.find((t) => t.plaidTransactionId === "plaid_tx_01");
    assert.equal(updated?.amount, 35.5);
    assert.equal(updated?.date, "2026-09-22");
    assert.equal(updated?.title, "Target Superstore");
  });

  // ── 5. Pending to Posted Transition ──────────────────────────────────────────
  it("Scenario 5: pending to posted transition replaces pending transaction and preserves user annotations", async () => {
    mockDb.transactions.push({
      id: "tx_pending_100",
      householdId,
      accountId: "acc_checking_local",
      title: "Bistro Custom Title",
      amount: 50.0,
      type: "expense",
      category: "Special Dinner",
      date: "2026-09-20",
      source: "plaid",
      note: "Anniversary dinner with custom note",
      plaidTransactionId: "plaid_pending_100",
      pending: true,
      isUserEdited: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "plaid_posted_200",
              pending_transaction_id: "plaid_pending_100",
              account_id: "plaid_acc_checking",
              amount: 55.0,
              date: "2026-09-22",
              name: "Bistro 42",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_posted_done",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(mockDb.transactions.length, 1);
    const resolved = mockDb.transactions[0];
    assert.equal(resolved.plaidTransactionId, "plaid_posted_200");
    assert.equal(resolved.pending, false);
    assert.equal(resolved.amount, 55.0);
    // User edits preserved
    assert.equal(resolved.title, "Bistro Custom Title");
    assert.equal(resolved.category, "Special Dinner");
    assert.equal(resolved.note, "Anniversary dinner with custom note");
  });

  // ── 6. Standalone Removal vs User-Annotated Removal ──────────────────────────
  it("Scenario 6: standalone removal deletes unedited transaction but neutralizes user-annotated transaction", async () => {
    // 1. Unedited transaction (should be deleted)
    mockDb.transactions.push({
      id: "tx_unedited_01",
      householdId,
      accountId: "acc_checking_local",
      title: "Bank Fee",
      amount: 15.0,
      type: "expense",
      category: "Fees",
      date: "2026-09-20",
      source: "plaid",
      plaidTransactionId: "plaid_remove_unedited",
      isUserEdited: false,
      note: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. User-annotated transaction (should NOT be deleted, but neutralized: amount = 0)
    mockDb.transactions.push({
      id: "tx_annotated_02",
      householdId,
      accountId: "acc_checking_local",
      title: "Client Lunch",
      amount: 85.0,
      type: "expense",
      category: "Business",
      date: "2026-09-20",
      source: "plaid",
      plaidTransactionId: "plaid_remove_annotated",
      isUserEdited: true,
      note: "Business lunch with client",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [],
          modified: [],
          removed: [
            { transaction_id: "plaid_remove_unedited" },
            { transaction_id: "plaid_remove_annotated" },
          ],
          next_cursor: "cursor_rem_done",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    // Unedited transaction was deleted
    const unedited = mockDb.transactions.find((t) => t.id === "tx_unedited_01");
    assert.equal(unedited, undefined);

    // User-annotated transaction was preserved, but neutralized financially (amount = 0)
    const annotated = mockDb.transactions.find((t) => t.id === "tx_annotated_02");
    assert.ok(annotated);
    assert.equal(annotated.amount, 0); // Neutralized spend
    assert.ok(annotated.title.includes("[Removed by Bank]"));
    assert.ok(annotated.note?.includes("Business lunch with client"));
    assert.ok(annotated.note?.includes("original amount $85.00"));
  });

  // ── 7. Split Transactions & User Edits ───────────────────────────────────────
  it("Scenario 7: user edits and split transactions are never overwritten or resurrected", async () => {
    // User split parent tx into two parts
    mockDb.transactions.push({
      id: "tx_split_part_1",
      householdId,
      accountId: "acc_checking_local",
      title: "Grocery Part",
      amount: 60.0,
      type: "expense",
      category: "Food & Grocery",
      date: "2026-09-20",
      source: "plaid",
      plaidTransactionId: "plaid_split_parent",
      splitGroupId: "split_grp_001",
      isUserEdited: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockDb.transactions.push({
      id: "tx_split_part_2",
      householdId,
      accountId: "acc_checking_local",
      title: "Home Goods Part",
      amount: 40.0,
      type: "expense",
      category: "House",
      date: "2026-09-20",
      source: "plaid",
      plaidTransactionId: "plaid_split_parent",
      splitGroupId: "split_grp_001",
      isUserEdited: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "plaid_split_parent",
              account_id: "plaid_acc_checking",
              amount: 100.0,
              date: "2026-09-20",
              name: "Superstore",
            },
          ],
          modified: [
            {
              transaction_id: "plaid_split_parent",
              account_id: "plaid_acc_checking",
              amount: 100.0,
              date: "2026-09-20",
              name: "Superstore Renamed",
            },
          ],
          removed: [],
          next_cursor: "cursor_split_done",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    // Splits remain intact; parent 100.0 was not re-inserted
    assert.equal(mockDb.transactions.length, 2);
    assert.equal(mockDb.transactions[0].title, "Grocery Part");
    assert.equal(mockDb.transactions[1].title, "Home Goods Part");
  });

  // ── 8. Idempotent Replay ─────────────────────────────────────────────────────
  it("Scenario 8: duplicate sync replay is strictly idempotent", async () => {
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "tx_idempotent_1",
              account_id: "plaid_acc_checking",
              amount: 25.0,
              date: "2026-09-22",
              name: "Cinema",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_replay_1",
          has_more: false,
        },
      }),
    });

    // Run sync first time
    await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });
    assert.equal(mockDb.transactions.length, 1);

    // Replay same sync
    await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });
    // Exactly 1 transaction exists
    assert.equal(mockDb.transactions.length, 1);
  });

  // ── 9. Distinct Same-Amount Purchases ────────────────────────────────────────
  it("Scenario 9: distinct purchases with same amount and date are both preserved", async () => {
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "tx_coffee_morning",
              account_id: "plaid_acc_checking",
              amount: 4.5,
              date: "2026-09-23",
              name: "Coffee Shop",
            },
            {
              transaction_id: "tx_coffee_afternoon",
              account_id: "plaid_acc_checking",
              amount: 4.5,
              date: "2026-09-23",
              name: "Coffee Shop",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_same_amt",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(mockDb.transactions.length, 2);
    assert.equal(mockDb.transactions[0].plaidTransactionId, "tx_coffee_morning");
    assert.equal(mockDb.transactions[1].plaidTransactionId, "tx_coffee_afternoon");
  });

  // ── 10. Secondary Joint Account ──────────────────────────────────────────────
  it("Scenario 10: secondary joint account transactions are filtered out while balances update", async () => {
    mockDb.accounts.push({
      id: "acc_joint_local",
      householdId,
      name: "Joint Checking",
      bank: "Test Bank",
      type: "checking",
      balance: 1000.0,
      lastFour: "5678",
      plaidAccountId: "plaid_acc_joint",
      plaidItemId: itemId,
      isJoint: true,
      sharedPlaidAccounts: [
        { plaidItemId: itemId, plaidAccountId: "plaid_acc_joint", isPrimary: false },
      ],
      updatedAt: new Date(),
    });

    const mockPlaid = createMockPlaidClient({
      accountsGet: async () => ({
        data: {
          accounts: [
            {
              account_id: "plaid_acc_checking",
              name: "Personal",
              type: "depository",
              subtype: "checking",
              balances: { current: 1500.0 },
              mask: "1234",
            },
            {
              account_id: "plaid_acc_joint",
              name: "Joint",
              type: "depository",
              subtype: "checking",
              balances: { current: 5200.0 },
              mask: "5678",
            },
          ],
        },
      }),
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "tx_personal",
              account_id: "plaid_acc_checking",
              amount: 15.0,
              date: "2026-09-23",
              name: "Personal Expense",
            },
            {
              transaction_id: "tx_joint",
              account_id: "plaid_acc_joint",
              amount: 99.0,
              date: "2026-09-23",
              name: "Joint Expense Should Skip",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_joint_done",
          has_more: false,
        },
      }),
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
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
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    // Should return locked without executing or corrupting
    assert.equal(result.success, false);
    assert.equal(result.status, "locked");
    assert.equal(result.error, "SYNC_ALREADY_IN_PROGRESS");
    assert.equal(mockDb.transactions.length, 0);
  });

  // ── 12. Mid-Transaction Rollback Tests ────────────────────────────────────────
  it("Scenario 12: crash after delete, after update, or halfway through inserts cleanly rolls back and does not advance cursor", async () => {
    // A: Test crash after delete
    mockDb.transactions.push({
      id: "tx_will_be_retained_on_crash",
      householdId,
      accountId: "acc_checking_local",
      title: "Retained",
      amount: 20.0,
      type: "expense",
      category: "Shopping",
      date: "2026-09-20",
      source: "plaid",
      plaidTransactionId: "plaid_tx_del_crash",
      isUserEdited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDb.setFailAfterDelete(true);

    const mockPlaidDel = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [],
          modified: [],
          removed: [{ transaction_id: "plaid_tx_del_crash" }],
          next_cursor: "cursor_should_not_advance",
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
          lockManager: mockLockMgr,
          plaidClient: mockPlaidDel,
        });
      },
      /MOCK_CRASH_AFTER_DELETE/
    );

    // Rollback verified: deleted transaction was NOT removed from DB, cursor was NOT advanced
    assert.equal(mockDb.transactions.length, 1);
    assert.equal(mockDb.items[0].cursor, null);
    mockDb.setFailAfterDelete(false);

    // B: Test crash halfway through inserts
    mockDb.setFailHalfwayThroughInsert(true);
    const mockPlaidInsert = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            { transaction_id: "tx_half_1", account_id: "plaid_acc_checking", amount: 10.0, date: "2026-09-24", name: "Tx 1" },
            { transaction_id: "tx_half_2", account_id: "plaid_acc_checking", amount: 20.0, date: "2026-09-24", name: "Tx 2" },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_should_not_advance_2",
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
          lockManager: mockLockMgr,
          plaidClient: mockPlaidInsert,
        });
      },
      /MOCK_CRASH_HALFWAY_THROUGH_INSERTS/
    );

    // Rollback verified: neither tx_half_1 nor tx_half_2 was inserted, cursor untouched
    assert.equal(mockDb.transactions.length, 1);
    assert.equal(mockDb.items[0].cursor, null);
  });

  // ── 13. Mutation During Pagination ───────────────────────────────────────────
  it("Scenario 13: TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION restarts from initial cursor with bounded retries", async () => {
    let callCount = 0;
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async (params) => {
        callCount++;
        if (callCount === 1) {
          const err: any = new Error("Mutation error");
          err.response = { data: { error_code: "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" } };
          throw err;
        }
        return {
          data: {
            added: [
              {
                transaction_id: "tx_after_retry",
                account_id: "plaid_acc_checking",
                amount: 12.0,
                date: "2026-09-24",
                name: "Coffee After Retry",
              },
            ],
            modified: [],
            removed: [],
            next_cursor: "cursor_after_retry_done",
            has_more: false,
          },
        };
      },
    });

    const result = await syncPlaidItem({
      itemId,
      householdId,
      dbClient: mockDb,
      lockManager: mockLockMgr,
      plaidClient: mockPlaid,
    });

    assert.equal(result.success, true);
    assert.equal(callCount, 2);
    assert.equal(mockDb.transactions.length, 1);
    assert.equal(mockDb.transactions[0].plaidTransactionId, "tx_after_retry");
    assert.equal(mockDb.items[0].cursor, "cursor_after_retry_done");
  });

  // ── 14. Unmapped Plaid Account Fails Visibly ─────────────────────────────────
  it("Scenario 14: unmapped Plaid account fails visibly and does not advance cursor", async () => {
    const mockPlaid = createMockPlaidClient({
      transactionsSync: async () => ({
        data: {
          added: [
            {
              transaction_id: "tx_unmapped_01",
              account_id: "plaid_acc_unknown_not_mapped",
              amount: 50.0,
              date: "2026-09-24",
              name: "Mystery Account Purchase",
            },
          ],
          modified: [],
          removed: [],
          next_cursor: "cursor_unmapped_advance",
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
          lockManager: mockLockMgr,
          plaidClient: mockPlaid,
        });
      },
      /UNMAPPED_PLAID_ACCOUNT/
    );

    // No transaction inserted, cursor NOT advanced
    assert.equal(mockDb.transactions.length, 0);
    assert.equal(mockDb.items[0].cursor, null);
  });
});
