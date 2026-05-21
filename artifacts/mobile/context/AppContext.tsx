import AsyncStorage from "@react-native-async-storage/async-storage";
import { useDbSyncPrefs, SyncableType } from "./DbSyncPrefsContext";
import {
  cancelBillNotifications,
  scheduleBillNotifications,
  setupNotificationsOnInit,
  registerPushTokenWithServer,
  scheduleTaskReminder,
  cancelTaskReminder,
} from "@/services/notificationService";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface Transaction {
  id: string;
  title: string;
  merchant?: string;
  projectId?: string;
  projectName?: string;
  isRefund?: boolean;
  isRefundComplete?: boolean;
  amount: number;
  type: "income" | "expense";
  category: string;
  accountId: string;
  date: string;
  /** "plaid" | "email" | "manual" */
  source?: "plaid" | "email" | "manual";
  /** @deprecated use source === "email" */
  fromEmail?: boolean;
  bank?: string;
  note?: string;
  receipts?: string[];
  /** Plaid item this transaction came from — enables scoped remapping */
  plaidItemId?: string;
  /** Raw Plaid account_id — O(1) remap key, never changes */
  plaidAccountId?: string;
  /** Links split transactions together — all splits from the same operation share this id */
  splitGroupId?: string;
}

export interface Account {
  id: string;
  name: string;
  bank: string;
  balance: number;
  type: "checking" | "savings" | "credit" | "investment";
  color: string;
  lastFour?: string;
  currency?: string;
  /** When false, this account is excluded from net worth. Defaults to true. */
  includeInNetworth?: boolean;
  /** Whether this is a joint account shared with another person */
  isJoint?: boolean;
  /** Name of the person who owns this account (shown on transaction cards) */
  accountHolder?: string;
  /** Set when this account was imported via Plaid */
  plaidItemId?: string;
  plaidAccountId?: string;
}

export interface Bill {
  id: string;
  title: string;
  amount: number;
  dueDate: string;
  category: string;
  isPaid: boolean;
  isRecurring: boolean;
  frequency?: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "semiannual" | "yearly";
  accountId?: string;
  receipts?: string[];
  notes?: string;
  remindDays?: string;
  autoPaid?: boolean;
  billNumber?: string;
  addExpenseEntry?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Budget {
  id: string;
  name: string;
  amount: number;
  category?: string;
  type: "expense" | "income";
  period: "weekly" | "monthly" | "yearly";
  includeInOverall: boolean;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate?: string;
  category?: string;
  color?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  email?: string;
  paymentMode?: string;
  dueDate: string;
  notes?: string;
  priority: "low" | "medium" | "high";
  isCompleted: boolean;
  reminderEnabled: boolean;
  reminderDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  createdAt: string;
}

export interface Category {
  id: string;
  householdId: string;
  name: string;
  description?: string;
  type: "expense" | "income" | "both";
  icon?: string;
  iconType?: "icon" | "image" | "emoji";
  color: string;
  parentId?: string;
  providerType?: string;
  merchantType?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSync {
  email: string;
  appPassword: string;
  isConnected: boolean;
  lastSynced?: string;
  lastEmailsScanned?: number;
  lastImported?: number;
  lastParsed?: Array<{
    title: string;
    merchant: string;
    amount: number;
    type: "income" | "expense";
    bank: string;
    rawSubject: string;
    lastFour?: string;
  }>;
}

export interface PlaidItem {
  itemId: string;
  bankName: string;
  bankColor: string;
  connectedAt: string;
  lastSynced?: string;
  lastImported?: number;
  accountIds: string[];
  /** Maps Plaid account_id → local account id. Persisted so sync works after server round-trips. */
  plaidAccountMap?: Record<string, string>;
}

export interface PlaidSync {
  items: PlaidItem[];
}

export interface InvestmentTransaction {
  id: string;
  plaidTxId: string;
  plaidItemId: string;
  plaidAccountId: string;
  accountId: string;
  date: string;
  name: string;
  ticker?: string | null;
  type: string;
  subtype?: string | null;
  quantity?: number | null;
  amount: number;
  fees?: number | null;
  currency: string;
}

export interface Holding {
  id: string;
  plaidItemId: string;
  plaidAccountId: string;
  accountId: string;
  ticker?: string | null;
  name: string;
  securityType: string;
  quantity: number;
  value: number;
  costBasis?: number | null;
  currency: string;
  asOf?: string | null;
  updatedAt: string;
}

export interface CategoryRule {
  id: string;
  householdId: string;
  merchantPattern: string;
  merchantExact?: string;
  /** Source category to remap FROM. Null/undefined = any category (merchant-only rule). */
  fromCategory?: string | null;
  category: string;
  hitCount: number;
  source: "manual" | "learned";
  /** "future" = apply to new txs only. "past_and_future" = also retroactively applied on creation. */
  applyScope?: "future" | "past_and_future";
  createdAt: string;
  updatedAt: string;
}

interface AppContextType {
  transactions: Transaction[];
  accounts: Account[];
  bills: Bill[];
  budgets: Budget[];
  goals: Goal[];
  projects: Project[];
  categories: Category[];
  categoryRules: CategoryRule[];
  emailSync: EmailSync;
  plaidSync: PlaidSync;
  investmentTransactions: InvestmentTransaction[];
  holdings: Holding[];
  userName: string;
  setUserName: (name: string) => void;
  reviewedTransactionIds: string[];
  markTransactionReviewed: (id: string) => void;
  addTransaction: (t: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, t: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addAccount: (a: Omit<Account, "id"> & { forceCreate?: boolean }) => string;
  remapEmailTransactions: (bankPattern: string, accountId: string) => void;
  updateAccount: (id: string, a: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  addBill: (b: Omit<Bill, "id">) => void;
  updateBill: (id: string, b: Partial<Bill>) => void;
  deleteBill: (id: string) => void;
  markBillPaid: (id: string) => void;
  addBudget: (b: Omit<Budget, "id" | "createdAt" | "updatedAt">) => void;
  updateBudget: (id: string, b: Partial<Budget>) => void;
  deleteBudget: (id: string) => void;
  addGoal: (g: Omit<Goal, "id" | "createdAt" | "updatedAt">) => void;
  updateGoal: (id: string, g: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  tasks: Task[];
  addTask: (t: Omit<Task, "id" | "createdAt" | "updatedAt">) => void;
  updateTask: (id: string, t: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  addProject: (p: Omit<Project, "id" | "createdAt">) => string;
  updateProject: (id: string, p: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  addCategory: (c: Omit<Category, "id" | "householdId" | "createdAt" | "updatedAt">) => void;
  updateCategory: (id: string, c: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  seedCategories: () => Promise<void>;
  learnCategoryRule: (merchantTitle: string, category: string) => void;
  autoCategorize: (title: string) => string | null;
  addCategoryMappingRule: (rule: { merchantPattern?: string; merchantExact?: string; fromCategory?: string | null; category: string; applyScope: "future" | "past_and_future" }) => void;
  deleteCategoryRule: (id: string) => void;
  connectEmail: (email: string, appPassword: string) => Promise<{ success: boolean; error?: string }>;
  disconnectEmail: () => void;
  resetEmailTransactions: () => void;
  syncEmailTransactions: () => Promise<{ imported: number; parsed?: any[]; error?: string }>;
  wipeAllTransactions: () => Promise<void>;
  wipePortfolio: () => Promise<void>;
  wipeData: (
    categories: Array<"expenses" | "income" | "transfers" | "transactions" | "accounts" | "bills" | "budgets" | "goals" | "portfolio" | "connections">,
    filters?: { startDate?: string; endDate?: string; accountIds?: string[] }
  ) => Promise<void>;
  connectPlaid: (item: PlaidItem, newAccounts: Omit<Account, "id">[], initialTransactions: Omit<Transaction, "id">[], rawHoldingsData?: any[], rawInvTxsData?: any[]) => Promise<{ imported: number }>;
  syncPlaidTransactions: (itemId: string, forceFullSync?: boolean) => Promise<{ imported: number; error?: string }>;
  delinkPlaid: (itemId: string) => void;
  disconnectPlaid: (itemId: string) => void;
  isSyncing: boolean;
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  deviceId: string;
  householdId: string;
  changeHouseholdId: (code: string) => Promise<void>;
  uploadToDb: (type: SyncableType, uploadExisting: boolean) => Promise<{ uploaded: number; error?: string }>;
  pullFromDb: (type: SyncableType, since?: string) => Promise<{ pulled: number; error?: string }>;
}

const AppContext = createContext<AppContextType | null>(null);

// Bump this whenever a breaking change requires wiping stale local transactions.
const STORAGE_VERSION = "2";

const STORAGE_KEYS = {
  version: "@fintrack/storageVersion",
  transactions: "@fintrack/transactions",
  accounts: "@fintrack/accounts",
  bills: "@fintrack/bills",
  budgets: "@fintrack/budgets",
  goals: "@fintrack/goals",
  projects: "@fintrack/projects",
  categories: "@fintrack/categories",
  emailSync: "@fintrack/emailSync",
  plaidSync: "@fintrack/plaidSync",
  deviceId: "@fintrack/deviceId",
  householdId: "@fintrack/householdId",
  userName: "@fintrack/userName",
  reviewedTransactionIds: "@fintrack/reviewedTransactionIds",
  categoryRules: "@fintrack/categoryRules",
  tasks: "@fintrack/tasks",
  investmentTransactions: "@fintrack/investmentTransactions",
  holdings: "@fintrack/holdings",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function generateDeviceId() {
  return "dev_" + genId() + "_" + Date.now().toString(36);
}

// ── Default categories (seeded locally on first launch) ───────────────────────

type DefaultCat = { name: string; icon: string; color: string; type: "expense" | "income" | "both"; subs?: string[] };

const DEFAULT_CAT_DEFS: DefaultCat[] = [
  { name: "Bills & Utilities", icon: "file-text", color: "#6366f1", type: "expense", subs: ["Electricity", "Gas", "Internet", "Mobile", "Phone", "Sewage & Garbage", "Water"] },
  { name: "Drink & Dine",      icon: "coffee",    color: "#f97316", type: "expense", subs: ["Restaurant", "Cafe", "Fast Food", "Bar", "Delivery"] },
  { name: "Education",         icon: "book-open", color: "#8b5cf6", type: "expense", subs: ["Tuition", "Books", "Courses", "Supplies"] },
  { name: "Entertainment",     icon: "film",      color: "#ec4899", type: "expense", subs: ["Movies", "Games", "Streaming", "Events", "Music"] },
  { name: "Events",            icon: "calendar",  color: "#14b8a6", type: "expense", subs: ["Wedding", "Birthday", "Party", "Festival"] },
  { name: "Family Care",       icon: "users",     color: "#f59e0b", type: "expense", subs: ["Childcare", "Elder Care", "Family Activities"] },
  { name: "Fees & Charges",    icon: "alert-circle", color: "#64748b", type: "expense", subs: ["Bank Fees", "Late Fees", "Service Charges"] },
  { name: "Financial Services",icon: "dollar-sign", color: "#3b82f6", type: "expense", subs: ["Advisory", "Tax Prep", "Accounting"] },
  { name: "Food & Grocery",    icon: "shopping-cart", color: "#10b981", type: "expense", subs: ["Groceries", "Snacks", "Organic", "Meat & Seafood"] },
  { name: "Gifts & Donations", icon: "gift",      color: "#e11d48", type: "expense", subs: ["Charity", "Gifts", "Donations"] },
  { name: "Health & Fitness",  icon: "heart",     color: "#ef4444", type: "expense", subs: ["Gym", "Pharmacy", "Doctor", "Dental", "Vision"] },
  { name: "House",             icon: "home",      color: "#7c3aed", type: "expense", subs: ["Rent", "Mortgage", "Maintenance", "Furniture"] },
  { name: "Insurance",         icon: "shield",    color: "#475569", type: "expense", subs: ["Health", "Auto", "Home", "Life"] },
  { name: "Investments",       icon: "trending-up", color: "#059669", type: "income", subs: ["Stocks", "Bonds", "Crypto", "Mutual Funds"] },
  { name: "Kids Care",         icon: "smile",     color: "#f472b6", type: "expense", subs: ["School", "Toys", "Clothing", "Activities"] },
  { name: "Loan & Debts",      icon: "credit-card", color: "#dc2626", type: "expense", subs: ["Student Loan", "Car Loan", "Credit Card"] },
  { name: "Misc Expenses",     icon: "more-horizontal", color: "#fbbf24", type: "expense", subs: ["Other", "Uncategorized"] },
  { name: "Office & Business", icon: "briefcase", color: "#0284c7", type: "expense", subs: ["Supplies", "Software", "Equipment"] },
  { name: "Others",            icon: "grid",      color: "#94a3b8", type: "both" },
  { name: "Personal Care",     icon: "scissors",  color: "#db2777", type: "expense", subs: ["Salon", "Spa", "Skincare", "Cosmetics"] },
  { name: "Pet Care",          icon: "anchor",    color: "#84cc16", type: "expense", subs: ["Food", "Vet", "Grooming"] },
  { name: "Refunds",           icon: "rotate-ccw", color: "#22c55e", type: "income" },
  { name: "Shopping",          icon: "shopping-bag", color: "#a855f7", type: "expense", subs: ["Clothing", "Electronics", "Online", "Home Decor"] },
  { name: "Taxes",             icon: "percent",   color: "#78716c", type: "expense", subs: ["Income Tax", "Property Tax"] },
  { name: "Transfer",          icon: "repeat",    color: "#6b7280", type: "both" },
  { name: "Transport",         icon: "navigation", color: "#0ea5e9", type: "expense", subs: ["Gas", "Parking", "Public Transit", "Ride Share"] },
  { name: "Travel & Vacation", icon: "map",       color: "#f59e0b", type: "expense", subs: ["Flights", "Hotels", "Activities", "Food"] },
  { name: "Salary",            icon: "briefcase", color: "#10b981", type: "income" },
  { name: "Freelance",         icon: "cpu",       color: "#06b6d4", type: "income" },
  { name: "Business",          icon: "bar-chart-2", color: "#8b5cf6", type: "income" },
  { name: "Gift Received",     icon: "gift",      color: "#f43f5e", type: "income" },
];

function buildDefaultCategories(householdId: string): Category[] {
  const result: Category[] = [];
  const now = new Date().toISOString();
  for (const def of DEFAULT_CAT_DEFS) {
    const catId = genId();
    result.push({
      id: catId, householdId, name: def.name, type: def.type,
      icon: def.icon, iconType: "icon", color: def.color,
      isDefault: true, createdAt: now, updatedAt: now,
    });
    for (const sub of (def.subs ?? [])) {
      result.push({
        id: genId(), householdId, name: sub, type: def.type,
        icon: def.icon, iconType: "icon", color: def.color,
        parentId: catId, isDefault: true, createdAt: now, updatedAt: now,
      });
    }
  }
  return result;
}

const HOUSEHOLD_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateHouseholdCode(): string {
  return Array.from(
    { length: 6 },
    () => HOUSEHOLD_CHARS[Math.floor(Math.random() * HOUSEHOLD_CHARS.length)]
  ).join("");
}

export function getApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}`;
  return "https://fintrack-api-fmfl.onrender.com";
}

async function apiCall(
  path: string,
  method: string,
  householdId: string,
  deviceId: string,
  body?: unknown
): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${getApiBase()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Household-ID": householdId,
        "X-Device-ID": deviceId,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res;
  } catch (err: any) {
    console.warn(`[API] ${method} ${path} — network error:`, err?.message ?? err);
    return null;
  }
}

/** Fire-and-forget API call. Logs non-ok responses but never throws. */
function bgCall(
  path: string,
  method: string,
  householdId: string,
  deviceId: string,
  body?: unknown
): void {
  apiCall(path, method, householdId, deviceId, body)
    .then((res) => {
      if (res && !res.ok) {
        res.json().then((data) =>
          console.warn(`[API] ${method} ${path} — ${res.status}:`, data?.error ?? data)
        ).catch(() => {
          console.warn(`[API] ${method} ${path} — ${res.status} (non-JSON response)`);
        });
      }
    })
    .catch((err) => console.warn(`[API] ${method} ${path} — unexpected error:`, err));
}

/** Source priority: higher wins when the same transaction arrives from multiple sources. */
const SOURCE_PRIORITY: Record<string, number> = { plaid: 3, manual: 2, email: 1 };

/**
 * Dedup key: accountId + amount + date (day-precision).
 * Intentionally excludes title/bank — Gmail parses "Transaction at X" while Plaid
 * returns "X"; the three stable fields catch cross-source duplicates cleanly.
 */
function dedupKey(t: { amount: number; date: string; accountId?: string }): string {
  return `${(t.accountId ?? "").toLowerCase()}|${t.amount}|${t.date.slice(0, 10)}`;
}

/**
 * Merge incoming transactions into prev, deduplicating by both dedupKey (content)
 * and id. This prevents the same logical transaction from appearing twice when its
 * accountId changes (e.g., Plaid raw account ID → local UUID after remapping).
 * Higher-priority sources (plaid > manual > email) win on collision.
 */
function upsertTransactions(prev: Transaction[], incoming: Transaction[]): Transaction[] {
  const byContent = new Map<string, Transaction>(); // dedupKey → tx
  const byId = new Map<string, Transaction>();      // id → winning tx

  const addTx = (t: Transaction) => {
    const key = dedupKey(t);
    const tp = SOURCE_PRIORITY[t.source ?? ""] ?? 0;

    // Same-id conflict: same logical tx but different accountId (remapping artefact)
    const sameId = t.id ? byId.get(t.id) : undefined;
    if (sameId) {
      const sp = SOURCE_PRIORITY[sameId.source ?? ""] ?? 0;
      if (tp <= sp) return; // keep existing higher-priority version
      // Incoming wins — evict old entry from content map
      byContent.delete(dedupKey(sameId));
    }

    // Same-content conflict: different source for same transaction
    const sameContent = byContent.get(key);
    if (sameContent) {
      const sp = SOURCE_PRIORITY[sameContent.source ?? ""] ?? 0;
      if (tp <= sp) return;
      if (sameContent.id) byId.delete(sameContent.id);
    }

    byContent.set(key, t);
    if (t.id) byId.set(t.id, t);
  };

  prev.forEach(addTx);
  incoming.forEach(addTx);

  return Array.from(byContent.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/** Find the best matching account for a bank name and optional last-4 digits */
function findAccountMatch(
  accounts: Account[],
  bank: string,
  lastFour?: string
): Account | undefined {
  const bankLower = bank.trim().toLowerCase();
  const bankMatches = (a: Account) =>
    a.bank.toLowerCase().includes(bankLower) || bankLower.includes(a.bank.toLowerCase());
  if (lastFour) {
    const strict = accounts.find((a) => a.lastFour === lastFour && bankMatches(a));
    if (strict) return strict;
  }
  if (lastFour) {
    const byLastFour = accounts.find((a) => a.lastFour === lastFour);
    if (byLastFour) return byLastFour;
  }
  return accounts.find(bankMatches);
}

function remapEmailTransactionsForAccount(
  transactions: Transaction[],
  account: Account
): Transaction[] {
  if (!account.bank && !account.lastFour) return transactions;
  const bankLower = account.bank.trim().toLowerCase();
  return transactions.map((t) => {
    if (t.source !== "email") return t;
    const tb = (t.bank ?? "").toLowerCase();
    const tm = (t.merchant ?? t.title ?? "").toLowerCase();
    const matchesBank = !!account.bank && (tb.includes(bankLower) || bankLower.includes(tb) || tm.includes(bankLower));
    const matchesLastFour =
      !!account.lastFour &&
      (t.note?.includes(account.lastFour) ||
        t.title.includes(account.lastFour) ||
        t.merchant?.includes(account.lastFour));
    return matchesBank || matchesLastFour ? { ...t, accountId: account.id } : t;
  });
}

/**
 * Resolve the local accountId for an imported transaction.
 * - plaid: plaidAccMap[plaidAccountId] (O(1), stable)
 * - email: findAccountMatch by bank name + last4
 * Returns "" if no match — caller must handle fallback.
 */
function resolveAccountId(
  source: "plaid" | "email" | "manual",
  accounts: Account[],
  params: { plaidAccountId?: string; bank?: string; lastFour?: string },
  plaidAccMap?: Record<string, string>
): string {
  if (source === "plaid") {
    return (params.plaidAccountId && plaidAccMap ? plaidAccMap[params.plaidAccountId] : undefined) ?? "";
  }
  if (source === "email" && params.bank) {
    return findAccountMatch(accounts, params.bank, params.lastFour)?.id ?? "";
  }
  return "";
}

/**
 * Normalize an imported transaction: resolve accountId, apply category rules,
 * attach plaidItemId + plaidAccountId. Used by both email and Plaid paths.
 */
function normalizeImportedTx(
  raw: Omit<Transaction, "id" | "accountId"> & { id?: string; accountId?: string },
  source: "plaid" | "email",
  accounts: Account[],
  categoryRules: CategoryRule[],
  opts: {
    plaidAccMap?: Record<string, string>;
    plaidItemId?: string;
    fallbackAccountId?: string;
  } = {}
): Transaction {
  const id = raw.id ?? (Date.now().toString(36) + Math.random().toString(36).slice(2, 9));

  // 1. Resolve accountId
  const resolvedAccountId =
    resolveAccountId(
      source,
      accounts,
      { plaidAccountId: raw.plaidAccountId, bank: raw.bank, lastFour: undefined },
      opts.plaidAccMap
    ) || opts.fallbackAccountId || raw.accountId || "";

  // 2. Apply category rules (user-defined rules override source category)
  const needle = (raw.merchant || raw.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  let category = raw.category || "Others";
  if (needle) {
    const rules = categoryRules;
    const exact = rules.find((r) => r.merchantPattern === needle);
    if (exact) {
      category = exact.category;
    } else {
      const partial = rules
        .filter((r) => needle.includes(r.merchantPattern) || r.merchantPattern.includes(needle))
        .sort((a, b) => b.hitCount - a.hitCount)[0];
      if (partial) category = partial.category;
    }
  }

  return {
    ...raw,
    id,
    accountId: resolvedAccountId,
    category,
    source,
    plaidItemId: opts.plaidItemId ?? raw.plaidItemId,
    plaidAccountId: raw.plaidAccountId,
  };
}

/**
 * Returns true if a transaction belongs to the given account.
 * Matches by local UUID first; falls back to plaidAccountId for transactions
 * that were synced before the account-ID remapping ran.
 */
export function txBelongsToAccount(tx: Transaction, account: Account): boolean {
  if (tx.accountId === account.id) return true;
  if (account.plaidAccountId && tx.plaidAccountId === account.plaidAccountId) return true;
  return false;
}

/**
 * Effective balance = stored base balance adjusted by linked transactions.
 *
 * For Plaid-connected accounts the stored `balance` is the authoritative
 * live balance synced from Plaid (which already reflects all Plaid-imported
 * transactions). Applying those transactions again would double-count them.
 * Only manual (non-Plaid) transactions are applied on top so user entries
 * made between syncs are reflected immediately.
 *
 * For manual accounts there is no Plaid snapshot, so all transactions
 * (including Plaid-sourced ones, if any) are applied to the initial balance.
 */
export function computeBalance(account: Account, transactions: Transaction[]): number {
  const isPlaidAccount = !!(account.plaidAccountId || account.plaidItemId);
  const net = transactions
    .filter((t) => txBelongsToAccount(t, account))
    .filter((t) => !isPlaidAccount || t.source !== "plaid")
    .reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0);
  return account.balance + net;
}

/**
 * Whether an account contributes to net worth.
 * All account types are included by default; only excluded when explicitly set.
 * Net worth = assets (positive balances) - liabilities (negative balances).
 */
export function isIncludedInNetworth(account: Account): boolean {
  if (account.includeInNetworth === false) return false;
  return true;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [emailSync, setEmailSync] = useState<EmailSync>({ email: "", appPassword: "", isConnected: false });
  const [plaidSync, setPlaidSync] = useState<PlaidSync>({ items: [] });
  const [investmentTransactions, setInvestmentTransactions] = useState<InvestmentTransaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [householdId, setHouseholdId] = useState<string>("");
  const [userName, setUserNameState] = useState<string>("");
  const [reviewedTransactionIds, setReviewedTransactionIds] = useState<string[]>([]);
  const { prefs: syncPrefs } = useDbSyncPrefs();
  const syncPrefsRef = useRef(syncPrefs);
  useEffect(() => { syncPrefsRef.current = syncPrefs; }, [syncPrefs]);
  const deviceIdRef = useRef<string>("");
  const householdIdRef = useRef<string>("");
  const accountsRef = useRef<Account[]>([]);
  const transactionsRef = useRef<Transaction[]>([]);
  const billsRef = useRef<Bill[]>([]);
  const budgetsRef = useRef<Budget[]>([]);
  const goalsRef = useRef<Goal[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const categoryRulesRef = useRef<CategoryRule[]>([]);
  useEffect(() => { categoryRulesRef.current = categoryRules; }, [categoryRules]);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { billsRef.current = bills; }, [bills]);
  useEffect(() => { budgetsRef.current = budgets; }, [budgets]);
  useEffect(() => { goalsRef.current = goals; }, [goals]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  useEffect(() => {
    (async () => {
      try {
        const [storedVersion, txRaw, accRaw, billRaw, budgetRaw, goalRaw, projectRaw, catRaw, rulesRaw, emailRaw, plaidRaw, storedDeviceId, storedHouseholdId, storedUserName, storedReviewedIds, taskRaw, invTxRaw, holdRaw] =
          await Promise.all([
            AsyncStorage.getItem(STORAGE_KEYS.version),
            AsyncStorage.getItem(STORAGE_KEYS.transactions),
            AsyncStorage.getItem(STORAGE_KEYS.accounts),
            AsyncStorage.getItem(STORAGE_KEYS.bills),
            AsyncStorage.getItem(STORAGE_KEYS.budgets),
            AsyncStorage.getItem(STORAGE_KEYS.goals),
            AsyncStorage.getItem(STORAGE_KEYS.projects),
            AsyncStorage.getItem(STORAGE_KEYS.categories),
            AsyncStorage.getItem(STORAGE_KEYS.categoryRules),
            AsyncStorage.getItem(STORAGE_KEYS.emailSync),
            AsyncStorage.getItem(STORAGE_KEYS.plaidSync),
            AsyncStorage.getItem(STORAGE_KEYS.deviceId),
            AsyncStorage.getItem(STORAGE_KEYS.householdId),
            AsyncStorage.getItem(STORAGE_KEYS.userName),
            AsyncStorage.getItem(STORAGE_KEYS.reviewedTransactionIds),
            AsyncStorage.getItem(STORAGE_KEYS.tasks),
            AsyncStorage.getItem(STORAGE_KEYS.investmentTransactions),
            AsyncStorage.getItem(STORAGE_KEYS.holdings),
          ]);

        const dId = storedDeviceId || generateDeviceId();
        if (!storedDeviceId) await AsyncStorage.setItem(STORAGE_KEYS.deviceId, dId);
        deviceIdRef.current = dId;
        setDeviceId(dId);

        const hId = storedHouseholdId || generateHouseholdCode();
        if (!storedHouseholdId) await AsyncStorage.setItem(STORAGE_KEYS.householdId, hId);
        householdIdRef.current = hId;
        setHouseholdId(hId);

        // If storage version changed, wipe stale local transactions so we start clean.
        const versionOk = storedVersion === STORAGE_VERSION;
        if (!versionOk) {
          await AsyncStorage.setItem(STORAGE_KEYS.version, STORAGE_VERSION);
          await AsyncStorage.removeItem(STORAGE_KEYS.transactions);
        }

        const localTxs: Transaction[] = versionOk && txRaw ? JSON.parse(txRaw) : [];
        setTransactions(localTxs);
        setAccounts(accRaw ? JSON.parse(accRaw) : []);
        const parsedBills: Bill[] = billRaw ? JSON.parse(billRaw) : [];
        // Migrate legacy data: recurring bills that got permanently isPaid:true
        // should be reset to the next future occurrence
        const advanceBillDate = (date: Date, freq: string): Date => {
          const d = new Date(date);
          switch (freq) {
            case "daily":      d.setDate(d.getDate() + 1);         break;
            case "weekly":     d.setDate(d.getDate() + 7);         break;
            case "biweekly":   d.setDate(d.getDate() + 14);        break;
            case "monthly":    d.setMonth(d.getMonth() + 1);       break;
            case "quarterly":  d.setMonth(d.getMonth() + 3);       break;
            case "semiannual": d.setMonth(d.getMonth() + 6);       break;
            case "yearly":     d.setFullYear(d.getFullYear() + 1); break;
          }
          return d;
        };
        const migratedBills = parsedBills.map((b) => {
          if (b.isPaid && b.isRecurring && b.frequency) {
            let d = new Date(b.dueDate);
            do { d = advanceBillDate(d, b.frequency!); } while (d.getTime() < Date.now());
            return { ...b, dueDate: d.toISOString(), isPaid: false };
          }
          return b;
        });
        setBills(migratedBills);
        setupNotificationsOnInit(migratedBills);
        registerPushTokenWithServer(getApiBase(), hId, dId);
        setBudgets(budgetRaw ? JSON.parse(budgetRaw) : []);
        setGoals(goalRaw ? JSON.parse(goalRaw) : []);
        setTasks(taskRaw ? JSON.parse(taskRaw) : []);
        setProjects(projectRaw ? JSON.parse(projectRaw) : []);
        setCategoryRules(rulesRaw ? JSON.parse(rulesRaw) : []);
        if (emailRaw) setEmailSync(JSON.parse(emailRaw));
        if (plaidRaw) setPlaidSync(JSON.parse(plaidRaw));
        if (invTxRaw) setInvestmentTransactions(JSON.parse(invTxRaw));
        if (holdRaw) setHoldings(JSON.parse(holdRaw));
        if (storedUserName) setUserNameState(storedUserName);
        if (storedReviewedIds) setReviewedTransactionIds(JSON.parse(storedReviewedIds));

        // ── Load categories ───────────────────────────────────────────────────
        const savedCats: Category[] = catRaw ? JSON.parse(catRaw) : [];
        if (savedCats.length > 0) setCategories(savedCats);
        try {
          const catFetch = await fetch(`${getApiBase()}/api/categories`, {
            headers: { "X-Household-ID": hId, "X-Device-ID": dId },
            signal: AbortSignal.timeout(6000),
          });
          if (catFetch.ok) {
            const remoteCats: Category[] = await catFetch.json();
            if (remoteCats.length > 0) {
              setCategories(remoteCats);
            } else if (savedCats.length === 0) {
              const defaults = buildDefaultCategories(hId);
              setCategories(defaults);
              fetch(`${getApiBase()}/api/categories/seed`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Household-ID": hId, "X-Device-ID": dId },
              }).catch(() => {});
            }
          } else if (savedCats.length === 0) {
            setCategories(buildDefaultCategories(hId));
          }
        } catch {
          if (savedCats.length === 0) setCategories(buildDefaultCategories(hId));
        }

        // ── Load category rules ───────────────────────────────────────────────
        try {
          const rulesFetch = await fetch(`${getApiBase()}/api/category-rules`, {
            headers: { "X-Household-ID": hId, "X-Device-ID": dId },
            signal: AbortSignal.timeout(6000),
          });
          if (rulesFetch.ok) {
            const remoteRules: CategoryRule[] = await rulesFetch.json();
            if (remoteRules.length > 0) setCategoryRules(remoteRules);
          }
        } catch {}

        // ── Background: push local transactions to server ─────────────────────
        if (localTxs.length > 0) {
          fetch(`${getApiBase()}/api/transactions/bulk`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Household-ID": hId, "X-Device-ID": dId },
            body: JSON.stringify({ transactions: localTxs }),
          }).catch(() => {});
        }

        // ── Background: pull server transactions and merge via upsertTransactions ──
        // upsertTransactions handles dedup by accountId|amount|date and prefers
        // plaid > manual > email, so cross-source duplicates are always collapsed.
        fetch(`${getApiBase()}/api/transactions`, {
          headers: { "X-Household-ID": hId, "X-Device-ID": dId },
        }).then(async (r) => {
          if (!r.ok) return;
          const serverTxs: Transaction[] = await r.json();
          if (serverTxs.length > 0) {
            setTransactions((prev) => upsertTransactions(prev, serverTxs));
          }
        }).catch(() => {});

        // ── Background: pull server accounts (always authoritative for account list) ──
        fetch(`${getApiBase()}/api/accounts`, {
          headers: { "X-Household-ID": hId, "X-Device-ID": dId },
        }).then(async (r) => {
          if (!r.ok) return;
          const serverAccts: Account[] = await r.json();
          setAccounts((prev) => {
            const serverAcctsMap = new Map(serverAccts.map((a) => [a.id, a]));
            const byId = new Map(prev.map((a) => [a.id, a]));

            // Upload any local accounts missing on the server in one bulk request (e.g. after a DB wipe)
            const missingOnServer = prev.filter((a) => !serverAcctsMap.has(a.id));
            if (missingOnServer.length > 0) {
              fetch(`${getApiBase()}/api/accounts/bulk-upsert`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Household-ID": hId, "X-Device-ID": dId },
                body: JSON.stringify({ accounts: missingOnServer }),
              }).catch((err) => console.warn("[API] startup account self-heal failed:", err));
            }

            const next = serverAccts.map((s) => {
              const local = byId.get(s.id);
              return {
                ...(local ?? {}),
                ...s,
                // Preserve local Plaid metadata if server returns null (new columns not yet backfilled)
                plaidItemId: s.plaidItemId ?? local?.plaidItemId,
                plaidAccountId: s.plaidAccountId ?? local?.plaidAccountId,
              } as Account;
            });
            const localOnly = prev.filter((a) => !next.find((n) => n.id === a.id));
            return [...next, ...localOnly];
          });
        }).catch(() => {});
      } catch {}
      setInitialized(true);
    })();
  }, []);

  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions)); }, [transactions, initialized]);
  useEffect(() => {
    if (initialized) AsyncStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accounts));
    accountsRef.current = accounts;
  }, [accounts, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.bills, JSON.stringify(bills)); }, [bills, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.budgets, JSON.stringify(budgets)); }, [budgets, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.goals, JSON.stringify(goals)); }, [goals, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(projects)); }, [projects, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories)); }, [categories, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.categoryRules, JSON.stringify(categoryRules)); }, [categoryRules, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.emailSync, JSON.stringify(emailSync)); }, [emailSync, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.plaidSync, JSON.stringify(plaidSync)); }, [plaidSync, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.userName, userName); }, [userName, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.reviewedTransactionIds, JSON.stringify(reviewedTransactionIds)); }, [reviewedTransactionIds, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks)); }, [tasks, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.investmentTransactions, JSON.stringify(investmentTransactions)); }, [investmentTransactions, initialized]);
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.holdings, JSON.stringify(holdings)); }, [holdings, initialized]);

  const setUserName = useCallback((name: string) => {
    setUserNameState(name.trim());
  }, []);

  const markTransactionReviewed = useCallback((id: string) => {
    setReviewedTransactionIds((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const changeHouseholdId = useCallback(async (code: string) => {
    const normalized = code.trim().toUpperCase();
    householdIdRef.current = normalized;
    setHouseholdId(normalized);
    await AsyncStorage.setItem(STORAGE_KEYS.householdId, normalized);
    setTransactions([]);
    setAccounts([]);
    setBills([]);
    setProjects([]);
    setPlaidSync({ items: [] });
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.transactions),
      AsyncStorage.removeItem(STORAGE_KEYS.accounts),
      AsyncStorage.removeItem(STORAGE_KEYS.bills),
      AsyncStorage.removeItem(STORAGE_KEYS.projects),
      AsyncStorage.removeItem(STORAGE_KEYS.plaidSync),
    ]);

    // Fetch fresh data from server for the new household
    const hId = normalized;
    const dId = deviceIdRef.current;
    const base = getApiBase();
    const hdrs = { "X-Household-ID": hId, "X-Device-ID": dId };
    try {
      const [txRes, acctRes, plaidRes] = await Promise.all([
        fetch(`${base}/api/transactions`, { headers: hdrs }),
        fetch(`${base}/api/accounts`, { headers: hdrs }),
        fetch(`${base}/api/plaid/items`, { headers: hdrs }),
      ]);
      if (txRes.ok) {
        const txs: Transaction[] = await txRes.json();
        setTransactions(txs);
        AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(txs));
      }
      if (acctRes.ok) {
        const accts: Account[] = await acctRes.json();
        setAccounts(accts);
        AsyncStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify(accts));
      }
      if (plaidRes.ok) {
        const items: PlaidItem[] = await plaidRes.json();
        setPlaidSync({ items });
        AsyncStorage.setItem(STORAGE_KEYS.plaidSync, JSON.stringify({ items }));
      }
    } catch {}
  }, []);

  // ── CRUD: Transactions ────────────────────────────────────────────────────
  const addTransaction = useCallback((t: Omit<Transaction, "id">) => {
    const newT: Transaction = { ...t, id: genId() };
    setTransactions((prev) => upsertTransactions(prev, [newT]));
    apiCall("/api/transactions", "POST", householdIdRef.current, deviceIdRef.current, newT);
  }, []);

  const updateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    let mergedTx: Transaction | undefined;
    setTransactions((prev) => {
      const existing = prev.find((t) => t.id === id);
      // Auto-learn: if the user changed the category, record a rule
      if (existing && updates.category && updates.category !== existing.category) {
        const title = existing.merchant || existing.title || "";
        if (title) {
          const pattern = title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .replace(/\s+/g, " ")
            .trim();
          if (pattern) {
            const rules = categoryRulesRef.current;
            const exRule = rules.find((r) => r.merchantPattern === pattern);
            const now = new Date().toISOString();
            if (exRule) {
              setCategoryRules((rs) =>
                rs.map((r) =>
                  r.merchantPattern === pattern
                    ? { ...r, category: updates.category!, hitCount: r.hitCount + 1, source: "manual" as const, updatedAt: now }
                    : r
                )
              );
              bgCall("/api/category-rules", "POST", householdIdRef.current, deviceIdRef.current, {
                ...exRule, category: updates.category!, hitCount: exRule.hitCount + 1, source: "manual",
              });
            } else {
              const newRule: CategoryRule = {
                id: genId(), householdId: householdIdRef.current,
                merchantPattern: pattern, merchantExact: title,
                category: updates.category!, hitCount: 1, source: "manual", createdAt: now, updatedAt: now,
              };
              setCategoryRules((rs) => [...rs, newRule]);
              bgCall("/api/category-rules", "POST", householdIdRef.current, deviceIdRef.current, newRule);
            }
          }
        }
      }
      const next = prev.map((t) => (t.id === id ? { ...t, ...updates } : t));
      mergedTx = next.find((t) => t.id === id);
      return next;
    });
    if (mergedTx) {
      apiCall("/api/transactions/bulk", "POST", householdIdRef.current, deviceIdRef.current, { transactions: [mergedTx] });
    } else {
      apiCall(`/api/transactions/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
    }
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    apiCall(`/api/transactions/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Accounts ────────────────────────────────────────────────────────
  const addAccount = useCallback((a: Omit<Account, "id"> & { forceCreate?: boolean }): string => {
    // Dedup: if lastFour + bank already matches an existing account, return its ID
    if (!a.forceCreate && a.lastFour && a.bank) {
      const existing = findAccountMatch(accountsRef.current, a.bank, a.lastFour);
      if (existing) {
        if (existing.bank) {
          setTransactions((prev) => remapEmailTransactionsForAccount(prev, existing));
        }
        return existing.id;
      }
    }
    const isLiability = a.type === "credit";
    const newA: Account = {
      ...a,
      id: genId(),
      balance: isLiability ? -Math.abs(a.balance) : a.balance,
    };
    setAccounts((prev) => [...prev, newA]);
    apiCall("/api/accounts", "POST", householdIdRef.current, deviceIdRef.current, newA);
    // Auto-remap any email transactions whose bank matches this new account
    if (newA.bank) {
      setTransactions((prev) => remapEmailTransactionsForAccount(prev, newA));
    }
    return newA.id;
  }, []);

  const updateAccount = useCallback((id: string, updates: Partial<Account>) => {
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...updates } : a)));
    apiCall(`/api/accounts/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteAccount = useCallback((id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    apiCall(`/api/accounts/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Budgets ──────────────────────────────────────────────────────────
  const addBudget = useCallback((b: Omit<Budget, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const newB: Budget = { ...b, id: genId(), createdAt: now, updatedAt: now };
    setBudgets((prev) => [...prev, newB]);
    if (syncPrefsRef.current.budgets)
      apiCall("/api/budgets", "POST", householdIdRef.current, deviceIdRef.current, { ...newB, householdId: householdIdRef.current, deviceId: deviceIdRef.current });
  }, []);

  const updateBudget = useCallback((id: string, updates: Partial<Budget>) => {
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b)));
    if (syncPrefsRef.current.budgets)
      apiCall(`/api/budgets/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteBudget = useCallback((id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    if (syncPrefsRef.current.budgets)
      apiCall(`/api/budgets/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Goals ───────────────────────────────────────────────────────────
  const addGoal = useCallback((g: Omit<Goal, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const newG: Goal = { ...g, id: genId(), createdAt: now, updatedAt: now };
    setGoals((prev) => [...prev, newG]);
    if (syncPrefsRef.current.goals)
      apiCall("/api/goals", "POST", householdIdRef.current, deviceIdRef.current, { ...newG, householdId: householdIdRef.current, deviceId: deviceIdRef.current });
  }, []);

  const updateGoal = useCallback((id: string, updates: Partial<Goal>) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g)));
    if (syncPrefsRef.current.goals)
      apiCall(`/api/goals/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    if (syncPrefsRef.current.goals)
      apiCall(`/api/goals/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Tasks ───────────────────────────────────────────────────────────
  const addTask = useCallback((t: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const newT: Task = { ...t, id: genId(), createdAt: now, updatedAt: now };
    setTasks((prev) => [...prev, newT]);
    if (newT.reminderEnabled && newT.reminderDate)
      scheduleTaskReminder({ id: newT.id, title: newT.title, reminderDate: newT.reminderDate, notes: newT.notes });
    if (syncPrefsRef.current.tasks)
      apiCall("/api/tasks", "POST", householdIdRef.current, deviceIdRef.current, { ...newT, householdId: householdIdRef.current, deviceId: deviceIdRef.current });
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const updated: Task = { ...t, ...updates, updatedAt: new Date().toISOString() };
      if (updated.reminderEnabled && updated.reminderDate)
        scheduleTaskReminder({ id: updated.id, title: updated.title, reminderDate: updated.reminderDate, notes: updated.notes });
      else cancelTaskReminder(id);
      return updated;
    }));
    if (syncPrefsRef.current.tasks)
      apiCall(`/api/tasks/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    cancelTaskReminder(id);
    if (syncPrefsRef.current.tasks)
      apiCall(`/api/tasks/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Bills ───────────────────────────────────────────────────────────
  const addBill = useCallback((b: Omit<Bill, "id">) => {
    const now = new Date().toISOString();
    const newB: Bill = { ...b, id: genId(), createdAt: now, updatedAt: now };
    setBills((prev) => [...prev, newB]);
    apiCall("/api/bills", "POST", householdIdRef.current, deviceIdRef.current, newB);
    scheduleBillNotifications(newB);
  }, []);

  const updateBill = useCallback((id: string, updates: Partial<Bill>) => {
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b)));
    apiCall(`/api/bills/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
    const existing = billsRef.current.find((b) => b.id === id);
    if (existing) scheduleBillNotifications({ ...existing, ...updates });
  }, []);

  const deleteBill = useCallback((id: string) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
    apiCall(`/api/bills/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
    cancelBillNotifications(id);
  }, []);

  const addProject = useCallback((p: Omit<Project, "id" | "createdAt">): string => {
    const created: Project = { ...p, id: genId(), createdAt: new Date().toISOString() };
    setProjects((prev) => [...prev, created]);
    if (syncPrefsRef.current.projects)
      apiCall("/api/projects", "POST", householdIdRef.current, deviceIdRef.current, { ...created, householdId: householdIdRef.current, deviceId: deviceIdRef.current });
    return created.id;
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    if (syncPrefsRef.current.projects)
      apiCall(`/api/projects/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setTransactions((prev) => prev.map((t) => (t.projectId === id ? { ...t, projectId: undefined, projectName: undefined } : t)));
    if (syncPrefsRef.current.projects)
      apiCall(`/api/projects/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  const addCategory = useCallback((c: Omit<Category, "id" | "householdId" | "createdAt" | "updatedAt">) => {
    const created: Category = {
      ...c,
      id: genId(),
      householdId: householdIdRef.current,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setCategories((prev) => [...prev, created]);
    // Sync to backend so other devices (e.g. wife's phone) see it
    bgCall("/api/categories", "POST", householdIdRef.current, deviceIdRef.current, created);
  }, []);

  const updateCategory = useCallback((id: string, updates: Partial<Category>) => {
    setCategories((prev) => prev.map((cat) => (cat.id === id ? { ...cat, ...updates, updatedAt: new Date().toISOString() } : cat)));
    bgCall(`/api/categories/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setCategories((prev) => {
      const toDelete = new Set<string>();
      const findSubcats = (parentId: string) => {
        prev.filter((c) => c.parentId === parentId).forEach((sub) => {
          toDelete.add(sub.id);
          findSubcats(sub.id);
        });
      };
      toDelete.add(id);
      findSubcats(id);
      return prev.filter((c) => !toDelete.has(c.id));
    });
    bgCall(`/api/categories/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── Merchant pattern normalization ─────────────────────────────────────────
  function normalizeMerchant(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ── Add a user-defined category mapping rule ────────────────────────────
  const addCategoryMappingRule = useCallback((
    rule: { merchantPattern?: string; merchantExact?: string; fromCategory?: string | null; category: string; applyScope: "future" | "past_and_future" }
  ) => {
    const now = new Date().toISOString();
    const newRule: CategoryRule = {
      id: genId(),
      householdId: householdIdRef.current,
      merchantPattern: rule.merchantPattern ?? "",
      merchantExact: rule.merchantExact,
      fromCategory: rule.fromCategory ?? null,
      category: rule.category,
      hitCount: 1,
      source: "manual",
      applyScope: rule.applyScope,
      createdAt: now,
      updatedAt: now,
    };
    setCategoryRules((prev) => {
      const next = [...prev, newRule];
      AsyncStorage.setItem(STORAGE_KEYS.categoryRules, JSON.stringify(next)).catch(() => {});
      return next;
    });
    bgCall("/api/category-rules", "POST", householdIdRef.current, deviceIdRef.current, newRule);

    if (rule.applyScope === "past_and_future") {
      const pattern = rule.merchantPattern ?? "";
      setTransactions((prev) => {
        const next = prev.map((tx) => {
          if (newRule.fromCategory && tx.category !== newRule.fromCategory) return tx;
          if (pattern) {
            const needle = (tx.merchant || tx.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
            if (!needle.includes(pattern) && !pattern.includes(needle)) return tx;
          }
          return { ...tx, category: rule.category };
        });
        AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(next)).catch(() => {});
        return next;
      });
    }
  }, []);

  // ── Delete a category rule ────────────────────────────────────────────────
  const deleteCategoryRule = useCallback((id: string) => {
    setCategoryRules((prev) => {
      const next = prev.filter((r) => r.id !== id);
      AsyncStorage.setItem(STORAGE_KEYS.categoryRules, JSON.stringify(next)).catch(() => {});
      return next;
    });
    bgCall(`/api/category-rules/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── Auto-categorization ───────────────────────────────────────────────────
  const autoCategorize = useCallback((title: string): string | null => {
    const needle = normalizeMerchant(title);
    if (!needle) return null;
    const rules = categoryRulesRef.current;
    // Exact match first
    const exact = rules.find((r) => r.merchantPattern === needle);
    if (exact) return exact.category;
    // Substring match — title contains a known merchant pattern
    const partial = rules
      .filter((r) => needle.includes(r.merchantPattern) || r.merchantPattern.includes(needle))
      .sort((a, b) => b.hitCount - a.hitCount)[0];
    return partial?.category ?? null;
  }, []);

  // ── Learn a rule when user manually categorises a transaction ─────────────
  const learnCategoryRule = useCallback((merchantTitle: string, category: string) => {
    const pattern = normalizeMerchant(merchantTitle);
    if (!pattern || !category) return;

    setCategoryRules((prev) => {
      const existing = prev.find((r) => r.merchantPattern === pattern);
      if (existing) {
        // Update category and increment hit count
        const updated = prev.map((r) =>
          r.merchantPattern === pattern
            ? { ...r, category, hitCount: r.hitCount + 1, source: "manual" as const, updatedAt: new Date().toISOString() }
            : r
        );
        const rule = updated.find((r) => r.merchantPattern === pattern)!;
        bgCall("/api/category-rules", "POST", householdIdRef.current, deviceIdRef.current, {
          ...rule, category, hitCount: rule.hitCount, source: "manual",
        });
        return updated;
      } else {
        const now = new Date().toISOString();
        const newRule: CategoryRule = {
          id: genId(),
          householdId: householdIdRef.current,
          merchantPattern: pattern,
          merchantExact: merchantTitle,
          category,
          hitCount: 1,
          source: "manual",
          createdAt: now,
          updatedAt: now,
        };
        bgCall("/api/category-rules", "POST", householdIdRef.current, deviceIdRef.current, newRule);
        return [...prev, newRule];
      }
    });
  }, []);

  // ── DB sync helpers (called by data-storage screen) ──────────────────────
  const uploadToDb = useCallback(async (type: SyncableType, uploadExisting: boolean): Promise<{ uploaded: number; error?: string }> => {
    if (!uploadExisting) return { uploaded: 0 };
    const hId = householdIdRef.current;
    const dId = deviceIdRef.current;
    const recordsMap: Record<SyncableType, any[]> = {
      budgets: budgetsRef.current.map((b) => ({ ...b, householdId: hId, deviceId: dId })),
      goals: goalsRef.current.map((g) => ({ ...g, householdId: hId, deviceId: dId })),
      tasks: tasksRef.current.map((t) => ({ ...t, householdId: hId, deviceId: dId })),
      projects: projectsRef.current.map((p) => ({ ...p, householdId: hId, deviceId: dId })),
    };
    const records = recordsMap[type];
    let uploaded = 0;
    for (const record of records) {
      const res = await apiCall(`/api/${type}`, "POST", hId, dId, record);
      if (res?.ok) uploaded++;
    }
    return { uploaded };
  }, []);

  const pullFromDb = useCallback(async (type: SyncableType, since?: string): Promise<{ pulled: number; error?: string }> => {
    const hId = householdIdRef.current;
    const dId = deviceIdRef.current;
    const url = `/api/${type}${since ? `?since=${encodeURIComponent(since)}` : ""}`;
    const res = await apiCall(url, "GET", hId, dId);
    if (!res?.ok) return { pulled: 0, error: "Fetch failed" };
    const data: any[] = await res.json();
    if (!Array.isArray(data) || data.length === 0) return { pulled: 0 };
    const merge = <T extends { id: string }>(setter: React.Dispatch<React.SetStateAction<T[]>>, incoming: T[]) => {
      setter((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        incoming.forEach((r) => byId.set(r.id, { ...byId.get(r.id), ...r }));
        return Array.from(byId.values());
      });
    };
    if (type === "budgets") merge(setBudgets, data as Budget[]);
    else if (type === "goals") merge(setGoals, data as Goal[]);
    else if (type === "tasks") merge(setTasks, data as Task[]);
    else if (type === "projects") merge(setProjects, data as Project[]);
    return { pulled: data.length };
  }, []);

  const seedCategories = useCallback(async () => {
    setIsSyncing(true);
    try {
      // Try backend seed first
      const res = await fetch(`${getApiBase()}/api/categories/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Household-ID": householdIdRef.current, "X-Device-ID": deviceIdRef.current },
      });
      if (res.ok) {
        // Fetch the freshly seeded categories from backend
        const catsRes = await fetch(`${getApiBase()}/api/categories`, {
          headers: { "X-Household-ID": householdIdRef.current, "X-Device-ID": deviceIdRef.current },
        });
        const catsData = await catsRes.json();
        if (Array.isArray(catsData) && catsData.length > 0) {
          setCategories(catsData);
          return;
        }
      }
    } catch {
      // Offline — fall through to local seed
    } finally {
      setIsSyncing(false);
    }
    // Fallback: seed locally
    setCategories(buildDefaultCategories(householdIdRef.current));
  }, []);

  const markBillPaid = useCallback(
    (id: string) => {
      // Resolve virtual occurrence IDs (e.g. "bill-123_occ_1716148800000")
      let actualId = id;
      let occDueDate: string | null = null;
      if (id.includes("_occ_")) {
        const idx = id.lastIndexOf("_occ_");
        actualId = id.substring(0, idx);
        const ts = parseInt(id.substring(idx + 5));
        if (!isNaN(ts)) occDueDate = new Date(ts).toISOString();
      }

      const bill = bills.find((b) => b.id === actualId);
      if (!bill) return;

      if (bill.isRecurring && bill.frequency) {
        const baseDue = new Date(occDueDate ?? bill.dueDate);
        const d = new Date(baseDue);
        switch (bill.frequency) {
          case "daily":      d.setDate(d.getDate() + 1);         break;
          case "weekly":     d.setDate(d.getDate() + 7);         break;
          case "biweekly":   d.setDate(d.getDate() + 14);        break;
          case "monthly":    d.setMonth(d.getMonth() + 1);       break;
          case "quarterly":  d.setMonth(d.getMonth() + 3);       break;
          case "semiannual": d.setMonth(d.getMonth() + 6);       break;
          case "yearly":     d.setFullYear(d.getFullYear() + 1); break;
        }
        const paidRecord: Bill = {
          ...bill,
          id: `${actualId}_paid_${Date.now()}`,
          dueDate: baseDue.toISOString(),
          isPaid: true,
          isRecurring: false,
          frequency: undefined,
        };
        setBills((prev) => [
          ...prev.map((b) => b.id === actualId ? { ...b, dueDate: d.toISOString(), isPaid: false } : b),
          paidRecord,
        ]);
      } else {
        setBills((prev) => prev.map((b) => (b.id === actualId ? { ...b, isPaid: true } : b)));
      }

      apiCall(`/api/bills/${actualId}/pay`, "POST", householdIdRef.current, deviceIdRef.current);
      cancelBillNotifications(actualId);
      addTransaction({
        title: bill.title,
        amount: bill.amount,
        type: "expense",
        category: bill.category,
        accountId: bill.accountId || accounts[0]?.id || "acc1",
        date: new Date().toISOString(),
        note: "Bill payment",
        source: "manual",
      });
    },
    [bills, accounts, addTransaction]
  );

  // ── Email sync ────────────────────────────────────────────────────────────
  const connectEmail = useCallback(
    async (email: string, appPassword: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch(`${getApiBase()}/api/email/test`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Household-ID": householdIdRef.current,
            "X-Device-ID": deviceIdRef.current,
          },
          body: JSON.stringify({ email, appPassword }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false, error: data.error || "Connection failed" };
        setEmailSync({ email, appPassword, isConnected: true, lastSynced: undefined });
        return { success: true };
      } catch {
        return { success: false, error: "Network error. Make sure the app is connected." };
      }
    },
    []
  );

  const remapEmailTransactions = useCallback((bankPattern: string, accountId: string) => {
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.source !== "email") return t;
        const tb = (t.bank ?? "").toLowerCase();
        const tm = (t.merchant ?? t.title ?? "").toLowerCase();
        const bp = bankPattern.trim().toLowerCase();
        if (tb.includes(bp) || bp.includes(tb) || tm.includes(bp)) {
          return { ...t, accountId };
        }
        return t;
      })
    );
  }, []);

  const disconnectEmail = useCallback(() => {
    setEmailSync({ email: "", appPassword: "", isConnected: false });
  }, []);

  const resetEmailTransactions = useCallback(() => {
    setTransactions((prev) => prev.filter((t) => t.source !== "email"));
  }, []);

  const wipeAllTransactions = useCallback(async () => {
    setIsSyncing(true);
    try {
      // 1. Wipe backend (transactions + accounts) — both must succeed before wiping local
      const [txRes, acctRes] = await Promise.all([
        apiCall("/api/transactions", "DELETE", householdIdRef.current, deviceIdRef.current),
        apiCall("/api/accounts", "DELETE", householdIdRef.current, deviceIdRef.current),
      ]);

      if (!txRes || !acctRes) {
        throw new Error("Network error: Could not connect to server");
      }
      if (!txRes.ok) {
        const e = await txRes.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(e.error || `Server error: ${txRes.status}`);
      }

      // 2. Only wipe local if backend succeeded
      setTransactions([]);
      setAccounts([]);
      setHoldings([]);
      setInvestmentTransactions([]);
      setPlaidSync({ items: [] });
      await AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify([]));
      await AsyncStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify([]));
      await AsyncStorage.setItem(STORAGE_KEYS.holdings, JSON.stringify([]));
      await AsyncStorage.setItem(STORAGE_KEYS.investmentTransactions, JSON.stringify([]));
      await AsyncStorage.setItem(STORAGE_KEYS.plaidSync, JSON.stringify({ items: [] }));
      console.log("All data wiped successfully");
    } catch (err) {
      console.error("Transaction wipe failed:", err);
      throw err; // Re-throw so UI can show error to user
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const wipePortfolio = useCallback(async () => {
    setHoldings([]);
    setInvestmentTransactions([]);
    await AsyncStorage.setItem(STORAGE_KEYS.holdings, JSON.stringify([]));
    await AsyncStorage.setItem(STORAGE_KEYS.investmentTransactions, JSON.stringify([]));
  }, []);

  const wipeData = useCallback(async (
    categories: Array<"expenses" | "income" | "transfers" | "transactions" | "accounts" | "bills" | "budgets" | "goals" | "portfolio" | "connections">,
    filters?: { startDate?: string; endDate?: string; accountIds?: string[] }
  ) => {
    const set = new Set(categories);
    const hasTransactions = set.has("transactions") || set.has("expenses") || set.has("income") || set.has("transfers");

    if (hasTransactions) {
      setTransactions((prev) => {
        const next = prev.filter((t) => {
          // If transaction matches filters and matches selected category/type, delete it (filter it out)
          const txStartStr = String(filters?.startDate ?? "");
          const txEndStr = filters?.endDate ? (String(filters.endDate).includes("T") ? String(filters.endDate) : `${filters.endDate}T23:59:59.999Z`) : "";

          const matchesDate = (!filters?.startDate || t.date >= txStartStr) &&
                              (!filters?.endDate || t.date <= txEndStr);
          const matchesAccount = !filters?.accountIds || filters.accountIds.includes(t.accountId);

          if (matchesDate && matchesAccount) {
            if (set.has("transactions")) return false;
            if (set.has("expenses") && t.type === "expense") return false;
            if (set.has("income") && t.type === "income") return false;
            if (set.has("transfers") && t.category === "Transfer") return false;
          }
          return true;
        });
        AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(next));
        return next;
      });
    }
    if (set.has("accounts")) {
      setAccounts([]);
      await AsyncStorage.setItem(STORAGE_KEYS.accounts, JSON.stringify([]));
    }
    if (set.has("bills")) {
      setBills((prev) => {
        // Bills don't have transaction type, but if date range filters are set, we filter them out
        // Just empty completely if no date range is set, or filter by date if they have a date/due date
        const next = prev.filter((b) => {
          // If bill matches filters, delete it
          const matchesAccount = !filters?.accountIds || (b.accountId && filters.accountIds.includes(b.accountId));
          // Note: bills don't have standard "date" field, so we just filter by account if specified, otherwise wipe
          if (matchesAccount) return false;
          return true;
        });
        AsyncStorage.setItem(STORAGE_KEYS.bills, JSON.stringify(next));
        return next;
      });
    }
    if (set.has("budgets")) {
      setBudgets([]);
      await AsyncStorage.setItem(STORAGE_KEYS.budgets, JSON.stringify([]));
    }
    if (set.has("goals")) {
      setGoals([]);
      await AsyncStorage.setItem(STORAGE_KEYS.goals, JSON.stringify([]));
    }
    if (set.has("portfolio")) {
      setHoldings([]);
      setInvestmentTransactions([]);
      await AsyncStorage.setItem(STORAGE_KEYS.holdings, JSON.stringify([]));
      await AsyncStorage.setItem(STORAGE_KEYS.investmentTransactions, JSON.stringify([]));
    }
    if (set.has("connections")) {
      setPlaidSync({ items: [] });
      await AsyncStorage.setItem(STORAGE_KEYS.plaidSync, JSON.stringify({ items: [] }));
    }
  }, []);

  const syncEmailTransactions = useCallback(async (): Promise<{ imported: number; parsed?: any[]; error?: string }> => {
    if (!emailSync.isConnected || !emailSync.email || !emailSync.appPassword) {
      return { imported: 0, error: "Email not connected" };
    }
    setIsSyncing(true);
    try {
      const res = await fetch(`${getApiBase()}/api/email/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Household-ID": householdIdRef.current,
          "X-Device-ID": deviceIdRef.current,
        },
        body: JSON.stringify({ email: emailSync.email, appPassword: emailSync.appPassword, daysBack: 90 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIsSyncing(false);
        return { imported: 0, error: data.error || "Sync failed" };
      }

      // ── Auto-create accounts for newly-seen banks (BEFORE resolving accountIds) ──
      let currentAccts = accountsRef.current;
      if (Array.isArray(data.parsed) && data.parsed.length > 0) {
        const toCreate: Account[] = [];
        const seenKeys = new Set<string>();
        for (const p of data.parsed as Array<{ bank?: string; lastFour?: string; type?: string }>) {
          const bank = (p.bank ?? "").trim();
          if (!bank) continue;
          const key = `${bank.toLowerCase()}|${p.lastFour ?? ""}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          const exists = currentAccts.find(
            (a) =>
              a.bank?.toLowerCase() === bank.toLowerCase() &&
              (!p.lastFour || a.lastFour === p.lastFour)
          );
          if (exists) continue;
          const bankMeta = PLAID_BANKS.find(
            (b) =>
              b.name.toLowerCase().includes(bank.toLowerCase()) ||
              bank.toLowerCase().includes(b.name.split(" ")[0].toLowerCase())
          );
          const inferredType: Account["type"] =
            bank.toLowerCase().includes("credit") || bank.toLowerCase().includes("visa") ||
            bank.toLowerCase().includes("mastercard") || bank.toLowerCase().includes("amex")
              ? "credit" : "checking";
          const newAcct: Account = {
            id: genId(),
            name: p.lastFour ? `${bank} \u2022\u2022\u2022\u2022${p.lastFour}` : bank,
            bank,
            balance: 0,
            type: inferredType,
            color: bankMeta?.color ?? "#6366f1",
            lastFour: p.lastFour,
          };
          toCreate.push(newAcct);
        }
        if (toCreate.length > 0) {
          currentAccts = [...currentAccts, ...toCreate];
          setAccounts(currentAccts);
          toCreate.forEach((a) =>
            apiCall("/api/accounts", "POST", householdIdRef.current, deviceIdRef.current, a)
          );
        }
      }

      // ── Resolve accountIds and categories at import time ───────────────────────
      const rules = categoryRulesRef.current;
      const importedTransactions: Transaction[] = Array.isArray(data.transactions)
        ? data.transactions.map((t: any) =>
            normalizeImportedTx(
              { ...t, id: t.id || genId(), fromEmail: true },
              "email",
              currentAccts,
              rules
            )
          )
        : [];

      // Count truly new entries (didn't already exist in the store in any form)
      let actuallyNew = 0;
      if (importedTransactions.length > 0) {
        const prevKeys = new Set(transactionsRef.current.map(dedupKey));
        actuallyNew = importedTransactions.filter((t) => !prevKeys.has(dedupKey(t))).length;
        setTransactions((prev) => upsertTransactions(prev, importedTransactions));
        // Push to server outside the state updater to avoid side effects
        bgCall(
          "/api/transactions/bulk",
          "POST",
          householdIdRef.current,
          deviceIdRef.current,
          { transactions: importedTransactions }
        );
      }

      setEmailSync((prev) => ({
        ...prev,
        lastSynced: new Date().toISOString(),
        lastEmailsScanned: data.emailsScanned,
        lastImported: actuallyNew,
        lastParsed: Array.isArray(data.parsed) ? data.parsed : [],
      }));
      setIsSyncing(false);
      return { imported: actuallyNew, parsed: Array.isArray(data.parsed) ? data.parsed : [] };
    } catch {
      setIsSyncing(false);
      return { imported: 0, error: "Network error during sync" };
    }
  }, [emailSync]);

  // ── Plaid sync ────────────────────────────────────────────────────────────

  const connectPlaid = useCallback(
    async (
      item: PlaidItem,
      newAccounts: Omit<Account, "id">[],
      initialTransactions: Omit<Transaction, "id">[],
      rawHoldingsData?: any[],
      rawInvTxsData?: any[]
    ): Promise<{ imported: number }> => {
      const current = accountsRef.current;

      // Dedup: for each incoming Plaid account, check if it already exists locally
      // by plaidAccountId first, then by lastFour + bank name match
      const plaidAccMap: Record<string, string> = {};
      const toCreate: Account[] = [];
      const toMerge: { id: string; updates: Partial<Account> }[] = [];

      for (const a of newAccounts) {
        // 1. Exact plaidAccountId match — already synced
        if (a.plaidAccountId) {
          const byPlaidId = current.find((e) => e.plaidAccountId === a.plaidAccountId);
          if (byPlaidId) {
            plaidAccMap[a.plaidAccountId] = byPlaidId.id;
            continue;
          }
        }
        // 2. lastFour + bank name match — manual account that should be linked
        if (a.lastFour && a.bank) {
          const existing = findAccountMatch(current, a.bank, a.lastFour);
          if (existing && !existing.plaidAccountId) {
            plaidAccMap[a.plaidAccountId ?? ""] = existing.id;
            toMerge.push({
              id: existing.id,
              updates: { plaidAccountId: a.plaidAccountId, plaidItemId: item.itemId },
            });
            continue;
          }
        }
        // 3. New account — create it (stamp plaidItemId, bank, color so DB insert passes validation)
        const created: Account = {
          ...a,
          id: genId(),
          plaidItemId: item.itemId,
          bank: a.bank || item.bankName,
          color: a.color || item.bankColor || "#6366f1",
        };
        toCreate.push(created);
        if (a.plaidAccountId) plaidAccMap[a.plaidAccountId] = created.id;
      }

      if (toCreate.length > 0) {
        setAccounts((prev) => [...prev, ...toCreate]);
        bgCall("/api/accounts/bulk-upsert", "POST", householdIdRef.current, deviceIdRef.current, { accounts: toCreate });
      }
      if (toMerge.length > 0) {
        setAccounts((prev) =>
          prev.map((a) => {
            const upd = toMerge.find((u) => u.id === a.id);
            return upd ? { ...a, ...upd.updates } : a;
          })
        );
        toMerge.forEach(({ id, updates }) =>
          apiCall(`/api/accounts/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates)
        );
      }

      // Remap any existing transactions whose accountId is a raw Plaid account ID
      // (e.g., from the migration script) to the local account ID
      if (Object.keys(plaidAccMap).length > 0) {
        setTransactions((prev) =>
          prev.map((t) => {
            const localId = plaidAccMap[t.accountId];
            return localId ? { ...t, accountId: localId } : t;
          })
        );
      }

      let imported = 0;
      // Fallback: first account in THIS item's plaidAccMap, never a random unrelated account
      const fallbackId = Object.values(plaidAccMap)[0] ?? "";
      const rules = categoryRulesRef.current;
      const txsToAdd: Transaction[] = initialTransactions.map((t) =>
        normalizeImportedTx(
          { ...t, id: genId() },
          "plaid",
          current,
          rules,
          { plaidAccMap, plaidItemId: item.itemId, fallbackAccountId: fallbackId }
        )
      );

      setTransactions((prev) => {
        const existingKeys = new Set(prev.map(dedupKey));
        const fresh = txsToAdd.filter((t) => !existingKeys.has(dedupKey(t)));
        imported = fresh.length;
        return upsertTransactions(prev, fresh);
      });

      // Register item with accountIds and the Plaid→local account ID map.
      // Use ALL values from plaidAccMap (includes accounts already existing via plaidAccountId match).
      const registeredItem: PlaidItem = {
        ...item,
        accountIds: Array.from(new Set(Object.values(plaidAccMap))),
        plaidAccountMap: plaidAccMap,
        lastSynced: new Date().toISOString(),
        lastImported: imported,
      };
      // Process investment data returned from exchange-token
      const rawHoldings: any[] = rawHoldingsData ?? [];
      const rawInvTxs: any[] = rawInvTxsData ?? [];
      if (rawHoldings.length > 0 || rawInvTxs.length > 0) {
        const now = new Date().toISOString();
        setHoldings((prev) => {
          const withoutItem = prev.filter((h) => h.plaidItemId !== item.itemId);
          const newHoldings: Holding[] = rawHoldings.map((h: any) => ({
            id: genId(),
            plaidItemId: item.itemId,
            plaidAccountId: h.plaidAccountId,
            accountId: plaidAccMap[h.plaidAccountId] ?? "",
            ticker: h.ticker ?? null,
            name: h.name,
            securityType: h.securityType,
            quantity: h.quantity,
            value: h.value,
            costBasis: h.costBasis ?? null,
            currency: h.currency,
            asOf: h.asOf ?? null,
            updatedAt: now,
          }));
          return [...withoutItem, ...newHoldings];
        });
        setInvestmentTransactions((prev) => {
          const existingIds = new Set(prev.map((t) => t.plaidTxId));
          const fresh: InvestmentTransaction[] = rawInvTxs
            .filter((t: any) => !existingIds.has(t.plaidTxId))
            .map((t: any) => ({
              id: genId(),
              plaidTxId: t.plaidTxId,
              plaidItemId: item.itemId,
              plaidAccountId: t.plaidAccountId,
              accountId: plaidAccMap[t.plaidAccountId] ?? "",
              date: t.date,
              name: t.name,
              ticker: t.ticker ?? null,
              type: t.type,
              subtype: t.subtype ?? null,
              quantity: t.quantity ?? null,
              amount: t.amount,
              fees: t.fees ?? null,
              currency: t.currency,
            }));
          return [...prev, ...fresh];
        });
      }

      setPlaidSync((prev) => ({ items: [...prev.items, registeredItem] }));

      return { imported };
    },
    []
  );

  const syncPlaidTransactions = useCallback(
    async (itemId: string, forceFullSync = false): Promise<{ imported: number; error?: string }> => {
      const item = plaidSync.items.find((i) => i.itemId === itemId);
      if (!item) return { imported: 0, error: "Bank not found" };

      setIsSyncing(true);

      try {
        // Build the account map first (before API call) so we can detect mismatches.
        const _plaidAccounts = accounts.filter(
          (a) => item.accountIds.includes(a.id) || a.plaidItemId === item.itemId
        );
        const _preMap: Record<string, string> = { ...(item.plaidAccountMap ?? {}) };
        _plaidAccounts.forEach((a) => {
          if (a.plaidAccountId && !_preMap[a.plaidAccountId]) _preMap[a.plaidAccountId] = a.id;
        });
        const _validIds = new Set(Object.values(_preMap));

        // SCOPE mismatch check to THIS item's transactions only.
        // Transactions with plaidItemId are remapped O(1). Legacy transactions without
        // plaidItemId still need the content-based path.
        const hasMismatched = transactions.some((t) => {
          if (t.source !== "plaid") return false;
          // If this transaction belongs to this Plaid item and has a plaidAccountId,
          // check if it's mapped to the right local account.
          if (t.plaidItemId === itemId && t.plaidAccountId) {
            const expected = _preMap[t.plaidAccountId];
            return expected && expected !== t.accountId;
          }
          // Legacy: transactions without plaidItemId
          if (t.plaidItemId === itemId && !_validIds.has(t.accountId)) return true;
          if (!t.plaidItemId && !_validIds.has(t.accountId)) return true;
          return false;
        });

        // Auto-force when item has never successfully imported any transactions
        const neverImported = !item.lastImported || item.lastImported === 0;
        const res = await apiCall(
          `/api/plaid/sync/${itemId}`,
          "POST",
          householdIdRef.current,
          deviceIdRef.current,
          (hasMismatched || forceFullSync || neverImported) ? { force: true } : undefined
        );

        if (!res) {
          setIsSyncing(false);
          return { imported: 0, error: "Network error. Could not reach server." };
        }

        const data = await res.json();

        if (!res.ok) {
          setIsSyncing(false);
          return { imported: 0, error: data.error ?? "Sync failed" };
        }

        // Build map of plaidAccountId → local account id.
        // Start from item.plaidAccountMap (persisted), then enrich from local accounts.
        const plaidAccMap: Record<string, string> = { ...(item.plaidAccountMap ?? {}) };

        // Enrich from accounts that already have plaidAccountId or plaidItemId set
        const knownPlaidAccounts = accounts.filter(
          (a) => item.accountIds.includes(a.id) || a.plaidItemId === item.itemId
        );
        knownPlaidAccounts.forEach((a) => {
          if (a.plaidAccountId && !plaidAccMap[a.plaidAccountId]) {
            plaidAccMap[a.plaidAccountId] = a.id;
          }
        });

        // ── Self-heal: use plaidAccounts returned from server to rebuild missing mapping ──
        // This recovers accountIds that were lost (e.g. after changeHouseholdId refetch
        // returned empty accountIds because plaid_item_id was null in the DB).
        if (Array.isArray(data.plaidAccounts) && data.plaidAccounts.length > 0) {
          for (const pa of data.plaidAccounts as Array<{ plaidAccountId: string; lastFour: string; name: string; balance?: number }>) {
            if (plaidAccMap[pa.plaidAccountId]) continue; // already mapped
            // Match by plaidAccountId first
            const byPlaidId = accounts.find((a) => a.plaidAccountId === pa.plaidAccountId);
            if (byPlaidId) { plaidAccMap[pa.plaidAccountId] = byPlaidId.id; continue; }
            // Match by lastFour + bank (item.bankName)
            const byLastFour = findAccountMatch(accounts, item.bankName, pa.lastFour);
            if (byLastFour) { plaidAccMap[pa.plaidAccountId] = byLastFour.id; }
          }
        }

        // ── Update stored balances from Plaid's authoritative figures ──────────
        // The sync response returns fresh balances. Apply them so computeBalance
        // always starts from the correct Plaid snapshot rather than a stale value.
        if (Array.isArray(data.plaidAccounts) && data.plaidAccounts.length > 0) {
          const balanceUpdates: { id: string; balance: number }[] = [];
          for (const pa of data.plaidAccounts as Array<{ plaidAccountId: string; balance?: number }>) {
            const localId = plaidAccMap[pa.plaidAccountId];
            if (localId && typeof pa.balance === "number") {
              balanceUpdates.push({ id: localId, balance: pa.balance });
            }
          }
          if (balanceUpdates.length > 0) {
            setAccounts((prev) =>
              prev.map((a) => {
                const upd = balanceUpdates.find((u) => u.id === a.id);
                return upd ? { ...a, balance: upd.balance } : a;
              })
            );
            // Send all balance updates + full account data in one bulk request
            const bulkPayload = balanceUpdates.map(({ id, balance }) => {
              const fullAccount = accountsRef.current.find((a) => a.id === id);
              return fullAccount ? { ...fullAccount, balance } : { id, balance };
            });
            bgCall("/api/accounts/bulk-upsert", "POST", householdIdRef.current, deviceIdRef.current, { accounts: bulkPayload });
          }
        }

        // If accountIds is empty but we just rebuilt plaidAccMap, update the item
        const rebuiltAccountIds = Array.from(new Set(Object.values(plaidAccMap)));
        if (item.accountIds.length === 0 && rebuiltAccountIds.length > 0) {
          setPlaidSync((prev) => ({
            items: prev.items.map((i) =>
              i.itemId === itemId
                ? { ...i, accountIds: rebuiltAccountIds, plaidAccountMap: plaidAccMap }
                : i
            ),
          }));
        }

        const plaidAccounts = accounts.filter((a) => rebuiltAccountIds.includes(a.id));

        // Legacy: content key → correct localAccountId map from server transactions.
        // Only used for old transactions that lack plaidItemId/plaidAccountId.
        const correctIdByContent = new Map<string, string>();
        if (Array.isArray(data.transactions)) {
          for (const t of data.transactions as any[]) {
            const localId = plaidAccMap[t.accountId];
            if (localId) {
              const key = `${(t.amount as number).toFixed(2)}|${(t.date as string).slice(0, 10)}|${(t.title as string).toLowerCase().trim()}`;
              correctIdByContent.set(key, localId);
            }
          }
        }

        const rules = categoryRulesRef.current;
        let imported = 0;

        setTransactions((prev) => {
          const validLocalIds = new Set(Object.values(plaidAccMap));
          const fixed: Transaction[] = [];

          // 1. Remap existing transactions ───────────────────────────────────────
          const remapped = prev.map((t) => {
            if (t.source !== "plaid") return t;

            // Modern: O(1) remap by plaidAccountId (always correct)
            if (t.plaidItemId === itemId && t.plaidAccountId) {
              const expected = plaidAccMap[t.plaidAccountId];
              if (expected && expected !== t.accountId) {
                const r = { ...t, accountId: expected };
                fixed.push(r);
                return r;
              }
              return t;
            }

            // Legacy migration: raw Plaid account ID stored as accountId
            const byPlaidId = plaidAccMap[t.accountId];
            if (byPlaidId) {
              const r = { ...t, accountId: byPlaidId, plaidItemId: itemId };
              fixed.push(r);
              return r;
            }

            // Legacy migration: wrong local account ID, content-match
            if (!validLocalIds.has(t.accountId)) {
              const key = `${t.amount.toFixed(2)}|${t.date.slice(0, 10)}|${t.title.toLowerCase().trim()}`;
              const correctId = correctIdByContent.get(key);
              if (correctId) {
                const r = { ...t, accountId: correctId, plaidItemId: itemId };
                fixed.push(r);
                return r;
              }
            }
            return t;
          });

          // Push any fixed transactions to the server so DB is also corrected
          if (fixed.length > 0) {
            bgCall("/api/transactions/bulk", "POST", householdIdRef.current, deviceIdRef.current, { transactions: fixed });
          }

          // 2. Import new transactions ───────────────────────────────────────────
          let fresh: Transaction[] = [];
          if (Array.isArray(data.transactions) && data.transactions.length > 0) {
            const fallbackId = Object.values(plaidAccMap)[0] ?? "";
            const candidates = (data.transactions as any[]).map((t) =>
              normalizeImportedTx(
                { ...t, id: genId() },
                "plaid",
                plaidAccounts,
                rules,
                { plaidAccMap, plaidItemId: itemId, fallbackAccountId: fallbackId }
              )
            );
            const existingKeys = new Set(remapped.map(dedupKey));
            fresh = candidates.filter((t) => !existingKeys.has(dedupKey(t)));
            imported = fresh.length;
            if (fresh.length > 0) {
              bgCall(
                "/api/transactions/bulk",
                "POST",
                householdIdRef.current,
                deviceIdRef.current,
                { transactions: fresh }
              );
            }
          }

          return upsertTransactions(remapped, fresh);
        });

        // Process investment data from sync
        const rawHoldings: any[] = data.holdings ?? [];
        const rawInvTxs: any[] = data.investmentTransactions ?? [];
        if (rawHoldings.length > 0 || rawInvTxs.length > 0) {
          const now2 = new Date().toISOString();
          setHoldings((prev) => {
            const withoutItem = prev.filter((h) => h.plaidItemId !== itemId);
            const newHoldings: Holding[] = rawHoldings.map((h: any) => ({
              id: genId(),
              plaidItemId: itemId,
              plaidAccountId: h.plaidAccountId,
              accountId: plaidAccMap[h.plaidAccountId] ?? "",
              ticker: h.ticker ?? null,
              name: h.name,
              securityType: h.securityType,
              quantity: h.quantity,
              value: h.value,
              costBasis: h.costBasis ?? null,
              currency: h.currency,
              asOf: h.asOf ?? null,
              updatedAt: now2,
            }));
            return [...withoutItem, ...newHoldings];
          });
          setInvestmentTransactions((prev) => {
            const existingIds = new Set(prev.map((t) => t.plaidTxId));
            const fresh: InvestmentTransaction[] = rawInvTxs
              .filter((t: any) => !existingIds.has(t.plaidTxId))
              .map((t: any) => ({
                id: genId(),
                plaidTxId: t.plaidTxId,
                plaidItemId: itemId,
                plaidAccountId: t.plaidAccountId,
                accountId: plaidAccMap[t.plaidAccountId] ?? "",
                date: t.date,
                name: t.name,
                ticker: t.ticker ?? null,
                type: t.type,
                subtype: t.subtype ?? null,
                quantity: t.quantity ?? null,
                amount: t.amount,
                fees: t.fees ?? null,
                currency: t.currency,
              }));
            return [...prev, ...fresh];
          });
        }

        setPlaidSync((prev) => ({
          items: prev.items.map((i) =>
            i.itemId === itemId
              ? { ...i, lastSynced: new Date().toISOString(), lastImported: imported }
              : i
          ),
        }));
        setIsSyncing(false);
        return { imported };
      } catch {
        setIsSyncing(false);
        return { imported: 0, error: "Sync failed unexpectedly" };
      }
    },
    [plaidSync, accounts]
  );

  const delinkPlaid = useCallback((itemId: string) => {
    // Remove Plaid token only — keeps accounts and transactions intact, but clears investment data
    setHoldings((prev) => prev.filter((h) => h.plaidItemId !== itemId));
    setInvestmentTransactions((prev) => prev.filter((t) => t.plaidItemId !== itemId));
    setPlaidSync((prev) => ({ items: prev.items.filter((i) => i.itemId !== itemId) }));
    apiCall(
      `/api/plaid/disconnect/${itemId}`,
      "DELETE",
      householdIdRef.current,
      deviceIdRef.current
    );
  }, []);

  const disconnectPlaid = useCallback((itemId: string) => {
    const item = plaidSync.items.find((i) => i.itemId === itemId);
    // Remove accounts by BOTH accountIds list AND plaidItemId (handles stale/incomplete accountIds)
    setAccounts((prev) =>
      prev.filter((a) => !(item?.accountIds.includes(a.id) || a.plaidItemId === itemId))
    );
    setTransactions((prev) =>
      prev.filter((t) =>
        !(item?.accountIds.includes(t.accountId) && t.source === "plaid") && t.plaidItemId !== itemId
      )
    );
    setHoldings((prev) => prev.filter((h) => h.plaidItemId !== itemId));
    setInvestmentTransactions((prev) => prev.filter((t) => t.plaidItemId !== itemId));
    setPlaidSync((prev) => ({ items: prev.items.filter((i) => i.itemId !== itemId) }));
    // Best-effort: remove access token from server
    apiCall(
      `/api/plaid/disconnect/${itemId}`,
      "DELETE",
      householdIdRef.current,
      deviceIdRef.current
    );
  }, [plaidSync]);

  // ── Computed values ───────────────────────────────────────────────────────
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonthTx = transactions.filter((t) => t.date >= monthStart);
  const monthlyIncome = thisMonthTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthlyExpense = thisMonthTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const LIABILITY_TYPES = ["credit", "mortgage", "loan"];
  const totalBalance = accounts
    .filter(isIncludedInNetworth)
    .reduce((s, a) => {
      const bal = computeBalance(a, transactions);
      return LIABILITY_TYPES.includes(a.type ?? "")
        ? s - Math.abs(bal)
        : s + bal;
    }, 0);

  return (
    <AppContext.Provider
      value={{
        transactions, accounts, bills, budgets, goals, projects, categories, categoryRules, emailSync, plaidSync,
        investmentTransactions, holdings,
        userName, setUserName,
        reviewedTransactionIds, markTransactionReviewed,
        addTransaction, updateTransaction, deleteTransaction,
        addAccount, remapEmailTransactions, updateAccount, deleteAccount,
        addBill, updateBill, deleteBill, markBillPaid,
        addBudget, updateBudget, deleteBudget,
        addGoal, updateGoal, deleteGoal,
        tasks, addTask, updateTask, deleteTask,
        addProject, updateProject, deleteProject,
        addCategory, updateCategory, deleteCategory, seedCategories,
        learnCategoryRule, autoCategorize, addCategoryMappingRule, deleteCategoryRule,
        connectEmail, disconnectEmail, resetEmailTransactions, syncEmailTransactions, wipeAllTransactions, wipePortfolio, wipeData,
        connectPlaid, syncPlaidTransactions, delinkPlaid, disconnectPlaid,
        // investmentTransactions + holdings already exposed above
        isSyncing, totalBalance, monthlyIncome, monthlyExpense,
        deviceId, householdId, changeHouseholdId,
        uploadToDb, pullFromDb,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// ── Bank catalog (used by PlaidLinkModal) ─────────────────────────────────────

export const PLAID_BANKS = [
  { id: "rbc", name: "RBC Royal Bank", color: "#003168", icon: "🦁", accountTypes: ["checking", "savings", "credit", "investment"] },
  { id: "td", name: "TD Canada Trust", color: "#34A853", icon: "🍀", accountTypes: ["checking", "savings", "credit", "investment"] },
  { id: "scotiabank", name: "Scotiabank", color: "#EC111A", icon: "🏦", accountTypes: ["checking", "savings", "credit"] },
  { id: "bmo", name: "BMO Bank of Montreal", color: "#0079C1", icon: "💙", accountTypes: ["checking", "savings", "credit", "investment"] },
  { id: "cibc", name: "CIBC", color: "#C41F3E", icon: "🏛", accountTypes: ["checking", "savings", "credit"] },
  { id: "national", name: "National Bank", color: "#EA1D2C", icon: "🇨🇦", accountTypes: ["checking", "savings", "credit"] },
  { id: "tangerine", name: "Tangerine", color: "#FF6A00", icon: "🍊", accountTypes: ["checking", "savings"] },
  { id: "simplii", name: "Simplii Financial", color: "#E4002B", icon: "🔴", accountTypes: ["checking", "savings"] },
  { id: "eqbank", name: "EQ Bank", color: "#00B388", icon: "💚", accountTypes: ["savings"] },
  { id: "atb", name: "ATB Financial", color: "#004B87", icon: "🏔", accountTypes: ["checking", "savings", "credit"] },
  { id: "desjardins", name: "Desjardins", color: "#009A44", icon: "🌿", accountTypes: ["checking", "savings", "credit"] },
  { id: "questrade", name: "Questrade", color: "#E8181C", icon: "📈", accountTypes: ["investment"] },
  { id: "wealthsimple", name: "Wealthsimple", color: "#000000", icon: "🌱", accountTypes: ["checking", "savings", "investment"] },
];

