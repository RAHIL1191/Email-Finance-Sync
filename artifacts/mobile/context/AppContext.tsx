import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import {
  cancelBillNotifications,
  scheduleBillNotifications,
  setupNotificationsOnInit,
  setupTaskNotificationsOnInit,
  fireImmediateNotification,
  registerPushTokenWithServer,
  scheduleTaskReminder,
  cancelTaskReminder,
  scheduleTaskDueNotification,
  cancelTaskDueNotification,
  checkBudgetAndNotify,
} from "@/services/notificationService";
import { parseLocalDate, toLocalYMD } from "@/hooks/useLocalDate";
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
  createdAt?: string;
  updatedAt?: string;
  plaidTransactionId?: string;
  pending?: boolean;
  pendingTransactionId?: string | null;
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
  alertPct?: number;
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

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  note?: string;
}

export interface Task {
  id: string;
  title: string;
  category: string;
  email?: string;
  paymentMode?: string;
  dueDate: string;
  notes?: string;
  checklistItems?: ChecklistItem[];
  priority: "low" | "medium" | "high";
  isCompleted: boolean;
  reminderEnabled: boolean;
  reminderDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistGroupItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface InnerChecklist {
  id: string;
  type: "checklist";
  title: string;
  completed: boolean;
  collapsed: boolean;
  items: ChecklistGroupItem[];
}

export interface InnerNote {
  id: string;
  type: "note";
  text: string;
  collapsed?: boolean;
}

export type InnerItem = InnerNote | InnerChecklist;

export interface ChecklistGroup {
  id: string;
  title: string;
  collapsed: boolean;
  place?: string;
  items: InnerItem[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  color: string;
  createdAt: string;
  checklistGroups?: ChecklistGroup[];
  place?: string;
  note?: string;
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
  syncTransactions?: boolean;
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
  /** Last sync error message, if any */
  syncError?: string;
  /** True when Plaid requires the user to re-authenticate (ITEM_LOGIN_REQUIRED) */
  needsRelogin?: boolean;
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
  merchantExact?: string | null;
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
  rrspLimit: number;
  setRrspLimit: (val: number) => void;
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
  addCategoryMappingRule: (rule: { id?: string; merchantPattern?: string; merchantExact?: string; fromCategory?: string | null; category: string; applyScope: "future" | "past_and_future"; source?: "manual" | "learned" }) => void;
  deleteCategoryRule: (id: string) => void;
  connectEmail: (email: string, appPassword: string) => Promise<{ success: boolean; error?: string }>;
  updateEmailSyncSettings: (settings: Partial<EmailSync>) => void;
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
  rrspLimit: "@fintrack/rrspLimit",
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
 * Dedup key: accountId + amount (cents) + date (day-precision).
 * Intentionally excludes title/bank — Gmail parses "Transaction at X" while Plaid
 * returns "X"; the three stable fields catch cross-source duplicates cleanly.
 *
 * Amount is normalised to integer cents via Math.round(amount * 100) so that
 * float4 (PostgreSQL `real`) round-trip precision drift (e.g. 49.99 → 49.9900016784668)
 * never causes a false-negative during dedup.
 */
function dedupKey(t: { amount: number; date: string; accountId?: string }): string {
  return `${(t.accountId ?? "").toLowerCase()}|${Math.round((t.amount ?? 0) * 100)}|${t.date.slice(0, 10)}`;
}

/**
 * Merge incoming transactions into prev, deduplicating by both dedupKey (content)
 * and id. This prevents the same logical transaction from appearing twice when its
 * accountId changes (e.g., Plaid raw account ID → local UUID after remapping).
 * Higher-priority sources (plaid > manual > email) win on collision.
 */
function upsertTransactions(prev: Transaction[], incoming: Transaction[]): Transaction[] {
  // To avoid mutating input parameters, perform deep clone of both arrays
  const allTxs = [
    ...prev.map((t) => ({ ...t })),
    ...incoming.map((t) => ({ ...t })),
  ];

  // Helper score to prioritize source and status: Plaid > Manual > Email, Posted > Pending
  const getPriorityScore = (t: Transaction) => {
    const srcScore = SOURCE_PRIORITY[t.source ?? ""] ?? 0;
    const pendingScore = t.pending ? 0 : 1;
    return srcScore * 10 + pendingScore;
  };

  // Sort: higher priority score transactions first
  allTxs.sort((a, b) => getPriorityScore(b) - getPriorityScore(a));

  // Pass A: Strict exact ID, plaidTransactionId, and content deduplication based on priority score.
  // This collapses exact duplicates from overlapping sync sources.
  const uniqueTxs: Transaction[] = [];
  const byId = new Map<string, Transaction>();
  const byContent = new Map<string, Transaction>();
  const byPlaidTxId = new Map<string, Transaction>();

  for (const t of allTxs) {
    const key = dedupKey(t);
    const existingById = t.id ? byId.get(t.id) : null;
    const existingByContent = byContent.get(key);
    const existingByPlaidTxId = t.plaidTransactionId ? byPlaidTxId.get(t.plaidTransactionId) : null;

    if (existingById || existingByContent || existingByPlaidTxId) {
      // Re-attribution or duplicate: skip since we already have a higher/equal priority version
      continue;
    }

    uniqueTxs.push(t);
    if (t.id) byId.set(t.id, t);
    byContent.set(key, t);
    if (t.plaidTransactionId) byPlaidTxId.set(t.plaidTransactionId, t);
  }

  // Pass B: Fuzzy Pending-Posted Collapsing across the combined list.
  // 1. Gather all pending transaction dates by ID and Plaid ID so we can preserve them.
  const pendingDatesMap = new Map<string, string>();
  uniqueTxs.forEach((t) => {
    if (t.pending && t.date) {
      if (t.id) pendingDatesMap.set(t.id, t.date);
      if (t.plaidTransactionId) pendingDatesMap.set(t.plaidTransactionId, t.date);
    }
  });

  // 2. Direct ID-based pending eviction: remove matching pending transactions when a posted
  // transaction references its pending transaction ID.
  const pendingTxIdsToEvict = new Set<string>();
  uniqueTxs.forEach((t) => {
    if (!t.pending && t.pendingTransactionId) {
      pendingTxIdsToEvict.add(t.pendingTransactionId);
      // Do NOT copy the pending date — the posted transaction already has the correct
      // authorized_date (purchase date as shown in the bank app) from mapPlaidTransaction.
      // Overwriting it caused 1-3 day mismatches vs what the bank displays.
    }
  });

  let remainingTxs = uniqueTxs;
  if (pendingTxIdsToEvict.size > 0) {
    remainingTxs = remainingTxs.filter((t) => {
      if (!t.pending) return true; // keep all posted
      const matchesId = t.id && pendingTxIdsToEvict.has(t.id);
      const matchesPlaidId = t.plaidTransactionId && pendingTxIdsToEvict.has(t.plaidTransactionId);
      return !matchesId && !matchesPlaidId;
    });
  }

  // 3. Smart fuzzy matching: a posted transaction replaces an older pending transaction
  // within a +/- 3 days window, having exact same amount, account, and fuzzy title match.
  const postedTxs = remainingTxs.filter((t) => !t.pending);
  const pendingTxsToEvictFuzzy = new Set<string>();

  postedTxs.forEach((postedTx) => {
    remainingTxs.forEach((pendingTx) => {
      if (!pendingTx.pending) return;
      if (pendingTxsToEvictFuzzy.has(pendingTx.id)) return; // already marked for eviction

      const isReplaced = (
        pendingTx.accountId === postedTx.accountId &&
        Math.abs(pendingTx.amount - postedTx.amount) < 0.001 &&
        Math.abs(new Date(pendingTx.date).getTime() - new Date(postedTx.date).getTime()) / (1000 * 60 * 60 * 24) <= 3
      );

      if (isReplaced) {
        const oldTitle = (pendingTx.merchant || pendingTx.title || "").toLowerCase().trim();
        const newTitle = (postedTx.merchant || postedTx.title || "").toLowerCase().trim();
        const firstWord = (str: string) => str.split(/[^a-zA-Z0-9]/)[0] || "";

        const isTitleMatch =
          oldTitle.includes(newTitle) ||
          newTitle.includes(oldTitle) ||
          (firstWord(oldTitle).length >= 4 && firstWord(oldTitle) === firstWord(newTitle));

        if (isTitleMatch) {
          // Do NOT copy pending date — posted tx already has authorized_date (correct bank date).
          pendingTxsToEvictFuzzy.add(pendingTx.id); // evict old pending transaction
        }
      }
    });
  });

  if (pendingTxsToEvictFuzzy.size > 0) {
    remainingTxs = remainingTxs.filter((t) => !pendingTxsToEvictFuzzy.has(t.id));
  }

  // Final Pass: Re-deduplicate remaining transactions by content key to ensure that any date-modified
  // posted transactions (which copied a pending date and might now collide) are cleanly collapsed.
  const finalUnique = new Map<string, Transaction>();
  remainingTxs.forEach((t) => {
    const key = dedupKey(t);
    const existing = finalUnique.get(key);
    if (!existing) {
      finalUnique.set(key, t);
    } else {
      // Collision due to date update: keep the one with higher priority score
      const existingScore = getPriorityScore(existing);
      const currentScore = getPriorityScore(t);
      if (currentScore > existingScore) {
        finalUnique.set(key, t);
      }
    }
  });

  return Array.from(finalUnique.values()).sort((a, b) => b.date.localeCompare(a.date));
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
 * Evaluates if a transaction matches a rich rule.
 */
function matchesRichRule(tx: Transaction, payload: any): boolean {
  if (!payload || !payload.conditions) return false;
  const conds = payload.conditions;

  // 1. Original Statement
  if (conds.originalStatementEnabled) {
    const val = (conds.originalStatementValue || "").trim().toLowerCase();
    const title = (tx.title || "").toLowerCase();
    if (conds.originalStatementOperator === "exactly") {
      if (title !== val) return false;
    } else { // contains
      if (!title.includes(val)) return false;
    }
  }

  // 2. Merchant Name
  if (conds.merchantEnabled) {
    const val = (conds.merchantValue || "").trim().toLowerCase();
    const merchant = (tx.merchant || tx.title || "").toLowerCase();
    if (conds.merchantOperator === "exactly") {
      if (merchant !== val) return false;
    } else { // contains
      if (!merchant.includes(val)) return false;
    }
  }

  // 3. Amount
  if (conds.amountEnabled) {
    const amt = tx.amount;
    const type = conds.amountType; // "debit" | "credit" | "any"
    
    // debit = expense, credit = income
    if (type === "debit" && tx.type !== "expense") return false;
    if (type === "credit" && tx.type !== "income") return false;

    const op = conds.amountOperator;
    const val = Number(conds.amountValue);
    
    if (op === "equals") {
      if (Math.abs(amt - val) >= 0.01) return false;
    } else if (op === "greater_than") {
      if (amt <= val) return false;
    } else if (op === "less_than") {
      if (amt >= val) return false;
    } else if (op === "between") {
      const valTo = Number(conds.amountValueTo);
      if (amt < val || amt > valTo) return false;
    }
  }

  // 4. Categories
  if (conds.categoriesEnabled && Array.isArray(conds.categoriesList) && conds.categoriesList.length > 0) {
    if (!tx.category || !conds.categoriesList.includes(tx.category)) return false;
  }

  // 5. Accounts
  if (conds.accountsEnabled && Array.isArray(conds.accountsList) && conds.accountsList.length > 0) {
    if (!tx.accountId || !conds.accountsList.includes(tx.accountId)) return false;
  }

  return true;
}

/**
 * Applies actions of a matching rich rule to a transaction.
 * Returns an array of transactions (supports splits!).
 */
function applyRichRuleActions(tx: Transaction, payload: any): Transaction[] {
  if (!payload || !payload.actions) return [tx];
  const acts = payload.actions;

  // Exclusive OR option: Split transaction
  if (acts.splitTransactionEnabled && Array.isArray(acts.splitTransactionList) && acts.splitTransactionList.length > 0) {
    const splits = acts.splitTransactionList;
    const groupId = `split_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let remainingAmount = tx.amount;
    const results: Transaction[] = [];

    splits.forEach((split: any, index: number) => {
      let splitAmt = 0;
      if (split.percentage !== undefined && split.percentage !== null && !isNaN(Number(split.percentage))) {
        splitAmt = tx.amount * (Number(split.percentage) / 100);
      } else {
        splitAmt = tx.amount / splits.length;
      }

      splitAmt = Math.round(splitAmt * 100) / 100;

      if (index === splits.length - 1) {
        splitAmt = Math.round(remainingAmount * 100) / 100;
      } else {
        remainingAmount -= splitAmt;
      }

      // Notes and tags
      let builtNote = tx.note || "";
      if (acts.addTagsEnabled && acts.addTagsValue && acts.addTagsValue.trim()) {
        builtNote = [builtNote.trim(), `Tag: ${acts.addTagsValue.trim()}`].filter(Boolean).join(" · ");
      }

      const subTx: Transaction = {
        ...tx,
        id: tx.id + `_split_${index}`,
        amount: splitAmt,
        category: split.category || tx.category || "Others",
        splitGroupId: groupId,
        note: builtNote || undefined,
      };

      if (acts.renameMerchantEnabled && acts.renameMerchantValue && acts.renameMerchantValue.trim()) {
        subTx.merchant = acts.renameMerchantValue.trim();
        subTx.title = acts.renameMerchantValue.trim();
      }

      results.push(subTx);
    });

    return results;
  }

  // Regular actions
  let updatedTx = { ...tx };

  if (acts.renameMerchantEnabled && acts.renameMerchantValue && acts.renameMerchantValue.trim()) {
    updatedTx.merchant = acts.renameMerchantValue.trim();
    updatedTx.title = acts.renameMerchantValue.trim();
  }

  if (acts.updateCategoryEnabled && acts.updateCategoryValue && acts.updateCategoryValue.trim()) {
    updatedTx.category = acts.updateCategoryValue.trim();
  }

  if (acts.addTagsEnabled && acts.addTagsValue && acts.addTagsValue.trim()) {
    updatedTx.note = [updatedTx.note || "", `Tag: ${acts.addTagsValue.trim()}`].filter(Boolean).join(" · ");
  }

  if (acts.hideTransaction) {
    updatedTx.category = "Transfer";
  }

  // Handle Needs Review/Reviewed in notes
  if (acts.reviewStatusEnabled) {
    if (acts.reviewStatusValue === "needs_review") {
      updatedTx.fromEmail = true;
      updatedTx.note = [updatedTx.note || "", "needs_review"].filter(Boolean).join(" · ");
    } else if (acts.reviewStatusValue === "reviewed") {
      updatedTx.note = [updatedTx.note || "", "mark_reviewed"].filter(Boolean).join(" · ");
    }
  }

  return [updatedTx];
}

/**
 * Normalize an imported transaction: resolve accountId, apply category rules,
 * attach plaidItemId + plaidAccountId. Used by both email and Plaid paths.
 * Supports splitting rules by returning an array of transactions.
 */
function getLevenshteinDistance(a: string, b: string): number {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
}

function findClosestCategory(target: string, categories: Category[]): string {
  if (!target || categories.length === 0) return target || "Others";

  const cleanTarget = target.trim().toLowerCase();

  const subcats = categories.filter((c) => c.parentId !== null && c.parentId !== undefined);
  const parentCats = categories.filter((c) => c.parentId === null || c.parentId === undefined);

  // 1. Subcategory exact case-insensitive match
  const subExact = subcats.find((c) => c.name.trim().toLowerCase() === cleanTarget);
  if (subExact) return subExact.name;

  // 2. Subcategory substring/inclusion match
  const subSub = subcats.find((c) => {
    const name = c.name.trim().toLowerCase();
    return name.includes(cleanTarget) || cleanTarget.includes(name);
  });
  if (subSub) return subSub.name;

  // 3. Parent category exact case-insensitive match
  const parentExact = parentCats.find((c) => c.name.trim().toLowerCase() === cleanTarget);
  if (parentExact) return parentExact.name;

  // 4. Parent category substring/inclusion match
  const parentSub = parentCats.find((c) => {
    const name = c.name.trim().toLowerCase();
    return name.includes(cleanTarget) || cleanTarget.includes(name);
  });
  if (parentSub) return parentSub.name;

  // 5. Fuzzy distance in subcategories
  if (subcats.length > 0) {
    let closestSubName = subcats[0].name;
    let minSubDist = Infinity;
    for (const c of subcats) {
      const dist = getLevenshteinDistance(cleanTarget, c.name.trim().toLowerCase());
      if (dist < minSubDist) {
        minSubDist = dist;
        closestSubName = c.name.trim();
      }
    }
    if (minSubDist <= 4) {
      return closestSubName;
    }
  }

  // 6. Fuzzy distance in parent categories
  if (parentCats.length > 0) {
    let closestParentName = parentCats[0].name;
    let minParentDist = Infinity;
    for (const c of parentCats) {
      const dist = getLevenshteinDistance(cleanTarget, c.name.trim().toLowerCase());
      if (dist < minParentDist) {
        minParentDist = dist;
        closestParentName = c.name.trim();
      }
    }
    return closestParentName;
  }

  return target || "Others";
}

function normalizeImportedTxs(
  raw: Omit<Transaction, "id" | "accountId"> & { id?: string; accountId?: string },
  source: "plaid" | "email",
  accounts: Account[],
  categoryRules: CategoryRule[],
  categories: Category[],
  opts: {
    plaidAccMap?: Record<string, string>;
    plaidItemId?: string;
    fallbackAccountId?: string;
  } = {}
): Transaction[] {
  const id = raw.id ?? (Date.now().toString(36) + Math.random().toString(36).slice(2, 9));

  // 1. Resolve accountId
  const resolvedAccountId =
    resolveAccountId(
      source,
      accounts,
      { plaidAccountId: raw.plaidAccountId, bank: raw.bank, lastFour: undefined },
      opts.plaidAccMap
    ) || opts.fallbackAccountId || raw.accountId || "";

  const tx: Transaction = {
    ...raw,
    id,
    accountId: resolvedAccountId,
    category: raw.category || "Others",
    source,
    plaidItemId: opts.plaidItemId ?? raw.plaidItemId,
    plaidAccountId: raw.plaidAccountId,
  };

  // 2. Apply category rules (user-defined rules override source category)
  // Check rich rules first
  const richRules = categoryRules.filter(r => r.merchantPattern === "__rich_rule__");
  for (const rule of richRules) {
    try {
      const payload = JSON.parse(rule.merchantExact || "{}");
      if (matchesRichRule(tx, payload)) {
        return applyRichRuleActions(tx, payload);
      }
    } catch (e) {
      console.warn("Failed to parse rich rule payload", e);
    }
  }

  // Fallback to standard category rules
  const needle = (raw.merchant || raw.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  let category = tx.category;
  if (needle) {
    const stdRules = categoryRules.filter(r => r.merchantPattern !== "__rich_rule__");
    const exact = stdRules.find((r) => r.merchantPattern === needle);
    if (exact) {
      category = exact.category;
    } else {
      const partial = stdRules
        .filter((r) => needle.includes(r.merchantPattern) || r.merchantPattern.includes(needle))
        .sort((a, b) => b.hitCount - a.hitCount)[0];
      if (partial) category = partial.category;
    }
  }

  // Redesign: map the final category name to the closest existing category/subcategory name prioritizing subcategories
  category = findClosestCategory(category, categories);

  return [{ ...tx, category }];
}

/**
 * Backward compatibility wrapper returning a single transaction.
 */
function normalizeImportedTx(
  raw: Omit<Transaction, "id" | "accountId"> & { id?: string; accountId?: string },
  source: "plaid" | "email",
  accounts: Account[],
  categoryRules: CategoryRule[],
  categories: Category[],
  opts: {
    plaidAccMap?: Record<string, string>;
    plaidItemId?: string;
    fallbackAccountId?: string;
  } = {}
): Transaction {
  return normalizeImportedTxs(raw, source, accounts, categoryRules, categories, opts)[0];
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

const BILL_DETECT_KEY = "@fintrack/bill_detect_notified";

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
  const [rrspLimit, setRrspLimitState] = useState<number>(31560);
  const [isSyncing, setIsSyncing] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [deviceId, setDeviceId] = useState<string>("");
  const [householdId, setHouseholdId] = useState<string>("");
  const [userName, setUserNameState] = useState<string>("");
  const [reviewedTransactionIds, setReviewedTransactionIds] = useState<string[]>([]);
  const deviceIdRef = useRef<string>("");
  const householdIdRef = useRef<string>("");
  const accountsRef = useRef<Account[]>([]);
  const transactionsRef = useRef<Transaction[]>([]);
  const syncLockRef = useRef(false);
  const billsRef = useRef<Bill[]>([]);
  const budgetsRef = useRef<Budget[]>([]);
  const goalsRef = useRef<Goal[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const projectsRef = useRef<Project[]>([]);
  const holdingsRef = useRef<Holding[]>([]);
  const investmentTransactionsRef = useRef<InvestmentTransaction[]>([]);
  const categoryRulesRef = useRef<CategoryRule[]>([]);
  useEffect(() => { categoryRulesRef.current = categoryRules; }, [categoryRules]);
  const categoriesRef = useRef<Category[]>([]);
  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  const plaidSyncRef = useRef<PlaidSync>({ items: [] });
  useEffect(() => { plaidSyncRef.current = plaidSync; }, [plaidSync]);
  useEffect(() => { transactionsRef.current = transactions; }, [transactions]);
  useEffect(() => { billsRef.current = bills; }, [bills]);
  useEffect(() => { budgetsRef.current = budgets; }, [budgets]);
  useEffect(() => { goalsRef.current = goals; }, [goals]);
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);
  useEffect(() => { holdingsRef.current = holdings; }, [holdings]);
  useEffect(() => { investmentTransactionsRef.current = investmentTransactions; }, [investmentTransactions]);

  useEffect(() => {
    (async () => {
      try {
        const [storedVersion, txRaw, accRaw, billRaw, budgetRaw, goalRaw, projectRaw, catRaw, rulesRaw, emailRaw, plaidRaw, storedDeviceId, storedHouseholdId, storedUserName, storedReviewedIds, taskRaw, invTxRaw, holdRaw, rrspLimitRaw] =
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
            AsyncStorage.getItem(STORAGE_KEYS.rrspLimit),
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

        const localAccts: Account[] = accRaw ? JSON.parse(accRaw) : [];
        setAccounts(localAccts);

        const localTxs: Transaction[] = versionOk && txRaw ? JSON.parse(txRaw) : [];
        // Filter out orphaned transactions (account no longer exists) and
        // standard transactions that belong to investment accounts.
        const allLocalAcctIds = new Set(localAccts.map((a) => a.id));
        const investmentAcctIds = new Set(
          localAccts.filter((a) => a.type === "investment").map((a) => a.id)
        );
        const cleanedLocalTxs = localTxs.filter(
          (t) => allLocalAcctIds.has(t.accountId) && !investmentAcctIds.has(t.accountId)
        );
        
        // Strict de-duplication of local transactions before loading into memory
        const dedupedLocalTxs = upsertTransactions([], cleanedLocalTxs);
        setTransactions(dedupedLocalTxs);

        if (rrspLimitRaw) setRrspLimitState(Number(rrspLimitRaw));
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
            let d = parseLocalDate(b.dueDate);
            do { d = advanceBillDate(d, b.frequency!); } while (d.getTime() < Date.now());
            return { ...b, dueDate: toLocalYMD(d), isPaid: false };
          }
          return b;
        });
        setBills(migratedBills);
        setupNotificationsOnInit(migratedBills);
        registerPushTokenWithServer(getApiBase(), hId, dId);
        setBudgets(budgetRaw ? JSON.parse(budgetRaw) : []);
        setGoals(goalRaw ? JSON.parse(goalRaw) : []);
        const parsedTasks = taskRaw ? JSON.parse(taskRaw) : [];
        setTasks(parsedTasks);
        setupTaskNotificationsOnInit(parsedTasks);
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

        // ── Sequenced sync: pull server → merge → push diff ─────────────────
        // Pull FIRST so we know what the server already has, then only push
        // truly local-only transactions. This eliminates the race condition
        // that previously caused duplicates when push and pull ran concurrently.
        (async () => {
          try {
            const serverRes = await fetch(`${getApiBase()}/api/transactions`, {
              headers: { "X-Household-ID": hId, "X-Device-ID": dId },
              signal: AbortSignal.timeout(10000),
            });
            if (serverRes.ok) {
              const serverTxs: Transaction[] = await serverRes.json();
              // Build a set of server-known keys for fast lookup
              const serverIdSet = new Set(serverTxs.map((t) => t.id));
              const serverContentKeys = new Set(serverTxs.map(dedupKey));
              const serverPlaidIds = new Set(
                serverTxs.map((t) => t.plaidTransactionId).filter(Boolean)
              );

              // Merge server txs into local state
              if (serverTxs.length > 0) {
                setTransactions((prev) => upsertTransactions(prev, serverTxs));
              }

              // Compute the local-only diff: txs that the server doesn't have by any key
              const localOnly = dedupedLocalTxs.filter(
                (t) =>
                  !serverIdSet.has(t.id) &&
                  !serverContentKeys.has(dedupKey(t)) &&
                  !(t.plaidTransactionId && serverPlaidIds.has(t.plaidTransactionId))
              );

              // Push only the diff
              if (localOnly.length > 0) {
                fetch(`${getApiBase()}/api/transactions/bulk`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Household-ID": hId, "X-Device-ID": dId },
                  body: JSON.stringify({ transactions: localOnly }),
                }).catch(() => {});
              }
            } else {
              // Server unreachable — push all local txs as fallback (server dedup will handle it)
              if (dedupedLocalTxs.length > 0) {
                fetch(`${getApiBase()}/api/transactions/bulk`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Household-ID": hId, "X-Device-ID": dId },
                  body: JSON.stringify({ transactions: dedupedLocalTxs }),
                }).catch(() => {});
              }
            }
          } catch {
            // Network error — push all local as fallback
            if (dedupedLocalTxs.length > 0) {
              fetch(`${getApiBase()}/api/transactions/bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Household-ID": hId, "X-Device-ID": dId },
                body: JSON.stringify({ transactions: dedupedLocalTxs }),
              }).catch(() => {});
            }
          }
        })();

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

        // ── Background: pull all other data types from DB (ensures cross-device freshness) ──
        const hdrs = { "X-Household-ID": hId, "X-Device-ID": dId };
        const mergeById = <T extends { id: string }>(
          setter: React.Dispatch<React.SetStateAction<T[]>>,
          incoming: T[]
        ) => {
          if (!incoming.length) return;
          setter((prev) => {
            const byId = new Map(prev.map((r) => [r.id, r]));
            incoming.forEach((r) => byId.set(r.id, { ...byId.get(r.id), ...r }));
            return Array.from(byId.values());
          });
        };
        Promise.allSettled([
          fetch(`${getApiBase()}/api/plaid/items`, { headers: hdrs })
            .then(async (r) => { if (r.ok) { const items: PlaidItem[] = await r.json(); setPlaidSync({ items }); } }),
          fetch(`${getApiBase()}/api/bills`, { headers: hdrs })
            .then(async (r) => { if (r.ok) mergeById(setBills, await r.json()); }),
          fetch(`${getApiBase()}/api/budgets`, { headers: hdrs })
            .then(async (r) => { if (r.ok) mergeById(setBudgets, await r.json()); }),
          fetch(`${getApiBase()}/api/goals`, { headers: hdrs })
            .then(async (r) => { if (r.ok) mergeById(setGoals, await r.json()); }),
          fetch(`${getApiBase()}/api/tasks`, { headers: hdrs })
            .then(async (r) => { if (r.ok) mergeById(setTasks, await r.json()); }),
          fetch(`${getApiBase()}/api/projects`, { headers: hdrs })
            .then(async (r) => { if (r.ok) mergeById(setProjects, await r.json()); }),
        ]).catch(() => {});
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
  useEffect(() => { if (initialized) AsyncStorage.setItem(STORAGE_KEYS.rrspLimit, String(rrspLimit)); }, [rrspLimit, initialized]);

  // ── Auto backup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!initialized) return;
    const timer = setTimeout(async () => {
      try {
        const raw = await AsyncStorage.getItem("@fintrack/backup_settings");
        if (!raw) return;
        const settings = JSON.parse(raw);
        if (!settings.autoBackup) return;
        const pairs = await AsyncStorage.multiGet(Object.values(STORAGE_KEYS));
        const data: Record<string, string | null> = {};
        for (const [key, value] of pairs) data[key] = value;
        const backup = { version: 1, createdAt: new Date().toISOString(), appVersion: "1.0.0", data };
        const FileSystem = require("expo-file-system");
        await FileSystem.writeAsStringAsync(
          `${FileSystem.documentDirectory}fintrack-auto-backup.json`,
          JSON.stringify(backup),
        );
        await AsyncStorage.setItem("@fintrack/last_backup_date", new Date().toISOString());
      } catch {}
    }, 5000);
    return () => clearTimeout(timer);
  }, [transactions, accounts, bills, budgets, goals, projects, categories, categoryRules, tasks, initialized]);

  const setRrspLimit = useCallback((val: number) => {
    setRrspLimitState(val);
  }, []);

  const setUserName = useCallback((name: string) => {
    setUserNameState(name.trim());
  }, []);

  const markTransactionReviewed = useCallback((id: string) => {
    setReviewedTransactionIds((prev) => prev.includes(id) ? prev : [...prev, id]);
  }, []);

  const processReviewStatusForTransactions = useCallback((txs: Transaction[]) => {
    let changed = false;
    setReviewedTransactionIds((prev) => {
      let next = [...prev];
      txs.forEach((tx) => {
        if (tx.note?.includes("needs_review")) {
          if (next.includes(tx.id)) {
            next = next.filter((id) => id !== tx.id);
            changed = true;
          }
        } else if (tx.note?.includes("mark_reviewed")) {
          if (!next.includes(tx.id)) {
            next.push(tx.id);
            changed = true;
          }
        }
      });
      if (changed) {
        AsyncStorage.setItem(STORAGE_KEYS.reviewedTransactionIds, JSON.stringify(next)).catch(() => {});
        return next;
      }
      return prev;
    });
  }, []);

  const changeHouseholdId = useCallback(async (code: string) => {
    const normalized = code.trim().toUpperCase();
    householdIdRef.current = normalized;
    setHouseholdId(normalized);
    await AsyncStorage.setItem(STORAGE_KEYS.householdId, normalized);
    setTransactions([]);
    setAccounts([]);
    setBills([]);
    setBudgets([]);
    setGoals([]);
    setTasks([]);
    setProjects([]);
    setPlaidSync({ items: [] });
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.transactions),
      AsyncStorage.removeItem(STORAGE_KEYS.accounts),
      AsyncStorage.removeItem(STORAGE_KEYS.bills),
      AsyncStorage.removeItem(STORAGE_KEYS.budgets),
      AsyncStorage.removeItem(STORAGE_KEYS.goals),
      AsyncStorage.removeItem(STORAGE_KEYS.tasks),
      AsyncStorage.removeItem(STORAGE_KEYS.projects),
      AsyncStorage.removeItem(STORAGE_KEYS.plaidSync),
    ]);

    // Fetch ALL data types fresh from server for the new household
    const hId = normalized;
    const dId = deviceIdRef.current;
    const base = getApiBase();
    const hdrs = { "X-Household-ID": hId, "X-Device-ID": dId };
    const mergeById = <T extends { id: string }>(
      setter: React.Dispatch<React.SetStateAction<T[]>>,
      incoming: T[]
    ) => {
      if (!incoming.length) return;
      setter((prev) => {
        const byId = new Map(prev.map((r) => [r.id, r]));
        incoming.forEach((r) => byId.set(r.id, { ...byId.get(r.id), ...r }));
        return Array.from(byId.values());
      });
    };
    try {
      const [txRes, acctRes, plaidRes, billsRes, budgetsRes, goalsRes, tasksRes, projectsRes] = await Promise.all([
        fetch(`${base}/api/transactions`, { headers: hdrs }),
        fetch(`${base}/api/accounts`, { headers: hdrs }),
        fetch(`${base}/api/plaid/items`, { headers: hdrs }),
        fetch(`${base}/api/bills`, { headers: hdrs }),
        fetch(`${base}/api/budgets`, { headers: hdrs }),
        fetch(`${base}/api/goals`, { headers: hdrs }),
        fetch(`${base}/api/tasks`, { headers: hdrs }),
        fetch(`${base}/api/projects`, { headers: hdrs }),
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
      if (billsRes.ok) mergeById(setBills, await billsRes.json());
      if (budgetsRes.ok) mergeById(setBudgets, await budgetsRes.json());
      if (goalsRes.ok) mergeById(setGoals, await goalsRes.json());
      if (tasksRes.ok) mergeById(setTasks, await tasksRes.json());
      if (projectsRes.ok) mergeById(setProjects, await projectsRes.json());
    } catch {}
  }, []);

  // ── CRUD: Transactions ────────────────────────────────────────────────────
  const addTransaction = useCallback((t: Omit<Transaction, "id">) => {
    const newT: Transaction = { ...t, id: genId() };
    setTransactions((prev) => upsertTransactions(prev, [newT]));
    checkBudgetAndNotify([...transactionsRef.current, newT], budgetsRef.current);
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
      const now = new Date().toISOString();
      const next = prev.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: now } : t));
      mergedTx = next.find((t) => t.id === id);
      return next;
    });
    if (mergedTx) {
      checkBudgetAndNotify(
        transactionsRef.current.map((t) => (t.id === id ? mergedTx! : t)),
        budgetsRef.current
      );
    }
    apiCall(`/api/transactions/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteTransaction = useCallback((id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    checkBudgetAndNotify(transactionsRef.current.filter((t) => t.id !== id), budgetsRef.current);
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
    checkBudgetAndNotify(transactionsRef.current, [...budgetsRef.current, newB]);
    apiCall("/api/budgets", "POST", householdIdRef.current, deviceIdRef.current, { ...newB, householdId: householdIdRef.current, deviceId: deviceIdRef.current });
  }, []);

  const updateBudget = useCallback((id: string, updates: Partial<Budget>) => {
    const updatedBudgets = budgetsRef.current.map((b) => (b.id === id ? { ...b, ...updates } : b));
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates, updatedAt: new Date().toISOString() } : b)));
    checkBudgetAndNotify(transactionsRef.current, updatedBudgets);
    apiCall(`/api/budgets/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteBudget = useCallback((id: string) => {
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    apiCall(`/api/budgets/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Goals ───────────────────────────────────────────────────────────
  const addGoal = useCallback((g: Omit<Goal, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const newG: Goal = { ...g, id: genId(), createdAt: now, updatedAt: now };
    setGoals((prev) => [...prev, newG]);
    apiCall("/api/goals", "POST", householdIdRef.current, deviceIdRef.current, { ...newG, householdId: householdIdRef.current, deviceId: deviceIdRef.current });
  }, []);

  const updateGoal = useCallback((id: string, updates: Partial<Goal>) => {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...updates, updatedAt: new Date().toISOString() } : g)));
    apiCall(`/api/goals/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteGoal = useCallback((id: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== id));
    apiCall(`/api/goals/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current);
  }, []);

  // ── CRUD: Tasks ───────────────────────────────────────────────────────────
  const addTask = useCallback((t: Omit<Task, "id" | "createdAt" | "updatedAt">) => {
    const now = new Date().toISOString();
    const newT: Task = { ...t, id: genId(), createdAt: now, updatedAt: now };
    setTasks((prev) => [...prev, newT]);
    if (newT.reminderEnabled && newT.reminderDate)
      scheduleTaskReminder({ id: newT.id, title: newT.title, reminderDate: newT.reminderDate, notes: newT.notes });
    scheduleTaskDueNotification({ id: newT.id, title: newT.title, dueDate: newT.dueDate, notes: newT.notes });
    apiCall("/api/tasks", "POST", householdIdRef.current, deviceIdRef.current, { ...newT, householdId: householdIdRef.current, deviceId: deviceIdRef.current });
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t;
      const updated: Task = { ...t, ...updates, updatedAt: new Date().toISOString() };
      if (updated.reminderEnabled && updated.reminderDate)
        scheduleTaskReminder({ id: updated.id, title: updated.title, reminderDate: updated.reminderDate, notes: updated.notes });
      else cancelTaskReminder(id);
      scheduleTaskDueNotification({ id: updated.id, title: updated.title, dueDate: updated.dueDate, notes: updated.notes });
      return updated;
    }));
    apiCall(`/api/tasks/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    cancelTaskReminder(id);
    cancelTaskDueNotification(id);
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
    apiCall("/api/projects", "POST", householdIdRef.current, deviceIdRef.current, { ...created, householdId: householdIdRef.current, deviceId: deviceIdRef.current });
    return created.id;
  }, []);

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
    apiCall(`/api/projects/${id}`, "PUT", householdIdRef.current, deviceIdRef.current, updates);
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    setTransactions((prev) => prev.map((t) => (t.projectId === id ? { ...t, projectId: undefined, projectName: undefined } : t)));
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

  // ── Add or edit a user-defined category mapping rule ────────────────────
  const addCategoryMappingRule = useCallback((
    rule: { id?: string; merchantPattern?: string; merchantExact?: string; fromCategory?: string | null; category: string; applyScope: "future" | "past_and_future"; source?: "manual" | "learned" }
  ) => {
    const now = new Date().toISOString();
    const isUpdate = !!rule.id;
    const ruleId = rule.id ?? genId();
    
    // Find existing rule if updating to preserve createdAt
    const existingRule = isUpdate ? categoryRulesRef.current.find(r => r.id === ruleId) : null;

    const newRule: CategoryRule = {
      id: ruleId,
      householdId: householdIdRef.current,
      merchantPattern: rule.merchantPattern ?? "",
      merchantExact: rule.merchantExact ?? null,
      fromCategory: rule.fromCategory ?? null,
      category: rule.category,
      hitCount: existingRule ? existingRule.hitCount : 1,
      source: rule.source ?? "manual",
      applyScope: rule.applyScope,
      createdAt: existingRule ? existingRule.createdAt : now,
      updatedAt: now,
    };

    setCategoryRules((prev) => {
      const next = isUpdate 
        ? prev.map(r => r.id === ruleId ? newRule : r)
        : [...prev, newRule];
      AsyncStorage.setItem(STORAGE_KEYS.categoryRules, JSON.stringify(next)).catch(() => {});
      return next;
    });

    if (isUpdate) {
      bgCall(`/api/category-rules/${ruleId}`, "PUT", householdIdRef.current, deviceIdRef.current, {
        merchantPattern: newRule.merchantPattern,
        merchantExact: newRule.merchantExact,
        fromCategory: newRule.fromCategory,
        category: newRule.category,
        hitCount: newRule.hitCount,
        source: newRule.source,
        applyScope: newRule.applyScope,
      });
    } else {
      bgCall("/api/category-rules", "POST", householdIdRef.current, deviceIdRef.current, newRule);
    }

    if (rule.applyScope === "past_and_future") {
      setTransactions((prev) => {
        const next: Transaction[] = [];
        const toDelete: string[] = [];
        const toAdd: Transaction[] = [];

        prev.forEach((tx) => {
          if (rule.merchantPattern === "__rich_rule__") {
            try {
              const payload = JSON.parse(rule.merchantExact || "{}");
              if (matchesRichRule(tx, payload)) {
                const results = applyRichRuleActions(tx, payload);
                results.forEach((res) => {
                  next.push(res);
                  if (res.id !== tx.id) {
                    toAdd.push(res);
                  }
                });
                if (results.length > 1 || results[0].id !== tx.id) {
                  toDelete.push(tx.id);
                }
              } else {
                next.push(tx);
              }
            } catch (e) {
              next.push(tx);
            }
          } else {
            // Standard category rules
            const pattern = rule.merchantPattern ?? "";
            if (rule.fromCategory && tx.category !== rule.fromCategory) {
              next.push(tx);
              return;
            }
            if (pattern) {
              const needle = (tx.merchant || tx.title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
              if (!needle.includes(pattern) && !pattern.includes(needle)) {
                next.push(tx);
                return;
              }
            }
            next.push({ ...tx, category: rule.category });
          }
        });

        // Sync local storage
        AsyncStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(next)).catch(() => {});

        // Sync splits/updates to server database
        if (toDelete.length > 0) {
          toDelete.forEach((id) => bgCall(`/api/transactions/${id}`, "DELETE", householdIdRef.current, deviceIdRef.current));
        }
        if (toAdd.length > 0) {
          toAdd.forEach((t) => bgCall("/api/transactions", "POST", householdIdRef.current, deviceIdRef.current, t));
        }
        if (rule.merchantPattern === "__rich_rule__") {
          next.forEach((tx) => {
            const original = prev.find((o) => o.id === tx.id);
            if (original && JSON.stringify(original) !== JSON.stringify(tx) && !toDelete.includes(tx.id)) {
              bgCall(`/api/transactions/${tx.id}`, "PUT", householdIdRef.current, deviceIdRef.current, tx);
            }
          });
        }

        // Handle review status side effects for retroactive application!
        processReviewStatusForTransactions(next);

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
        setEmailSync({ email, appPassword, isConnected: true, syncTransactions: false, lastSynced: undefined });
        return { success: true };
      } catch {
        return { success: false, error: "Network error. Make sure the app is connected." };
      }
    },
    []
  );

  const updateEmailSyncSettings = useCallback((settings: Partial<EmailSync>) => {
    setEmailSync((prev) => ({ ...prev, ...settings }));
  }, []);

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
            if (set.has("expenses") && t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer") return false;
            if (set.has("income") && t.type === "income" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer") return false;
            if (set.has("transfers") && (t.category === "Transfer" || t.category?.toLowerCase() === "transfer")) return false;
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
    if (syncLockRef.current) {
      return { imported: 0, error: "Sync already in progress..." };
    }
    syncLockRef.current = true;
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
        ? data.transactions.flatMap((t: any) =>
            normalizeImportedTxs(
              { ...t, id: t.id || genId(), fromEmail: true },
              "email",
              currentAccts,
              rules,
              categoriesRef.current
            )
          )
        : [];

      // Count truly new entries (didn't already exist in the store in any form)
      let actuallyNew = 0;
      if (importedTransactions.length > 0) {
        const prevKeys = new Set(transactionsRef.current.map(dedupKey));
        actuallyNew = importedTransactions.filter((t) => !prevKeys.has(dedupKey(t))).length;
        setTransactions((prev) => upsertTransactions(prev, importedTransactions));
        processReviewStatusForTransactions(importedTransactions);
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
      syncLockRef.current = false;
      return { imported: actuallyNew, parsed: Array.isArray(data.parsed) ? data.parsed : [] };
    } catch {
      setIsSyncing(false);
      syncLockRef.current = false;
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
      const txsToAdd: Transaction[] = initialTransactions.flatMap((t) =>
        normalizeImportedTxs(
          { ...t, id: (t as any).plaidTransactionId || genId() },
          "plaid",
          current,
          rules,
          categoriesRef.current,
          { plaidAccMap, plaidItemId: item.itemId, fallbackAccountId: fallbackId }
        )
      );

      const existingKeys = new Set(transactionsRef.current.map(dedupKey));
      const freshToAdd = txsToAdd.filter((t) => !existingKeys.has(dedupKey(t)));
      imported = freshToAdd.length;
      setTransactions((prev) => upsertTransactions(prev, freshToAdd));
      processReviewStatusForTransactions(freshToAdd);

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
    async (itemId: string, forceFullSync = false): Promise<{ imported: number; importedTransactions?: Transaction[]; error?: string }> => {
      const item = plaidSync.items.find((i) => i.itemId === itemId);
      if (!item) return { imported: 0, error: "Bank not found" };

      if (syncLockRef.current) {
        return { imported: 0, error: "Sync already in progress..." };
      }
      syncLockRef.current = true;
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
          syncLockRef.current = false;
          const netErr = "Network error. Could not reach server.";
          setPlaidSync((prev) => ({
            items: prev.items.map((i) =>
              i.itemId === itemId ? { ...i, syncError: netErr, needsRelogin: false } : i
            ),
          }));
          return { imported: 0, error: netErr };
        }

        const data = await res.json();

        if (!res.ok) {
          setIsSyncing(false);
          syncLockRef.current = false;
          const errMsg: string = data.error ?? "Sync failed";
          const loginRequired = /login.required|item.login|ITEM_LOGIN_REQUIRED/i.test(errMsg);
          setPlaidSync((prev) => ({
            items: prev.items.map((i) =>
              i.itemId === itemId
                ? { ...i, syncError: loginRequired ? undefined : errMsg, needsRelogin: loginRequired }
                : i
            ),
          }));
          return { imported: 0, error: errMsg };
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

        // Pre-compute fresh transactions BEFORE setTransactions so `imported` is set
        // synchronously — React 18 updater callbacks run asynchronously so any value
        // set inside the updater is still 0 when `return { imported }` executes.
        let precomputedFresh: Transaction[] = [];
        if (Array.isArray(data.transactions) && data.transactions.length > 0) {
          const fallbackId = Object.values(plaidAccMap)[0] ?? "";
          
          // Build list of existing pending transactions to preserve their original creation dates
          const existingPending = transactionsRef.current.filter((t) => t.pending);

          const candidates = (data.transactions as any[]).flatMap((t) => {
            let targetDate = t.date;
            
            // If the transaction from Plaid is posted, check if it replaces an existing pending one
            if (!t.pending) {
              const matchedPending = existingPending.find((old) => {
                // Direct pending transaction ID match
                if (t.pending_transaction_id && (old.id === t.pending_transaction_id || old.plaidTransactionId === t.pending_transaction_id)) {
                  return true;
                }
                // Fallback fuzzy match: same account, same amount, +/- 3 days date difference
                if (old.accountId === plaidAccMap[t.account_id] && Math.abs(old.amount - Math.abs(t.amount)) < 0.001) {
                  const oldD = new Date(old.date);
                  const newD = new Date(t.authorized_date ?? t.date);
                  const diffDays = Math.abs(newD.getTime() - oldD.getTime()) / (1000 * 60 * 60 * 24);
                  if (diffDays <= 3) {
                    const oldTitle = (old.merchant || old.title || "").toLowerCase().trim();
                    const newTitle = (t.merchant_name || t.name || "").toLowerCase().trim();
                    const firstWord = (str: string) => str.split(/[^a-zA-Z0-9]/)[0] || "";
                    return oldTitle.includes(newTitle) || newTitle.includes(oldTitle) || (firstWord(oldTitle).length >= 4 && firstWord(oldTitle) === firstWord(newTitle));
                  }
                }
                return false;
              });

              if (matchedPending) {
                targetDate = matchedPending.date; // Use original pending transaction date
              }
            }

            return normalizeImportedTxs(
              { ...t, date: targetDate, id: t.plaidTransactionId || undefined },
              "plaid",
              plaidAccounts,
              rules,
              categoriesRef.current,
              { plaidAccMap, plaidItemId: itemId, fallbackAccountId: fallbackId }
            );
          });
          const currentKeys = new Set(transactionsRef.current.map(dedupKey));
          const currentIds = new Set(transactionsRef.current.map((t) => t.id).filter(Boolean));
          const currentPlaidIds = new Set(transactionsRef.current.map((t) => t.plaidTransactionId).filter(Boolean));

          precomputedFresh = candidates.filter(
            (t) =>
              !currentKeys.has(dedupKey(t)) &&
              !currentIds.has(t.id) &&
              !(t.plaidTransactionId && currentPlaidIds.has(t.plaidTransactionId))
          );
          imported = precomputedFresh.length;

          if (precomputedFresh.length > 0) {
            bgCall("/api/transactions/bulk", "POST", householdIdRef.current, deviceIdRef.current, { transactions: precomputedFresh });
            processReviewStatusForTransactions(precomputedFresh);
          }
        }

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

          // 2. Merge precomputed fresh transactions (re-filter against remapped for accuracy)
          const remappedKeys = new Set(remapped.map(dedupKey));
          const fresh = precomputedFresh.filter((t) => !remappedKeys.has(dedupKey(t)));

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
              ? { ...i, lastSynced: new Date().toISOString(), lastImported: imported, syncError: undefined, needsRelogin: false }
              : i
          ),
        }));
        setIsSyncing(false);
        syncLockRef.current = false;
        return { imported, importedTransactions: precomputedFresh };
      } catch {
        setIsSyncing(false);
        syncLockRef.current = false;
        const errMsg = "Sync failed unexpectedly";
        setPlaidSync((prev) => ({
          items: prev.items.map((i) =>
            i.itemId === itemId ? { ...i, syncError: errMsg, needsRelogin: false } : i
          ),
        }));
        return { imported: 0, error: errMsg };
      }
    },
    [plaidSync, accounts]
  );

  // ── Auto-sync ref (always latest version) ─────────────────────────────────
  const syncPlaidTransactionsRef = useRef(syncPlaidTransactions);
  useEffect(() => { syncPlaidTransactionsRef.current = syncPlaidTransactions; }, [syncPlaidTransactions]);
  const markBillPaidRef = useRef(markBillPaid);
  useEffect(() => { markBillPaidRef.current = markBillPaid; }, [markBillPaid]);

  // ── Auto-sync every 3 hours, and on app foreground ─────────────────────────
  const isAutoSyncingRef = useRef(false);
  const lastAutoSyncRef = useRef<number>(0);
  const lastBillCheckRef = useRef<number>(0);
  const lastDbPullRef = useRef<number>(0);
  useEffect(() => {
    const THREE_HOURS = 3 * 60 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;

    const checkBills = async () => {
      const now = Date.now();
      if (now - lastBillCheckRef.current < ONE_HOUR) return;
      lastBillCheckRef.current = now;
      try { await setupNotificationsOnInit(billsRef.current); } catch { /* ignore */ }
      await detectBillPayments();
    };

    const detectBillPayments = async () => {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const bills = billsRef.current;
      const txs = transactionsRef.current;
      let notified: Record<string, boolean> = {};
      try {
        const raw = await AsyncStorage.getItem(BILL_DETECT_KEY);
        if (raw) notified = JSON.parse(raw);
      } catch {}
      let dirty = false;
      for (const bill of bills) {
        if (bill.isPaid) continue;
        const due = parseLocalDate(bill.dueDate); due.setHours(0, 0, 0, 0);
        const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
        if (diffDays > 3 || diffDays < -3) continue;
        const key = `${bill.id}|${bill.dueDate.slice(0, 10)}`;
        if (notified[key]) continue;
        const WINDOW = 3 * 86400000;
        const match = txs.find((t) => {
          if (t.type !== "expense") return false;
          const td = parseLocalDate(t.date); td.setHours(0, 0, 0, 0);
          if (Math.abs(td.getTime() - due.getTime()) > WINDOW) return false;
          if (bill.accountId && t.accountId !== bill.accountId) return false;
          return t.amount === bill.amount;
        });
        notified[key] = true;
        dirty = true;
        if (match) {
          markBillPaidRef.current(bill.id);
          const paidDate = parseLocalDate(match.date); paidDate.setHours(0, 0, 0, 0);
          const paidLate = paidDate.getTime() > due.getTime();
          const daysLate = paidLate ? Math.round((paidDate.getTime() - due.getTime()) / 86400000) : 0;
          fireImmediateNotification(
            paidLate ? "✅ Bill Paid (Late)" : "✅ Bill Paid",
            paidLate
              ? `${bill.title} ($${bill.amount.toFixed(2)}) paid ${daysLate} day${daysLate !== 1 ? "s" : ""} late — you may have been charged interest or late fees.`
              : `${bill.title} ($${bill.amount.toFixed(2)}) — a matching payment was found.`,
            { billId: bill.id, type: paidLate ? "auto_paid_late" : "auto_paid" }
          );
        } else if (diffDays <= 0) {
          const ago = diffDays === 0 ? "today" : `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""} ago`;
          fireImmediateNotification(
            "⚠️ Bill May Be Unpaid",
            `${bill.title} ($${bill.amount.toFixed(2)}) was due ${ago} — no matching payment found.`,
            { billId: bill.id, type: "unpaid_warning" }
          );
        }
      }
      if (dirty) {
        try { await AsyncStorage.setItem(BILL_DETECT_KEY, JSON.stringify(notified)); } catch {}
      }
    };

    const doAutoSync = async () => {
      if (isAutoSyncingRef.current) return;
      const now = Date.now();
      if (now - lastAutoSyncRef.current < THREE_HOURS) return;
      const items = plaidSyncRef.current.items;
      isAutoSyncingRef.current = true;
      lastAutoSyncRef.current = now;
      for (const item of items) {
        try { await syncPlaidTransactionsRef.current(item.itemId); } catch { /* ignore */ }
      }
      isAutoSyncingRef.current = false;
    };

    const FIVE_MINUTES = 5 * 60 * 1000;
    const pullAllFromDb = () => {
      const now = Date.now();
      if (now - lastDbPullRef.current < FIVE_MINUTES) return;
      lastDbPullRef.current = now;
      const hId = householdIdRef.current;
      const dId = deviceIdRef.current;
      if (!hId) return;
      const hdrs = { "X-Household-ID": hId, "X-Device-ID": dId };
      const merge = <T extends { id: string }>(
        setter: React.Dispatch<React.SetStateAction<T[]>>,
        incoming: T[]
      ) => {
        if (!incoming.length) return;
        setter((prev) => {
          const byId = new Map(prev.map((r) => [r.id, r]));
          incoming.forEach((r) => byId.set(r.id, { ...byId.get(r.id), ...r }));
          return Array.from(byId.values());
        });
      };
      const base = getApiBase();
      Promise.allSettled([
        fetch(`${base}/api/plaid/items`, { headers: hdrs })
          .then(async (r) => { if (r.ok) { const items: PlaidItem[] = await r.json(); setPlaidSync({ items }); } }),
        fetch(`${base}/api/bills`, { headers: hdrs })
          .then(async (r) => { if (r.ok) merge(setBills, await r.json()); }),
        fetch(`${base}/api/budgets`, { headers: hdrs })
          .then(async (r) => { if (r.ok) merge(setBudgets, await r.json()); }),
        fetch(`${base}/api/goals`, { headers: hdrs })
          .then(async (r) => { if (r.ok) merge(setGoals, await r.json()); }),
        fetch(`${base}/api/tasks`, { headers: hdrs })
          .then(async (r) => { if (r.ok) merge(setTasks, await r.json()); }),
        fetch(`${base}/api/projects`, { headers: hdrs })
          .then(async (r) => { if (r.ok) merge(setProjects, await r.json()); }),
      ]).catch(() => {});
    };

    const onForeground = () => {
      checkBills();
      doAutoSync();
      pullAllFromDb();
    };

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") onForeground();
    });
    const intervalId = setInterval(() => { checkBills(); doAutoSync(); }, THREE_HOURS);
    return () => { sub.remove(); clearInterval(intervalId); };
  }, []);

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
  // Use plain YYYY-MM-DD so string comparison works with stored transaction dates.
  // new Date(...).toISOString() gives "2026-05-01T04:00:00.000Z" (UTC offset),
  // which makes "2026-05-01" < "2026-05-01T04:..." causing 1st-of-month transactions
  // to be silently excluded.
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const thisMonthTx = transactions.filter((t) => t.date >= monthStart);
  const monthlyIncome = thisMonthTx.filter((t) => t.type === "income" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer").reduce((s, t) => s + t.amount, 0);
  const monthlyExpense = thisMonthTx.filter((t) => t.type === "expense" && t.category !== "Transfer" && t.category?.toLowerCase() !== "transfer").reduce((s, t) => s + t.amount, 0);
  const isLiabilityAccount = (a: Account) => {
    if (["credit", "mortgage", "loan"].includes(a.type ?? "")) return true;
    const text = `${a.name} ${a.bank}`.toLowerCase();
    return text.includes("mortgage") || text.includes("loan") || text.includes("lending") || text.includes("borrow");
  };
  const totalBalance = accounts
    .filter(isIncludedInNetworth)
    .reduce((s, a) => {
      const bal = computeBalance(a, transactions);
      return isLiabilityAccount(a) ? s - Math.abs(bal) : s + bal;
    }, 0);

  return (
    <AppContext.Provider
      value={{
        transactions, accounts, bills, budgets, goals, projects, categories, categoryRules, emailSync, plaidSync,
        investmentTransactions, holdings, rrspLimit, setRrspLimit,
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
        connectEmail, updateEmailSyncSettings, disconnectEmail, resetEmailTransactions, syncEmailTransactions, wipeAllTransactions, wipePortfolio, wipeData,
        connectPlaid, syncPlaidTransactions, delinkPlaid, disconnectPlaid,
        // investmentTransactions + holdings already exposed above
        isSyncing, totalBalance, monthlyIncome, monthlyExpense,
        deviceId, householdId, changeHouseholdId,
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

